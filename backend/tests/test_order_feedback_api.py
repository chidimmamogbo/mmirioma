"""Order feedback endpoint tests that need no database (FR-051).

docs/api/customer-account.md, "Order feedback": roles (FR-001), CSRF,
validation of every field, 201 then 200, the error codes, and ``feedback`` on
the customer's ``OrderRead`` but not on the staff views. The orders service
is faked (fixtures from test_orders_api.py); database behaviour is in
test_order_feedback_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime
from http import HTTPStatus
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth.models import UserRole
from app.modules.orders import service
from app.modules.orders.models import OrderFeedback, OrderStatus
from tests import test_orders_api as orders_api
from tests.test_orders_api import FakeOrders, make_order, sign_in

api = orders_api.api
fake_orders = orders_api.fake_orders

REQUEST = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "api"
        / "examples"
        / "order-feedback-request.json"
    ).read_text(encoding="utf-8")
)
PATH = "/api/v1/orders/MO-7KQ2M9XH4T/feedback"
SUBMITTED = datetime(2026, 10, 26, 14, 0, tzinfo=UTC)
EDITED = datetime(2026, 10, 26, 15, 0, tzinfo=UTC)


def stored(answers: service.FeedbackAnswers, *, edited: bool = False) -> OrderFeedback:
    return OrderFeedback(
        id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        rating=answers.rating,
        poured_by_partner=answers.poured_by_partner,
        on_time=answers.on_time,
        quantity_as_ordered=answers.quantity_as_ordered,
        would_reorder=answers.would_reorder,
        message=answers.message,
        created_at=SUBMITTED,
        updated_at=EDITED if edited else SUBMITTED,
    )


class FakeFeedback:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.created = True
        self.error: APIError | None = None

    async def put_feedback(self, _: object, **kwargs: Any) -> tuple[OrderFeedback, bool]:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return stored(kwargs["answers"], edited=not self.created), self.created


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch, fake_orders: FakeOrders) -> FakeFeedback:
    fake = FakeFeedback()
    monkeypatch.setattr(service, "put_feedback", fake.put_feedback)
    return fake


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


def test_signed_out_is_not_authenticated(api: TestClient, fake: FakeFeedback) -> None:
    response = api.put(PATH, json=REQUEST)
    assert (response.status_code, error_code(response)) == (
        HTTPStatus.UNAUTHORIZED,
        "not_authenticated",
    )
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.DRIVER])
def test_staff_and_drivers_are_forbidden(
    api: TestClient, fake: FakeFeedback, role: UserRole
) -> None:
    response = api.put(PATH, json=REQUEST, headers=sign_in(api, role))
    assert (response.status_code, error_code(response)) == (HTTPStatus.FORBIDDEN, "forbidden")
    assert fake.calls == []


def test_put_needs_the_csrf_token(api: TestClient, fake: FakeFeedback) -> None:
    sign_in(api, UserRole.CUSTOMER)
    response = api.put(PATH, json=REQUEST)
    assert (response.status_code, error_code(response)) == (HTTPStatus.FORBIDDEN, "csrf_failed")
    assert fake.calls == []


def test_first_submission_is_201_with_the_feedback_object(
    api: TestClient, fake: FakeFeedback
) -> None:
    response = api.put(PATH, json=REQUEST, headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.CREATED
    assert response.json() == {
        **REQUEST,
        "submitted_at": "2026-10-26T14:00:00Z",
        "updated_at": "2026-10-26T14:00:00Z",
    }
    assert fake.calls[0]["reference"] == "MO-7KQ2M9XH4T"
    assert fake.calls[0]["answers"] == service.FeedbackAnswers(**REQUEST)


def test_replacing_is_200(api: TestClient, fake: FakeFeedback) -> None:
    fake.created = False
    response = api.put(PATH, json=REQUEST, headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.OK
    assert response.json()["updated_at"] == "2026-10-26T15:00:00Z"


def test_only_rating_and_poured_are_required(api: TestClient, fake: FakeFeedback) -> None:
    body = {"rating": 3, "poured_by_partner": False, "message": "   "}
    response = api.put(PATH, json=body, headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.CREATED
    assert fake.calls[0]["answers"] == service.FeedbackAnswers(
        rating=3,
        poured_by_partner=False,
        on_time=None,
        quantity_as_ordered=None,
        would_reorder=None,
        message=None,  # blank becomes null
    )


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"rating": 0}, "rating"),
        ({"rating": 6}, "rating"),
        ({"rating": "5"}, "rating"),
        ({"rating": 4.5}, "rating"),
        ({"poured_by_partner": "yes"}, "poured_by_partner"),
        ({"on_time": 1}, "on_time"),
        ({"message": "x" * 501}, "message"),
        ({"points": 10}, "points"),
    ],
)
def test_invalid_bodies_are_validation_errors(
    api: TestClient, fake: FakeFeedback, change: dict[str, Any], field: str
) -> None:
    response = api.put(PATH, json={**REQUEST, **change}, headers=sign_in(api, UserRole.CUSTOMER))
    assert (response.status_code, error_code(response)) == (
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "validation_error",
    )
    assert ["body", field] in [detail["loc"] for detail in response.json()["error"]["details"]]
    assert fake.calls == []


@pytest.mark.parametrize("missing", ["rating", "poured_by_partner"])
def test_required_answers_are_required(api: TestClient, fake: FakeFeedback, missing: str) -> None:
    body = {key: value for key, value in REQUEST.items() if key != missing}
    response = api.put(PATH, json=body, headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert fake.calls == []


@pytest.mark.parametrize(
    "error",
    [
        APIError(HTTPStatus.NOT_FOUND, "order_not_found", "Order not found"),
        APIError(HTTPStatus.CONFLICT, "order_not_delivered", "Not delivered"),
    ],
)
def test_service_errors_use_the_envelope(
    api: TestClient, fake: FakeFeedback, error: APIError
) -> None:
    fake.error = error
    response = api.put(PATH, json=REQUEST, headers=sign_in(api, UserRole.CUSTOMER))
    assert (response.status_code, error_code(response)) == (error.status_code, error.code)


def test_customer_order_shows_feedback_and_staff_views_do_not(
    api: TestClient, fake_orders: FakeOrders, monkeypatch: pytest.MonkeyPatch
) -> None:
    order = make_order(status=OrderStatus.DELIVERED)
    feedback = stored(service.FeedbackAnswers(**REQUEST))

    async def get(_: object, **kwargs: Any) -> Any:
        return order

    async def by_order(_: object, order_ids: Any) -> dict[uuid.UUID, OrderFeedback]:
        return {order.id: feedback} if order.id in set(order_ids) else {}

    monkeypatch.setattr(service, "get_customer_order", get)
    monkeypatch.setattr(service, "feedback_by_order", by_order)
    mine = api.get("/api/v1/orders/MO-7KQ2M9XH4T", headers=sign_in(api, UserRole.CUSTOMER))
    assert mine.json()["feedback"] == {
        **REQUEST,
        "submitted_at": "2026-10-26T14:00:00Z",
        "updated_at": "2026-10-26T14:00:00Z",
    }

    # Staff views extend OrderBaseRead, which has no feedback field.
    staff = api.get("/api/v1/admin/orders", headers=sign_in(api, UserRole.ADMIN))
    assert staff.status_code == HTTPStatus.OK
    assert all("feedback" not in item for item in staff.json()["items"])
