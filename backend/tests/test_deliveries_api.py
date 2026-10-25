"""Driver job endpoint tests that need no database (docs/api/deliveries.md).

Session lookup and the deliveries service are replaced with in-memory fakes,
so these cover roles (FR-001), CSRF, request validation, status codes and
what the responses reveal (no receiver before acceptance, never a code).
Database behaviour is in test_deliveries_integration.py.
"""

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.auth import security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.deliveries import service
from app.modules.deliveries.models import (
    DeliveryCode,
    ExceptionCategory,
    HoldKind,
    OrderException,
    SmsStatus,
)
from app.modules.dispatch.models import Assignment, AssignmentStatus
from app.modules.orders.models import Order, OrderStatus
from app.modules.payments import service as payments_service
from app.modules.sources.models import WaterSource

NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)
REFERENCE = "MO-7KQ2M9XH4T"
USERS = {
    role: User(
        id=uuid.uuid4(),
        name=f"Sample {role.value}",
        phone="+2348000000001",
        password_hash="x",
        role=role,
    )
    for role in UserRole
}

JOB = f"/api/v1/driver/jobs/{REFERENCE}"
ENDPOINTS: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/v1/driver/jobs", None),
    ("GET", JOB, None),
    ("POST", f"{JOB}/decline", {"reason": "too_far"}),
    (
        "POST",
        f"{JOB}/pickup",
        {
            "source": {"assigned": True},
            "volume_collected_litres": 1000,
            "picked_up_at": "2026-10-19T08:20:00Z",
            "safety_concern": False,
        },
    ),
    ("POST", f"{JOB}/delivery-code", None),
    ("POST", f"{JOB}/incidents", {"type": "running_late"}),
    # Part 2 (#51, built in #75).
    ("POST", f"{JOB}/accept", None),
    ("POST", f"{JOB}/transition", {"to": "departed"}),
    ("POST", f"{JOB}/arrive", {}),
    ("POST", f"{JOB}/contact-attempts", None),
    ("POST", f"{JOB}/unloading-complete", None),
    (
        "POST",
        f"{JOB}/proof",
        {"delivered_litres": 1200, "unloading_confirmed": True, "delivery_code": "482913"},
    ),
]
PROOF = {"delivered_litres": 1200, "unloading_confirmed": True, "delivery_code": "482913"}


def make_job(
    assignment_status: AssignmentStatus = AssignmentStatus.ACCEPTED,
    order_status: OrderStatus = OrderStatus.ARRIVED,
    *,
    hold: OrderException | None = None,
) -> service.DriverJob:
    order = Order(
        id=uuid.uuid4(),
        reference=REFERENCE,
        status=order_status,
        quantity_litres=1200,
        contact_name="Ngozi Adeyemi",
        contact_phone="+2348000000001",
        delivery_address="12 Sample Close, Independence Layout, Enugu",
        landmark="Opposite the blue gate",
        delivery_instructions="Narrow gate",
        delivery_window_start_at=NOW,
        delivery_window_end_at=NOW + timedelta(hours=3),
        is_simulated=True,
    )
    source = WaterSource(
        id=uuid.uuid4(), name="Sample Borehole A", approximate_location="Near the market"
    )
    code = DeliveryCode(
        order_id=order.id,
        code_hash="f" * 64,
        issued_at=NOW,
        expires_at=NOW + timedelta(minutes=10),
        attempts=1,
        sms_status=SmsStatus.ACCEPTED,
        issued_by=USERS[UserRole.DRIVER].id,
    )
    assignment = Assignment(
        id=uuid.uuid4(),
        order_id=order.id,
        driver_user_id=USERS[UserRole.DRIVER].id,
        status=assignment_status,
        offered_by=USERS[UserRole.ADMIN].id,
        created_at=NOW - timedelta(hours=1),
    )
    job_status = service.job_status_for(assignment, order)
    return service.DriverJob(
        assignment=assignment,
        order=order,
        source=source,
        job_status=job_status,
        section=service.JobSection.TODAY,
        hold=hold,
        ended_at=None,
        end_reason=None,
        pickup=None,
        arrived_at=NOW,
        delivery_code=code,
        allowed_actions=[service.JobAction.REPORT_INCIDENT],
    )


