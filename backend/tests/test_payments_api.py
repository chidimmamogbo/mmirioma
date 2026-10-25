"""Cash endpoint tests that need no database (#123).

Contract: docs/api/payments.md (agreed G3, 2026-10-22). The payments service
is faked, so these cover roles (FR-041: only staff receive and reconcile),
CSRF, request validation, status codes, the arguments each endpoint passes,
and response shapes against the contract's examples, which are also checked
against the response schemas. Database behaviour is in
test_payments_integration.py.
"""

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.auth import security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.confirmation import service as confirmation_service
from app.modules.deliveries import holds
from app.modules.deliveries import service as deliveries_service
from app.modules.deliveries.admin_schemas import AdminOrderHistoryWithHolds
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import Assignment, AssignmentStatus, VehicleProfile
from app.modules.messaging.sms import MockSmsProvider, get_sms_provider
from app.modules.orders.models import Order, OrderEvent, OrderStatus, PaymentStatus
from app.modules.payments import service as payments_service
from app.modules.payments.models import (
    CashCollection,
    CashCollectionStatus,
    CashEvent,
    CashEventKind,
    CashRemittance,
    PaymentSmsStatus,
)
from app.modules.payments.schemas import (
    AdminCashCollectionRead,
    CashCollectionRead,
    CashDayRead,
    DriverCashForAdminRead,
    DriverCashRead,
    ReconciliationRead,
    RemittanceRead,
)
from app.modules.payments.service import (
    CashDay,
    CashHistoryEntry,
    CollectionView,
    DriverCash,
    DriverCashRow,
    JobCash,
    ReceivedOrder,
    RemittanceResult,
)
from tests.test_dispatch_api import keys

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"
REFERENCE = "MO-7KQ2M9XH4T"
COLLECT = f"/api/v1/driver/jobs/{REFERENCE}/cash-collection"
NOW = datetime(2026, 10, 27, 13, 15, tzinfo=UTC)

