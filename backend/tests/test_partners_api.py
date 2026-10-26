"""Partner account endpoint tests that need no database (docs/api/partners.md).

Session lookup, the partner service and the notification service are
replaced with in-memory fakes, so these cover roles (FR-001), CSRF, request
validation, status codes and response bodies against the contract's
examples. Database behaviour is in test_partners_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.auth import phone_verification, security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.dispatch.models import (
    ApprovalStatus,
    DeliveryType,
    DriverProfile,
    VehicleProfile,
)
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import Notification
from app.modules.partners import service
from app.modules.partners.schemas import PartnerRegisterRequest
from app.modules.pricing.models import ServiceZone

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


PROFILE_EXAMPLE = example("partner-profile.json")
PENDING_EXAMPLE = example("partner-profile-pending.json")
NOTIFICATIONS_EXAMPLE = example("partner-notifications.json")

USERS = {
    role: User(
        id=uuid.uuid4(),
        name=f"Sample {role.value}",
        phone="+2348000000001",
        password_hash="x",
        role=role,
        phone_verified_at=None,
        created_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    for role in UserRole
}
DRIVER = USERS[UserRole.DRIVER]

ENDPOINTS: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/v1/driver/profile", None),
    ("PATCH", "/api/v1/driver/profile", {"preferences": {"sms_updates": False}}),
    ("PUT", "/api/v1/driver/availability", {"is_available": True}),
    ("GET", "/api/v1/driver/notifications", None),
    ("POST", "/api/v1/driver/notifications/read", {}),
]
UNSAFE = [endpoint for endpoint in ENDPOINTS if endpoint[0] != "GET"]


def partner_from(body: dict[str, Any]) -> service.PartnerProfile:
    """The service view that should produce ``body`` (a contract example)."""
    vehicle_body = body["vehicle"]
    user = User(
        id=uuid.UUID(body["id"]),
        name=body["name"],
        phone=body["phone"],
        password_hash="x",
        role=UserRole.DRIVER,
        phone_verified_at=datetime(2026, 8, 1, tzinfo=UTC) if body["phone_verified"] else None,
        # 09:00 Lagos on the example's date.
        created_at=datetime.fromisoformat(body["partner_since"]).replace(hour=8, tzinfo=UTC),
    )
    vehicle = (
        VehicleProfile(
            id=uuid.uuid4(),
            vehicle_type=vehicle_body["description"],
            safe_payload_litres=vehicle_body["safe_payload_litres"],
            is_active=True,
        )
        if vehicle_body["safe_payload_litres"] is not None
        else None
    )
    profile = DriverProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        vehicle_profile_id=vehicle.id if vehicle else None,
        is_available=body["is_available"],
        approval_status=ApprovalStatus(body["approval_status"]),
        delivery_type=DeliveryType(vehicle_body["delivery_type"]),
        plate=vehicle_body["plate"],
        declared_capacity_gallons=vehicle_body["declared_capacity_gallons"],
        transfer_methods=list(vehicle_body["transfer_methods"]),
        new_order_alerts=body["preferences"]["new_order_alerts"],
        sms_updates=body["preferences"]["sms_updates"],
    )
    zones = [
        ServiceZone(id=uuid.UUID(zone["id"]), name=zone["name"], is_active=True)
        for zone in body["service_zones"]
    ]
    return service.PartnerProfile(user=user, profile=profile, vehicle=vehicle, zones=zones)


def notification_page() -> notifications_service.NotificationPage:
    views = [
        notifications_service.NotificationView(
            notification=Notification(
                id=uuid.UUID(item["id"]),
                user_id=DRIVER.id,
                kind=item["kind"],
                title=item["title"],
                body=item["body"],
                created_at=datetime.fromisoformat(item["created_at"]),
                read_at=datetime.fromisoformat(item["read_at"]) if item["read_at"] else None,
            ),
            order_reference=item["reference"],
        )
        for item in NOTIFICATIONS_EXAMPLE["items"]
    ]
    return notifications_service.NotificationPage(
        items=views,
        total=NOTIFICATIONS_EXAMPLE["total"],
        unread_count=NOTIFICATIONS_EXAMPLE["unread_count"],
    )


class FakePartners:
    """Records service calls and returns canned results."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.error: APIError | None = None
        self.partner = partner_from(PROFILE_EXAMPLE)

    def _record(self, name: str, kwargs: dict[str, Any]) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def get_profile(self, _: object, user: User) -> service.PartnerProfile:
        self._record("get_profile", {"user": user})
        return self.partner

    async def update_preferences(
        self, _: object, user: User, **kwargs: Any
    ) -> service.PartnerProfile:
        self._record("update_preferences", kwargs)
        return self.partner

    async def set_availability(
        self, _: object, user: User, **kwargs: Any
    ) -> service.PartnerProfile:
        self._record("set_availability", kwargs)
        return self.partner

    async def register_partner(self, _: object, **kwargs: Any) -> User:
        self._record("register_partner", kwargs)
        return User(
            id=uuid.uuid4(),
            name=kwargs["name"],
            phone=kwargs["phone"],
            password_hash="x",
            role=UserRole.DRIVER,
            phone_verified_at=None,
        )

    async def list_for_user(
        self, _: object, **kwargs: Any
    ) -> notifications_service.NotificationPage:
        self._record("list_for_user", kwargs)
        return notification_page()

    async def mark_read(self, _: object, **kwargs: Any) -> None:
        self._record("mark_read", kwargs)


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakePartners:
    fake = FakePartners()
    for name in ("get_profile", "update_preferences", "set_availability", "register_partner"):
        monkeypatch.setattr(service, name, getattr(fake, name))
    monkeypatch.setattr(notifications_service, "list_for_user", fake.list_for_user)
    monkeypatch.setattr(notifications_service, "mark_read", fake.mark_read)

    async def start_session(_: object, user: User) -> auth_service.AuthenticatedSession:
        user_session = UserSession(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash="x",
            expires_at=datetime(2026, 11, 2, tzinfo=UTC),
        )
        return auth_service.AuthenticatedSession(user=user, session=user_session, token="new")

    monkeypatch.setattr(auth_service, "start_session", start_session)
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: FakePartners) -> TestClient:
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
    """Set the role's cookie and return headers including its CSRF token."""
    client.cookies.set(SESSION_COOKIE_NAME, role.value)
    secret = get_settings().session_secret.get_secret_value()
    return {CSRF_HEADER_NAME: security.csrf_token_for(role.value, secret)}