class FakeDeliveries:
    """Records service calls and returns canned results."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.job = make_job()
        self.error: APIError | None = None
        self.hold: OrderException | None = None
        self.recorded = True  # unloading complete: False for a repeat
        self.delivered = True  # proof: False for alternative proof

    def _record(self, name: str, kwargs: dict[str, Any]) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def list_driver_jobs(self, _: object, **kwargs: Any) -> service.DriverJobList:
        self._record("list_driver_jobs", kwargs)
        return service.DriverJobList(offers=[], today=[self.job], upcoming=[], done=[])

    async def get_driver_job(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("get_driver_job", kwargs)
        return self.job

    async def decline_offer(self, _: object, **kwargs: Any) -> None:
        self._record("decline_offer", kwargs)

    async def record_pickup(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("record_pickup", kwargs)
        return self.job

    async def issue_new_delivery_code(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("issue_new_delivery_code", kwargs)
        return self.job

    async def report_incident(
        self, _: object, **kwargs: Any
    ) -> tuple[OrderException, OrderException | None]:
        self._record("report_incident", kwargs)
        incident = kwargs["incident"]
        exception = OrderException(
            id=uuid.uuid4(),
            category=incident.category,
            note=incident.note,
            new_estimated_arrival_at=incident.new_estimated_arrival_at,
            created_at=NOW,
        )
        return exception, self.hold

    async def accept_offer(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("accept_offer", kwargs)
        return self.job

    async def take_step(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("take_step", kwargs)
        return self.job

    async def arrive(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("arrive", kwargs)
        return self.job

    async def record_contact_attempt(self, _: object, **kwargs: Any) -> service.DriverJob:
        self._record("record_contact_attempt", kwargs)
        return self.job

    async def complete_unloading(self, _: object, **kwargs: Any) -> tuple[service.DriverJob, bool]:
        self._record("complete_unloading", kwargs)
        return self.job, self.recorded

    async def submit_proof(self, _: object, **kwargs: Any) -> tuple[service.DriverJob, bool]:
        self._record("submit_proof", kwargs)
        return self.job, self.delivered


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeDeliveries:
    fake = FakeDeliveries()
    for name in (
        "list_driver_jobs",
        "get_driver_job",
        "decline_offer",
        "record_pickup",
        "issue_new_delivery_code",
        "report_incident",
        "accept_offer",
        "take_step",
        "arrive",
        "record_contact_attempt",
        "complete_unloading",
        "submit_proof",
    ):
        monkeypatch.setattr(service, name, getattr(fake, name))

    async def no_cash(*_args: object, **_kwargs: object) -> dict[object, object]:
        # The Cash card is the payments module's (test_payments_api.py).
        return {}

    monkeypatch.setattr(payments_service, "cash_for_jobs", no_cash)
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: FakeDeliveries) -> TestClient:
    """Client whose session cookie value names the signed-in role."""

    async def lookup(_: object, token: str) -> auth_service.AuthenticatedSession | None:
        try:
            user = USERS[UserRole(token)]
        except ValueError:
            return None
        user_session = UserSession(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash="x",
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
        return auth_service.AuthenticatedSession(user=user, session=user_session, token=token)

    monkeypatch.setattr(auth_service, "get_authenticated_session", lookup)
    return client


def sign_in(client: TestClient, role: UserRole) -> dict[str, str]:
    client.cookies.set(SESSION_COOKIE_NAME, role.value)
    secret = get_settings().session_secret.get_secret_value()
    return {CSRF_HEADER_NAME: security.csrf_token_for(role.value, secret)}


def call(
    client: TestClient, method: str, path: str, body: dict[str, Any] | None, headers: dict[str, str]
) -> Any:
    if method == "POST":
        return client.post(path, json=body, headers=headers)
    return client.get(path, headers=headers)


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


def driver_post(api: TestClient, path: str, body: dict[str, Any] | None) -> Any:
    return api.post(path, json=body, headers=sign_in(api, UserRole.DRIVER))


# --- Authentication and roles (FR-001) -----------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_signed_out_requests_are_not_authenticated(
    api: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = call(api, method, path, body, {})
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.ADMIN])
@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_t07_only_drivers_may_use_driver_endpoints(
    api: TestClient, role: UserRole, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = call(api, method, path, body, sign_in(api, role))
    assert response.status_code == 403
    assert error_code(response) == "forbidden"


@pytest.mark.parametrize(("method", "path", "body"), [e for e in ENDPOINTS if e[0] == "POST"])
def test_posts_require_csrf_token(
    api: TestClient, fake: FakeDeliveries, method: str, path: str, body: dict[str, Any] | None
) -> None:
    sign_in(api, UserRole.DRIVER)
    response = api.post(path, json=body)
    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert fake.calls == []


def test_service_is_called_with_the_signed_in_driver(api: TestClient, fake: FakeDeliveries) -> None:
    headers = sign_in(api, UserRole.DRIVER)
    api.get(JOB, headers=headers)
    api.post(f"{JOB}/decline", json={"reason": "too_far"}, headers=headers)
    assert fake.calls[0][1]["driver_id"] == USERS[UserRole.DRIVER].id
    assert fake.calls[0][1]["reference"] == REFERENCE
    assert fake.calls[1][1]["driver"] is USERS[UserRole.DRIVER]
    assert fake.calls[1][1]["reference"] == REFERENCE


def test_order_not_found_uses_the_error_envelope(api: TestClient, fake: FakeDeliveries) -> None:
    # T-07: another driver's job and a job no longer held look like a missing order.
    fake.error = APIError(404, "order_not_found", "Order not found")
    response = api.get(JOB, headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 404
    assert error_code(response) == "order_not_found"


# --- Responses -------------------------------------------------------------------


def test_list_returns_the_four_groups(api: TestClient) -> None:
    response = api.get("/api/v1/driver/jobs", headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"offers", "today", "upcoming", "done", "generated_at"}
    assert body["today"][0]["order_reference"] == REFERENCE
    assert body["today"][0]["offered_at"] == "2026-10-19T08:00:00Z"
    assert "id" not in body["today"][0]
    assert body["today"][0]["delivery_area"] == "12 Sample Close, Independence Layout, Enugu"
    assert "receiver" not in body["today"][0]


def test_detail_never_contains_the_delivery_code_or_its_hash(api: TestClient) -> None:
    body = api.get(JOB, headers=sign_in(api, UserRole.DRIVER)).json()
    assert body["delivery_code"] == {
        "issued_at": "2026-10-19T09:00:00Z",
        "expires_at": "2026-10-19T09:10:00Z",
        "attempts_left": 4,
        "sms_status": "accepted",
    }
    assert "f" * 64 not in str(body)


def test_accepted_job_shows_the_short_receiver_name_and_phone(api: TestClient) -> None:
    body = api.get(JOB, headers=sign_in(api, UserRole.DRIVER)).json()
    assert body["receiver"] == {"display_name": "Ngozi A.", "phone": "+2348000000001"}
    assert body["source"]["name"] == "Sample Borehole A"


def test_offer_hides_the_receiver_until_accepted(api: TestClient, fake: FakeDeliveries) -> None:
    # FR-032: the driver gets name and phone only after accepting.
    fake.job = make_job(AssignmentStatus.OFFERED, OrderStatus.ASSIGNED)
    body = api.get(JOB, headers=sign_in(api, UserRole.DRIVER)).json()
    assert body["receiver"] is None
    assert body["delivery_code"] is None
    assert body["delivery_instructions"] == "Narrow gate"


@pytest.mark.parametrize(
    ("assignment_status", "order_status"),
    [
        (AssignmentStatus.COMPLETED, OrderStatus.DELIVERED),
        (AssignmentStatus.ACCEPTED, OrderStatus.FAILED),
    ],
)
def test_completed_job_hides_receiver_and_code(
    api: TestClient,
    fake: FakeDeliveries,
    assignment_status: AssignmentStatus,
    order_status: OrderStatus,
) -> None:
    fake.job = make_job(assignment_status, order_status)
    body = api.get(JOB, headers=sign_in(api, UserRole.DRIVER)).json()
    assert body["job_status"] == "completed"
    assert body["receiver"] is None
    assert body["delivery_code"] is None


def test_hold_is_returned_with_its_message(api: TestClient, fake: FakeDeliveries) -> None:
    fake.job = make_job(
        hold=OrderException(hold_kind=HoldKind.SOURCE_REVIEW, created_at=NOW),
    )
    body = api.get(JOB, headers=sign_in(api, UserRole.DRIVER)).json()
    assert body["hold"]["kind"] == "source_review"
    assert body["hold"]["message"].startswith("Waiting for dispatcher review")


# --- Decline -----------------------------------------------------------------------


def test_decline_returns_204(api: TestClient, fake: FakeDeliveries) -> None:
    response = driver_post(api, f"{JOB}/decline", {"reason": "too_far"})
    assert response.status_code == 204
    assert response.content == b""
    assert fake.calls[0][1]["reason"].value == "too_far"


@pytest.mark.parametrize(
    "body",
    [
        {"reason": "other"},
        {"reason": "other", "note": "   "},
        {"reason": "bored"},
        {"reason": "too_far", "note": "x" * 301},
        {"reason": "too_far", "unexpected": True},
    ],
)
def test_decline_validation(api: TestClient, fake: FakeDeliveries, body: dict[str, Any]) -> None:
    response = driver_post(api, f"{JOB}/decline", body)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert fake.calls == []


def test_decline_of_an_accepted_job_is_403(api: TestClient, fake: FakeDeliveries) -> None:
    fake.error = APIError(403, "forbidden", "You do not have access to this resource")
    response = driver_post(api, f"{JOB}/decline", {"reason": "too_far"})
    assert response.status_code == 403
    assert error_code(response) == "forbidden"


# --- Pickup --------------------------------------------------------------------------


PICKUP = ENDPOINTS[3][2] or {}


def test_pickup_passes_a_normalized_request(api: TestClient, fake: FakeDeliveries) -> None:
    body = {
        **PICKUP,
        "source": {"assigned": False, "name": "  Sample Tanker Point  "},
        "source_reference": "   ",
    }
    response = driver_post(api, f"{JOB}/pickup", body)
    assert response.status_code == 201
    pickup = fake.calls[0][1]["pickup"]
    assert pickup.assigned_source is False
    assert pickup.other_source_name == "Sample Tanker Point"
    assert pickup.source_reference is None
    assert pickup.picked_up_at == datetime(2026, 10, 19, 8, 20, tzinfo=UTC)


@pytest.mark.parametrize(
    "changes",
    [
        {"volume_collected_litres": 0},
        {"volume_collected_litres": "1000"},
        {"volume_collected_litres": 1000.5},
        {"picked_up_at": "2026-10-19T08:20:00"},
        {"safety_concern": True},
        {"safety_concern": "yes"},
        {"source": {"assigned": False}},
        {"source": {"assigned": True, "name": "x"}},
        {"source_reference": "x" * 101},
    ],
)
def test_pickup_validation(api: TestClient, fake: FakeDeliveries, changes: dict[str, Any]) -> None:
    response = driver_post(api, f"{JOB}/pickup", {**PICKUP, **changes})
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert fake.calls == []


# --- Delivery code ---------------------------------------------------------------------


def test_new_code_returns_201_without_the_code(api: TestClient, fake: FakeDeliveries) -> None:
    response = driver_post(api, f"{JOB}/delivery-code", None)
    assert response.status_code == 201
    assert response.json()["delivery_code"]["sms_status"] == "accepted"
    assert fake.calls[0][0] == "issue_new_delivery_code"


def test_new_code_too_soon_is_429_with_retry_after(api: TestClient, fake: FakeDeliveries) -> None:
    fake.error = APIError(
        429,
        "rate_limited",
        "Please wait a moment before sending another code.",
        details={"retry_after_seconds": 42},
        headers={"Retry-After": "42"},
    )
    response = driver_post(api, f"{JOB}/delivery-code", None)
    assert response.status_code == 429
    assert error_code(response) == "rate_limited"
    assert response.headers["Retry-After"] == "42"


# --- Incidents ---------------------------------------------------------------------------


def test_incident_returns_201_and_the_hold(api: TestClient, fake: FakeDeliveries) -> None:
    fake.hold = OrderException(hold_kind=HoldKind.UNSAFE_STOP, created_at=NOW)
    response = driver_post(api, f"{JOB}/incidents", {"type": "unsafe_transfer"})
    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "unsafe_transfer"
    assert body["order_reference"] == REFERENCE
    assert body["hold"]["kind"] == "unsafe_stop"
    assert fake.calls[0][1]["incident"].category is ExceptionCategory.UNSAFE_TRANSFER


@pytest.mark.parametrize(
    "body",
    [
        {"type": "other"},
        {"type": "customer_unreachable"},
        {"type": "vehicle_problem", "new_estimated_arrival_at": "2026-10-19T11:30:00Z"},
        {"type": "running_late", "new_estimated_arrival_at": "2026-10-19T11:30:00"},
        {"type": "running_late", "note": "x" * 501},
    ],
)
def test_incident_validation(api: TestClient, fake: FakeDeliveries, body: dict[str, Any]) -> None:
    response = driver_post(api, f"{JOB}/incidents", body)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert fake.calls == []


# --- Part 2: accept, steps, arrival, unloading complete, proof (#75) -----------------

DETAIL_KEYS = {"receiver", "allowed_actions", "unloading_completed_at", "unreachable_allowed_at"}


def test_accept_returns_the_job_detail(api: TestClient, fake: FakeDeliveries) -> None:
    response = driver_post(api, f"{JOB}/accept", None)
    assert response.status_code == 200
    assert DETAIL_KEYS <= set(response.json())
    assert fake.calls[0] == (
        "accept_offer",
        {"driver": USERS[UserRole.DRIVER], "reference": REFERENCE},
    )


def test_accept_of_a_gone_offer_is_404(api: TestClient, fake: FakeDeliveries) -> None:
    fake.error = APIError(404, "order_not_found", "Order not found")
    response = driver_post(api, f"{JOB}/accept", None)
    assert response.status_code == 404
    assert error_code(response) == "order_not_found"


def test_transition_passes_the_step_and_a_trimmed_note(
    api: TestClient, fake: FakeDeliveries
) -> None:
    response = driver_post(api, f"{JOB}/transition", {"to": "en_route", "note": "  Traffic  "})
    assert response.status_code == 200
    assert DETAIL_KEYS <= set(response.json())
    kwargs = fake.calls[0][1]
    assert kwargs["step"] is service.DriverStep.EN_ROUTE
    assert kwargs["note"] == "Traffic"


def test_failed_step_returns_the_finished_job_summary(
    api: TestClient, fake: FakeDeliveries
) -> None:
    fake.job = make_job(order_status=OrderStatus.FAILED)
    response = driver_post(api, f"{JOB}/transition", {"to": "failed"})
    assert response.status_code == 200
    body = response.json()
    assert not DETAIL_KEYS & set(body)
    assert body["order_status"] == "failed"


@pytest.mark.parametrize("target", ["collected", "arrived", "delivered", "cancelled", "accepted"])
def test_transition_refuses_statuses_with_their_own_endpoint(
    api: TestClient, fake: FakeDeliveries, target: str
) -> None:
    response = driver_post(api, f"{JOB}/transition", {"to": target})
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert fake.calls == []


def test_transition_requirement_errors_pass_through(api: TestClient, fake: FakeDeliveries) -> None:
    fake.error = APIError(
        409,
        "transition_requirements_unmet",
        "This step needs more information before it can be recorded.",
        details={"missing": ["delivery_day_reached"]},
    )
    response = driver_post(api, f"{JOB}/transition", {"to": "departed"})
    assert response.status_code == 409
    assert response.json()["error"]["details"] == {"missing": ["delivery_day_reached"]}


def test_arrive_passes_a_consented_location(api: TestClient, fake: FakeDeliveries) -> None:
    body = {
        "location": {"latitude": 6.4527, "longitude": 7.5103, "accuracy_metres": 15},
        "location_consent": True,
    }
    assert driver_post(api, f"{JOB}/arrive", body).status_code == 200
    assert fake.calls[0][1]["location"] == service.NewLocation(
        latitude=6.4527, longitude=7.5103, accuracy_metres=15
    )
    assert driver_post(api, f"{JOB}/arrive", {}).status_code == 200
    assert fake.calls[1][1]["location"] is None


@pytest.mark.parametrize(
    "body",
    [
        # FR-035: no location without consent obtained first.
        {"location": {"latitude": 6.4, "longitude": 7.5}},
        {"location": {"latitude": 6.4, "longitude": 7.5}, "location_consent": False},
        {"location": {"latitude": 91, "longitude": 7.5}, "location_consent": True},
        {"location": {"latitude": 6.4, "longitude": 181}, "location_consent": True},
        {
            "location": {"latitude": 6.4, "longitude": 7.5, "accuracy_metres": -1},
            "location_consent": True,
        },
        {"location_consent": "yes"},
    ],
)
def test_arrive_validation(api: TestClient, fake: FakeDeliveries, body: dict[str, Any]) -> None:
    response = driver_post(api, f"{JOB}/arrive", body)
    assert response.status_code == 422
    assert fake.calls == []


def test_contact_attempt_returns_201_with_the_attempts(
    api: TestClient, fake: FakeDeliveries
) -> None:
    fake.job = replace(fake.job, contact_attempts=(NOW, NOW + timedelta(minutes=3)))
    response = driver_post(api, f"{JOB}/contact-attempts", None)
    assert response.status_code == 201
    assert response.json()["contact_attempts"] == [
        {"attempted_at": "2026-10-19T09:00:00Z"},
        {"attempted_at": "2026-10-19T09:03:00Z"},
    ]
    assert response.json()["unreachable_allowed_at"] == "2026-10-19T09:10:00Z"


def test_unloading_complete_is_201_then_200_for_a_repeat(
    api: TestClient, fake: FakeDeliveries
) -> None:
    fake.job = replace(fake.job, unloading_completed_at=NOW)
    first = driver_post(api, f"{JOB}/unloading-complete", None)
    fake.recorded = False
    repeat = driver_post(api, f"{JOB}/unloading-complete", None)
    assert (first.status_code, repeat.status_code) == (201, 200)
    body = first.json()
    assert body["unloading_completed_at"] == "2026-10-19T09:00:00Z"
    # Never the code or its hash.
    assert set(body["delivery_code"]) == {"issued_at", "expires_at", "attempts_left", "sms_status"}


def test_proof_with_a_code_returns_the_finished_job(api: TestClient, fake: FakeDeliveries) -> None:
    fake.job = replace(
        make_job(order_status=OrderStatus.DELIVERED, assignment_status=AssignmentStatus.COMPLETED),
        delivered_litres=1000,
        section=service.JobSection.DONE,
    )
    response = driver_post(api, f"{JOB}/proof", {**PROOF, "delivered_litres": 1000})
    assert response.status_code == 200
    body = response.json()
    assert not DETAIL_KEYS & set(body)
    assert (body["section"], body["delivered_litres"]) == ("done", 1000)
    proof = fake.calls[0][1]["proof"]
    assert proof == service.NewProof(
        delivered_litres=1000,
        delivery_code="482913",
        alternative_reason=None,
        alternative_note=None,
        location=None,
    )


def test_alternative_proof_returns_202_and_the_job(api: TestClient, fake: FakeDeliveries) -> None:
    fake.delivered = False
    body = {
        "delivered_litres": 1200,
        "unloading_confirmed": True,
        "alternative_proof": {"reason": "other", "note": "Phone lost"},
    }
    response = driver_post(api, f"{JOB}/proof", body)
    assert response.status_code == 202
    assert DETAIL_KEYS <= set(response.json())
    proof = fake.calls[0][1]["proof"]
    assert proof.delivery_code is None
    assert proof.alternative_reason is service.AlternativeProofReason.OTHER
    assert proof.alternative_note == "Phone lost"


@pytest.mark.parametrize(
    "changes",
    [
        {"unloading_confirmed": False},
        {"delivered_litres": 0},
        {"delivered_litres": "1200"},
        {"delivery_code": "48291"},
        {"delivery_code": "48291a"},
        # Exactly one acknowledgement.
        {"delivery_code": None},
        {"alternative_proof": {"reason": "customer_cannot_receive_code"}},
        {"delivery_code": None, "alternative_proof": {"reason": "other"}},
        {"location": {"latitude": 6.4, "longitude": 7.5}},
        {"receiver_name": "Ngozi"},
    ],
)
def test_proof_validation(api: TestClient, fake: FakeDeliveries, changes: dict[str, Any]) -> None:
    body = {key: value for key, value in {**PROOF, **changes}.items() if value is not None}
    response = driver_post(api, f"{JOB}/proof", body)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert fake.calls == []


@pytest.mark.parametrize(
    ("code", "details"),
    [("delivery_code_invalid", {"attempts_remaining": 3}), ("delivery_code_expired", None)],
)
def test_code_errors_are_400_in_the_envelope(
    api: TestClient, fake: FakeDeliveries, code: str, details: dict[str, int] | None
) -> None:
    fake.error = APIError(400, code, "x", details=details)
    response = driver_post(api, f"{JOB}/proof", PROOF)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == code
    assert response.json()["error"]["details"] == details