USERS = {
    role: User(
        id=uuid.uuid4(),
        name=f"Sample {role.value}",
        phone="+2348000000001",
        password_hash="x",
        role=role,
        phone_verified_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    for role in UserRole
}
ADMIN, DRIVER, CUSTOMER = USERS[UserRole.ADMIN], USERS[UserRole.DRIVER], USERS[UserRole.CUSTOMER]


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def order() -> Order:
    return Order(
        id=uuid.uuid4(),
        reference=REFERENCE,
        customer_id=CUSTOMER.id,
        idempotency_key=uuid.uuid4(),
        status=OrderStatus.DELIVERED,
        quantity_litres=2000,
        contact_name="Sample Customer",
        contact_phone="+2348000000001",
        delivery_address="12 Sample Close, Enugu",
        is_simulated=True,
        payment_status=PaymentStatus.PENDING_COLLECTION,
        outstanding_balance_minor_units=0,
        overpaid_minor_units=0,
        created_at=NOW - timedelta(days=1),
        updated_at=NOW,
    )


def view(status: CashCollectionStatus = CashCollectionStatus.COLLECTED) -> CollectionView:
    the_order = order()
    collection = CashCollection(
        id=uuid.uuid4(),
        order_id=the_order.id,
        driver_id=DRIVER.id,
        assignment_id=uuid.uuid4(),
        amount_minor_units=4_000_000,
        note="Customer paid 40,000.",
        status=status,
        collected_at=NOW,
        remittance_due_at=NOW + timedelta(hours=4),
    )
    return CollectionView(
        collection=collection,
        order=the_order,
        amount_due_minor_units=4_500_000,
        overdue=False,
        driver=DRIVER,
        customer=CUSTOMER,
        received_by=None,
        corrected_by=None,
        reconciled_by=None,
    )


class Fake:
    """Records the payments calls the routers make."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.error: APIError | None = None
        self.created = True

    def _record(self, name: str, kwargs: dict[str, Any]) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def record_cash(self, _: object, **kwargs: Any) -> tuple[CollectionView, bool]:
        self._record("record_cash", kwargs)
        return view(), self.created

    async def driver_cash(self, _: object, **kwargs: Any) -> DriverCash:
        self._record("driver_cash", kwargs)
        return DriverCash(4_000_000, 0, NOW + timedelta(hours=4), False, [view()])

    async def hand_over(self, _: object, **kwargs: Any) -> DriverCash:
        self._record("hand_over", kwargs)
        return DriverCash(
            4_000_000, 4_000_000, NOW, False, [view(CashCollectionStatus.AWAITING_REMITTANCE)]
        )

    async def cash_day(self, _: object, **kwargs: Any) -> CashDay:
        self._record("cash_day", kwargs)
        row = DriverCashRow(
            driver=DRIVER,
            vehicle=VehicleProfile(
                id=uuid.uuid4(), vehicle_type="Tanker truck", safe_payload_litres=3000
            ),
            held_minor_units=4_000_000,
            ready_minor_units=0,
            remittance_due_at=NOW,
            overdue=True,
            last_received_at=None,
        )
        return CashDay(date(2026, 10, 27), 4_000_000, 0, 0, 4_000_000, 0, [row], [])

    async def cash_with_driver(self, _: object, **kwargs: Any) -> tuple[User, list[CollectionView]]:
        self._record("cash_with_driver", kwargs)
        return DRIVER, [view()]

    async def correct_amount(self, _: object, **kwargs: Any) -> CollectionView:
        self._record("correct_amount", kwargs)
        return view()

    async def receive_cash(self, _: object, **kwargs: Any) -> RemittanceResult:
        self._record("receive_cash", kwargs)
        remittance = CashRemittance(
            id=uuid.uuid4(),
            driver_id=DRIVER.id,
            recorded_minor_units=4_000_000,
            counted_minor_units=4_000_000,
            difference_minor_units=0,
            note=None,
            received_by=ADMIN.id,
            remitted_at=NOW,
        )
        received = ReceivedOrder(
            REFERENCE, PaymentStatus.PARTIALLY_PAID, 500_000, 0, PaymentSmsStatus.FAILED
        )
        return RemittanceResult(remittance, DRIVER, ADMIN, [received])

    async def reconcile(self, _: object, **kwargs: Any) -> list[CollectionView]:
        self._record("reconcile", kwargs)
        return [view(CashCollectionStatus.RECONCILED)]


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Fake:
    fake = Fake()
    for name in (
        "record_cash",
        "driver_cash",
        "hand_over",
        "cash_day",
        "cash_with_driver",
        "correct_amount",
        "receive_cash",
        "reconcile",
    ):
        monkeypatch.setattr(payments_service, name, getattr(fake, name))
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: Fake) -> TestClient:
    """Client whose session cookie value names the signed-in role; mock SMS."""

    async def lookup(_: object, token: str) -> auth_service.AuthenticatedSession | None:
        try:
            user = USERS[UserRole(token)]
        except ValueError:
            return None
        user_session = UserSession(
            id=uuid.uuid4(), user_id=user.id, token_hash="x", expires_at=NOW + timedelta(days=9999)
        )
        return auth_service.AuthenticatedSession(user=user, session=user_session, token=token)

    monkeypatch.setattr(auth_service, "get_authenticated_session", lookup)
    sms = MockSmsProvider()
    client.app.dependency_overrides[get_sms_provider] = lambda: sms  # type: ignore[attr-defined]
    return client


def sign_in(client: TestClient, role: UserRole) -> dict[str, str]:
    client.cookies.set(SESSION_COOKIE_NAME, role.value)
    secret = get_settings().session_secret.get_secret_value()
    return {CSRF_HEADER_NAME: security.csrf_token_for(role.value, secret)}


def error_of(response: Any) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


ID = str(uuid.uuid4())
DRIVER_POSTS = [
    (COLLECT, "cash-collection-request.json"),
    ("/api/v1/driver/cash/handover", "cash-handover-request.json"),
]
ADMIN_POSTS = [
    (f"/api/v1/admin/cash-collections/{ID}/correction", "cash-correction-request.json"),
    ("/api/v1/admin/cash-remittances", "cash-remittance-request.json"),
    ("/api/v1/admin/cash-reconciliations", "cash-reconciliation-request.json"),
]
ADMIN_GETS = ["/api/v1/admin/cash", f"/api/v1/admin/cash/drivers/{ID}"]


# --- Examples match the response schemas -------------------------------------------


@pytest.mark.parametrize(
    ("name", "model"),
    [
        ("cash-collection.json", CashCollectionRead),
        ("driver-cash.json", DriverCashRead),
        ("admin-cash-day.json", CashDayRead),
        ("admin-cash-driver.json", DriverCashForAdminRead),
        ("cash-remittance.json", RemittanceRead),
        ("cash-reconciliation.json", ReconciliationRead),
        ("admin-order-history-cash.json", AdminOrderHistoryWithHolds),
    ],
)
def test_examples_match_the_schemas(name: str, model: type[BaseModel]) -> None:
    data = example(name)
    assert model.model_validate(data).model_dump(mode="json") == data


# --- Access ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.CUSTOMER])
def test_driver_endpoints_are_for_drivers_only(api: TestClient, fake: Fake, role: UserRole) -> None:
    headers = sign_in(api, role)
    for path, body in DRIVER_POSTS:
        assert error_of(api.post(path, json=example(body), headers=headers)) == (403, "forbidden")
    assert error_of(api.get("/api/v1/driver/cash", headers=headers)) == (403, "forbidden")
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.DRIVER, UserRole.CUSTOMER])
def test_admin_endpoints_are_for_administrators_only(
    api: TestClient, fake: Fake, role: UserRole
) -> None:
    headers = sign_in(api, role)
    for path, body in ADMIN_POSTS:
        assert error_of(api.post(path, json=example(body), headers=headers)) == (403, "forbidden")
    for path in ADMIN_GETS:
        assert error_of(api.get(path, headers=headers)) == (403, "forbidden")
    assert fake.calls == []


def test_signed_out_and_csrf(api: TestClient, fake: Fake) -> None:
    assert error_of(api.get("/api/v1/driver/cash")) == (401, "not_authenticated")
    sign_in(api, UserRole.DRIVER)
    assert error_of(api.post(COLLECT, json=example("cash-collection-request.json"))) == (
        403,
        "csrf_failed",
    )
    sign_in(api, UserRole.ADMIN)
    for path, body in ADMIN_POSTS:
        assert error_of(api.post(path, json=example(body))) == (403, "csrf_failed")
    assert fake.calls == []


# --- Driver ---------------------------------------------------------------------------


def test_record_cash_is_201_then_200_for_a_repeat(api: TestClient, fake: Fake) -> None:
    headers = sign_in(api, UserRole.DRIVER)
    response = api.post(COLLECT, json=example("cash-collection-request.json"), headers=headers)
    assert response.status_code == 201
    assert keys(response.json()) == keys(example("cash-collection.json"))
    name, call = fake.calls[0]
    assert name == "record_cash"
    assert (call["reference"], call["amount_minor_units"]) == (REFERENCE, 4_000_000)
    assert call["driver"].id == DRIVER.id
    fake.created = False
    response = api.post(COLLECT, json=example("cash-collection-request.json"), headers=headers)
    assert response.status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {"amount_minor_units": 4_000_050},  # kobo
        {"amount_minor_units": 40000.0},  # float
        {"amount_minor_units": "4000000"},  # string
        {"amount_minor_units": -100},
        {"amount_minor_units": 100, "unexpected": 1},
        {},
    ],
)
def test_record_cash_refuses_bad_bodies(api: TestClient, fake: Fake, body: dict[str, Any]) -> None:
    response = api.post(COLLECT, json=body, headers=sign_in(api, UserRole.DRIVER))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


def test_service_errors_pass_through(api: TestClient, fake: Fake) -> None:
    fake.error = APIError(409, "cash_already_recorded", "x", details={"amount_minor_units": 1})
    response = api.post(
        COLLECT, json=example("cash-collection-request.json"), headers=sign_in(api, UserRole.DRIVER)
    )
    assert error_of(response) == (409, "cash_already_recorded")
    assert keys(response.json()) == keys(example("error-cash-already-recorded.json"))


def test_my_cash_and_handover(api: TestClient, fake: Fake) -> None:
    headers = sign_in(api, UserRole.DRIVER)
    body = api.get("/api/v1/driver/cash", headers=headers).json()
    assert set(body) == set(example("driver-cash.json"))
    assert fake.calls[0] == ("driver_cash", {"driver_id": DRIVER.id})
    request = example("cash-handover-request.json")
    response = api.post("/api/v1/driver/cash/handover", json=request, headers=headers)
    assert response.status_code == 200
    assert response.json()["ready_minor_units"] == 4_000_000
    assert fake.calls[1][1]["collection_ids"] == [uuid.UUID(i) for i in request["collection_ids"]]
    duplicate = {"collection_ids": [ID, ID]}
    response = api.post("/api/v1/driver/cash/handover", json=duplicate, headers=headers)
    assert error_of(response) == (422, "validation_error")


def test_the_job_carries_its_cash_card(
    api: TestClient, fake: Fake, monkeypatch: pytest.MonkeyPatch
) -> None:
    the_view = view()

    async def get_driver_job(_: object, **_kwargs: Any) -> deliveries_service.DriverJob:
        return job

    async def cash_for_jobs(_: object, jobs: Any, **_kwargs: Any) -> dict[uuid.UUID, JobCash]:
        return {jobs[0].order.id: JobCash(4_500_000, True, None, True)}

    the_order = the_view.order
    the_order.status = OrderStatus.UNLOADING
    job = deliveries_service.DriverJob(
        assignment=Assignment(
            id=uuid.uuid4(),
            order_id=the_order.id,
            driver_user_id=DRIVER.id,
            status=AssignmentStatus.ACCEPTED,
            offered_by=ADMIN.id,
            created_at=NOW,
        ),
        order=the_order,
        source=None,
        job_status=deliveries_service.JobStatus.ACCEPTED,
        section=deliveries_service.JobSection.TODAY,
        hold=None,
        ended_at=None,
        end_reason=None,
        pickup=None,
        arrived_at=NOW,
        delivery_code=None,
        allowed_actions=[
            deliveries_service.JobAction.SUBMIT_PROOF,
            deliveries_service.JobAction.REPORT_INCIDENT,
        ],
        unloading_completed_at=NOW,
    )
    monkeypatch.setattr(deliveries_service, "get_driver_job", get_driver_job)
    monkeypatch.setattr(payments_service, "cash_for_jobs", cash_for_jobs)
    body = api.get(f"/api/v1/driver/jobs/{REFERENCE}", headers=sign_in(api, UserRole.DRIVER)).json()
    assert body["allowed_actions"] == ["submit_proof", "record_cash", "report_incident"]
    assert body["cash"] == example("driver-job-unloading-complete.json")["cash"]


# --- Admin ----------------------------------------------------------------------------


def test_cash_page_reads_the_day(api: TestClient, fake: Fake) -> None:
    headers = sign_in(api, UserRole.ADMIN)
    body = api.get("/api/v1/admin/cash?date=2026-10-27", headers=headers).json()
    assert keys(body) | {"awaiting_reconciliation": None} == keys(
        example("admin-cash-day.json")
    ) | {"awaiting_reconciliation": None}
    assert body["drivers"][0]["driver"]["vehicle"] == "Tanker truck"
    assert body["drivers"][0]["overdue"] is True
    assert fake.calls[0] == ("cash_day", {"day": date(2026, 10, 27)})
    api.get("/api/v1/admin/cash", headers=headers)
    assert fake.calls[1] == ("cash_day", {"day": None})
    response = api.get("/api/v1/admin/cash?date=27-10-2026", headers=headers)
    assert error_of(response) == (422, "validation_error")


def test_driver_cash_correction_receipt_and_reconciliation(api: TestClient, fake: Fake) -> None:
    headers = sign_in(api, UserRole.ADMIN)
    body = api.get(f"/api/v1/admin/cash/drivers/{ID}", headers=headers).json()
    assert set(body) == {"driver", "collections"}
    assert set(body["collections"][0]) == set(AdminCashCollectionRead.model_fields)

    response = api.post(
        f"/api/v1/admin/cash-collections/{ID}/correction",
        json=example("cash-correction-request.json"),
        headers=headers,
    )
    assert response.status_code == 200
    _, call = fake.calls[-1]
    assert (call["collection_id"], call["amount_minor_units"]) == (uuid.UUID(ID), 4_500_000)
    assert call["admin"].id == ADMIN.id

    request = example("cash-remittance-request.json")
    response = api.post("/api/v1/admin/cash-remittances", json=request, headers=headers)
    assert response.status_code == 201
    assert keys(response.json()) == keys(example("cash-remittance.json")) | {"note": None}
    assert response.json()["orders"][0]["sms_status"] == "failed"
    _, call = fake.calls[-1]
    assert call["counted_minor_units"] == 9_050_000
    assert call["driver_id"] == uuid.UUID(request["driver_id"])
    assert isinstance(call["sms"], MockSmsProvider)

    response = api.post(
        "/api/v1/admin/cash-reconciliations",
        json=example("cash-reconciliation-request.json"),
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["collections"][0]["status"] == "reconciled"


def test_correction_needs_a_reason(api: TestClient, fake: Fake) -> None:
    response = api.post(
        f"/api/v1/admin/cash-collections/{ID}/correction",
        json={"amount_minor_units": 4_500_000, "reason": " "},
        headers=sign_in(api, UserRole.ADMIN),
    )
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


def test_history_with_holds_adds_cash_steps_by_time(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    the_order = order()
    status_event = OrderEvent(
        id=uuid.uuid4(),
        order_id=the_order.id,
        from_status=OrderStatus.UNLOADING,
        to_status=OrderStatus.DELIVERED,
        actor_id=DRIVER.id,
        created_at=NOW - timedelta(minutes=5),
        updated_at=NOW,
    )

    async def order_history(_: object, **_kwargs: Any) -> list[Any]:
        return [
            dispatch_service.HistoryEntry(
                event=status_event,
                actor=DRIVER,
                assignment=None,
                assignment_driver=None,
                decline_reason=None,
            )
        ]

    async def no_confirmations(*_args: object, **_kwargs: object) -> dict[uuid.UUID, object]:
        return {}

    def cash_event(kind: CashEventKind, minutes: int) -> CashHistoryEntry:
        return CashHistoryEntry(
            event=CashEvent(
                id=uuid.uuid4(),
                collection_id=uuid.uuid4(),
                order_id=the_order.id,
                kind=kind,
                actor_id=ADMIN.id,
                occurred_at=NOW + timedelta(minutes=minutes),
                amount_minor_units=4_500_000,
                payment_status=PaymentStatus.PAID if kind is CashEventKind.CASH_RECEIVED else None,
                outstanding_balance_minor_units=0 if kind is CashEventKind.CASH_RECEIVED else None,
            ),
            actor=ADMIN,
            sms_status=PaymentSmsStatus.ACCEPTED if kind is CashEventKind.CASH_RECEIVED else None,
        )

    async def cash_history(_: object, order_id: uuid.UUID) -> list[CashHistoryEntry]:
        assert order_id == the_order.id
        return [
            cash_event(CashEventKind.CASH_RECEIVED, 60),
            cash_event(CashEventKind.CASH_RECORDED, -10),
        ]

    monkeypatch.setattr(holds, "order_history", order_history)
    monkeypatch.setattr(confirmation_service, "confirmation_lines", no_confirmations)
    monkeypatch.setattr(payments_service, "cash_history", cash_history)
    headers = sign_in(api, UserRole.ADMIN)
    base = f"/api/v1/admin/orders/{REFERENCE}/history"

    items = api.get(f"{base}?include=holds", headers=headers).json()["items"]
    assert [item["kind"] for item in items] == ["cash_received", "status_change", "cash_recorded"]
    assert items[0]["cash"]["payment_status"] == "paid"
    assert items[0]["cash"]["sms_status"] == "accepted"
    assert (items[0]["from_status"], items[0]["to_status"]) == (None, None)
    assert items[1]["cash"] is None
    assert set(items[0]) == set(example("admin-order-history-cash.json")["items"][0])
    # Without include the agreed H1 history is unchanged: no cash entries (#62).
    plain = api.get(base, headers=headers).json()["items"]
    assert len(plain) == 1 and "cash" not in plain[0]