def call(
    client: TestClient,
    method: str,
    path: str,
    body: dict[str, Any] | None,
    headers: dict[str, str],
) -> Any:
    return client.request(method, path, json=body, headers=headers)


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


def error_locs(response: Any) -> list[list[Any]]:
    return [detail["loc"] for detail in response.json()["error"]["details"]]


# --- Access (FR-001) ---------------------------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_signed_out_requests_are_not_authenticated(
    api: TestClient, fake: FakePartners, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = call(api, method, path, body, {})
    assert (response.status_code, error_code(response)) == (401, "not_authenticated")
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.ADMIN])
@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_only_drivers_use_the_partner_endpoints(
    api: TestClient,
    fake: FakePartners,
    role: UserRole,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = call(api, method, path, body, sign_in(api, role))
    assert (response.status_code, error_code(response)) == (403, "forbidden")
    assert fake.calls == []


@pytest.mark.parametrize(("method", "path", "body"), UNSAFE)
def test_unsafe_requests_need_the_csrf_token(
    api: TestClient, fake: FakePartners, method: str, path: str, body: dict[str, Any] | None
) -> None:
    sign_in(api, UserRole.DRIVER)
    response = call(api, method, path, body, {})
    assert (response.status_code, error_code(response)) == (403, "csrf_failed")
    assert fake.calls == []


# --- Profile -------------------------------------------------------------------


def test_profile_matches_the_contract_example(api: TestClient) -> None:
    response = api.get("/api/v1/driver/profile", headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 200
    assert response.json() == PROFILE_EXAMPLE


def test_pending_profile_matches_the_contract_example(api: TestClient, fake: FakePartners) -> None:
    fake.partner = partner_from(PENDING_EXAMPLE)
    response = api.get("/api/v1/driver/profile", headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 200
    # 4,000 declared gallons are 16,000 litres (1 local gallon = 4 L), and
    # nothing is verified yet.
    assert response.json() == PENDING_EXAMPLE


def test_profile_without_a_driver_profile_is_404(api: TestClient, fake: FakePartners) -> None:
    fake.error = service._no_driver_profile()
    response = api.get("/api/v1/driver/profile", headers=sign_in(api, UserRole.DRIVER))
    assert (response.status_code, error_code(response)) == (404, "no_driver_profile")


def test_patch_changes_only_the_given_preferences(api: TestClient, fake: FakePartners) -> None:
    body = example("partner-profile-update-request.json")
    response = api.patch("/api/v1/driver/profile", json=body, headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 200
    assert fake.calls == [("update_preferences", {"new_order_alerts": None, "sms_updates": False})]


@pytest.mark.parametrize(
    ("body", "loc"),
    [
        # No partner email in the pilot (partners.md, decision 5).
        ({"email": "rider@example.com"}, ["body", "email"]),
        ({"preferences": {"offers_and_news": True}}, ["body", "preferences", "offers_and_news"]),
        ({"preferences": {"sms_updates": "sometimes"}}, ["body", "preferences", "sms_updates"]),
    ],
)
def test_patch_refuses_other_fields(
    api: TestClient, fake: FakePartners, body: dict[str, Any], loc: list[str]
) -> None:
    response = api.patch("/api/v1/driver/profile", json=body, headers=sign_in(api, UserRole.DRIVER))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert loc in error_locs(response)
    assert fake.calls == []


# --- Availability ------------------------------------------------------------------


def test_going_online_returns_the_profile(api: TestClient, fake: FakePartners) -> None:
    response = api.put(
        "/api/v1/driver/availability",
        json=example("partner-availability-request.json"),
        headers=sign_in(api, UserRole.DRIVER),
    )
    assert response.status_code == 200
    assert response.json()["is_available"] is True
    assert fake.calls == [("set_availability", {"available": True})]


def test_going_online_while_pending_is_refused(api: TestClient, fake: FakePartners) -> None:
    sample = example("error-partner-not-approved.json")
    fake.error = APIError(403, sample["error"]["code"], sample["error"]["message"])
    response = api.put(
        "/api/v1/driver/availability",
        json={"is_available": True},
        headers=sign_in(api, UserRole.DRIVER),
    )
    assert response.status_code == 403
    assert response.json() == sample


@pytest.mark.parametrize("body", [{}, {"is_available": "yes"}])
def test_availability_needs_a_boolean(
    api: TestClient, fake: FakePartners, body: dict[str, Any]
) -> None:
    response = api.put(
        "/api/v1/driver/availability", json=body, headers=sign_in(api, UserRole.DRIVER)
    )
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert fake.calls == []


# --- Notifications -----------------------------------------------------------------


def test_notifications_match_the_contract_example(api: TestClient, fake: FakePartners) -> None:
    response = api.get("/api/v1/driver/notifications", headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 200
    assert response.json() == NOTIFICATIONS_EXAMPLE
    assert fake.calls == [("list_for_user", {"user_id": DRIVER.id, "limit": 50, "offset": 0})]


def test_notifications_check_the_page_parameters(api: TestClient, fake: FakePartners) -> None:
    response = api.get(
        "/api/v1/driver/notifications?limit=101", headers=sign_in(api, UserRole.DRIVER)
    )
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert fake.calls == []


@pytest.mark.parametrize("body", [None, {}])
def test_mark_read_without_ids_marks_every_one(
    api: TestClient, fake: FakePartners, body: dict[str, Any] | None
) -> None:
    headers = sign_in(api, UserRole.DRIVER)
    if body is None:
        response = api.post("/api/v1/driver/notifications/read", headers=headers)
    else:
        response = api.post("/api/v1/driver/notifications/read", json=body, headers=headers)
    assert response.status_code == 204
    assert fake.calls == [("mark_read", {"user_id": DRIVER.id, "ids": None})]


def test_mark_read_with_ids(api: TestClient, fake: FakePartners) -> None:
    body = example("partner-notifications-read-request.json")
    response = api.post(
        "/api/v1/driver/notifications/read", json=body, headers=sign_in(api, UserRole.DRIVER)
    )
    assert response.status_code == 204
    assert fake.calls == [
        ("mark_read", {"user_id": DRIVER.id, "ids": [uuid.UUID(i) for i in body["ids"]]})
    ]


@pytest.mark.parametrize(
    "ids", [["not-a-uuid"], [str(uuid.uuid4()) for _ in range(101)]], ids=["bad id", "101 ids"]
)
def test_mark_read_refuses_bad_ids(api: TestClient, fake: FakePartners, ids: list[str]) -> None:
    response = api.post(
        "/api/v1/driver/notifications/read",
        json={"ids": ids},
        headers=sign_in(api, UserRole.DRIVER),
    )
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert fake.calls == []


# --- Sign-up (auth.md amendment) ---------------------------------------------------


def register(client: TestClient, **changes: Any) -> Any:
    body = {**example("partner-register-request.json"), **changes}
    body = {key: value for key, value in body.items() if value is not ...}
    return client.post("/api/v1/auth/partner-register", json=body)


def test_sign_up_creates_a_driver_session(api: TestClient, fake: FakePartners) -> None:
    response = register(api)
    assert response.status_code == 201
    session = response.json()
    assert (session["user"]["role"], session["user"]["phone_verified"]) == ("driver", False)
    assert response.cookies.get(SESSION_COOKIE_NAME) == "new"
    assert fake.calls == [
        (
            "register_partner",
            {
                "name": "Sample Driver",
                "phone": "+2348000000302",
                "password": "sample-password",
                "delivery_type": DeliveryType.TANKER,
                "plate": "ENU 456 CD",
                "declared_capacity_gallons": 4000,
                "service_zone_id": uuid.UUID("8d0b2f4e-1c7a-4b9e-a3f6-5e2d9c8b7a10"),
            },
        )
    ]


@pytest.mark.parametrize(
    ("changes", "loc"),
    [
        ({"declared_capacity_gallons": ...}, ["body", "declared_capacity_gallons"]),
        ({"declared_capacity_gallons": 499}, ["body", "declared_capacity_gallons"]),
        ({"declared_capacity_gallons": 20_001}, ["body", "declared_capacity_gallons"]),
        (
            {"delivery_type": "keke", "declared_capacity_gallons": 1000},
            ["body", "declared_capacity_gallons"],
        ),
        ({"plate": "AB1"}, ["body", "plate"]),
        ({"plate": "ENU-123-AB-CD-EF-G"}, ["body", "plate"]),
        ({"plate": "ENU/123"}, ["body", "plate"]),
        ({"delivery_type": "bicycle"}, ["body", "delivery_type"]),
        ({"service_zone_id": "GRA"}, ["body", "service_zone_id"]),
        ({"role": "admin"}, ["body", "role"]),
    ],
)
def test_sign_up_validates_each_field(
    api: TestClient, fake: FakePartners, changes: dict[str, Any], loc: list[str]
) -> None:
    response = register(api, **changes)
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert loc in error_locs(response)
    assert fake.calls == []


def test_a_keke_needs_no_capacity(api: TestClient, fake: FakePartners) -> None:
    response = register(api, delivery_type="keke", declared_capacity_gallons=None)
    assert response.status_code == 201
    assert fake.calls[0][1]["declared_capacity_gallons"] is None


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (APIError(409, "phone_already_registered", "Taken"), 409, "phone_already_registered"),
        (service._zone_error(), 422, "validation_error"),
    ],
)
def test_sign_up_passes_service_errors_through(
    api: TestClient, fake: FakePartners, error: APIError, status: int, code: str
) -> None:
    fake.error = error
    response = register(api)
    assert (response.status_code, error_code(response)) == (status, code)
    assert SESSION_COOKIE_NAME not in response.cookies


def test_sign_up_shares_the_registration_limit(api: TestClient) -> None:
    for _ in range(20):
        assert register(api).status_code == 201
    response = register(api)
    assert (response.status_code, error_code(response)) == (429, "too_many_attempts")


def test_the_register_example_is_a_valid_request() -> None:
    request = PartnerRegisterRequest.model_validate(example("partner-register-request.json"))
    assert (request.plate, request.phone) == ("ENU 456 CD", "+2348000000302")


# --- Phone verification for partners (decision 9) -----------------------------------


def test_a_driver_may_ask_for_a_phone_code(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent_to: list[User] = []

    async def send_code(_: object, *, user: User, **__: Any) -> phone_verification.CodeSent:
        sent_to.append(user)
        now = datetime(2026, 10, 26, 9, tzinfo=UTC)
        return phone_verification.CodeSent(
            phone=user.phone,
            expires_at=now + timedelta(minutes=5),
            resend_available_at=now + timedelta(seconds=60),
        )

    monkeypatch.setattr(phone_verification, "send_code", send_code)
    response = api.post("/api/v1/auth/phone-verification", headers=sign_in(api, UserRole.DRIVER))
    assert response.status_code == 202
    assert sent_to == [DRIVER]


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/v1/auth/phone-verification", None),
        ("/api/v1/auth/phone-verification/verify", {"code": "123456"}),
    ],
)
def test_admins_still_may_not_verify_a_phone(
    api: TestClient, path: str, body: dict[str, Any] | None
) -> None:
    response = api.post(path, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (403, "forbidden")


def test_drivers_still_may_not_change_their_phone(api: TestClient) -> None:
    response = api.post(
        "/api/v1/auth/phone-change",
        json={"phone": "08000000999", "password": "sample-password"},
        headers=sign_in(api, UserRole.DRIVER),
    )
    assert (response.status_code, error_code(response)) == (403, "forbidden")
