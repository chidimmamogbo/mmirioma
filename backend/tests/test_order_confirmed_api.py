"""The confirmed price, window and category on the customer's ``OrderRead`` (#165).

Contract: docs/api/orders.md, "Customer pilot changes (#99)". The orders
service is faked (fixtures from test_orders_api.py), so these cover what the
router shows for a confirmed and an unconfirmed order, and that the staff
views do not carry the customer-only fields. Database behaviour is in
test_order_confirmed_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth.models import UserRole
from app.modules.orders import service
from app.modules.orders.models import Order, OrderStatus
from app.modules.orders.service import ConfirmedPrice
from tests import test_orders_api as orders_api
from tests.test_orders_api import FakeOrders, make_order, sign_in

# Fixtures shared with the orders API tests.
api = orders_api.api
fake_orders = orders_api.fake_orders

EXAMPLE = json.loads(
    (
        Path(__file__).resolve().parents[2] / "docs" / "api" / "examples" / "order-confirmed.json"
    ).read_text(encoding="utf-8")
)
WINDOW_START = datetime(2026, 10, 27, 9, tzinfo=UTC)
WINDOW_END = datetime(2026, 10, 27, 11, tzinfo=UTC)
CONFIRMED_KEYS = ("delivery_window", "price", "water_category")


def confirmed_order() -> Order:
    return make_order(
        status=OrderStatus.CONFIRMED,
        delivery_window_start_at=WINDOW_START,
        delivery_window_end_at=WINDOW_END,
    )


def confirm_in_service(
    monkeypatch: pytest.MonkeyPatch,
    order: Order,
    *,
    supported_uses: str | None = None,
    is_manual: bool = True,
) -> None:
    """Make the faked service return ``order`` with a snapshot of 45,000 naira."""

    async def get(_: object, **kwargs: Any) -> Order:
        return order

    async def prices(_: object, order_ids: Any) -> dict[uuid.UUID, ConfirmedPrice]:
        assert order.id in set(order_ids)
        return {
            order.id: ConfirmedPrice(
                total_minor_units=4_500_000,
                is_manual=is_manual,
                water_category_label="Utility Water",
                supported_uses=supported_uses,
            )
        }

    monkeypatch.setattr(service, "get_customer_order", get)
    monkeypatch.setattr(service, "confirmed_prices_by_order", prices)


def get_order(client: TestClient) -> Any:
    return client.get("/api/v1/orders/MO-7KQ2M9XH4T", headers=sign_in(client, UserRole.CUSTOMER))


def test_a_confirmed_order_shows_its_window_price_and_category(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    confirm_in_service(monkeypatch, confirmed_order())
    body = get_order(api).json()
    assert {key: body[key] for key in CONFIRMED_KEYS} == {
        key: EXAMPLE[key] for key in CONFIRMED_KEYS
    }


def test_the_category_carries_its_current_supported_uses(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    confirm_in_service(monkeypatch, confirmed_order(), supported_uses="Washing and building")
    body = get_order(api).json()
    assert body["water_category"] == {
        "label": "Utility Water",
        "supported_uses": "Washing and building",
    }


def test_a_server_quote_confirmed_as_it_was_is_not_manual(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    confirm_in_service(monkeypatch, confirmed_order(), is_manual=False)
    assert get_order(api).json()["price"]["manual"] is False


def test_an_unconfirmed_order_has_null_fields(api: TestClient) -> None:
    body = get_order(api).json()
    assert [body[key] for key in CONFIRMED_KEYS] == [None] * 3


def test_creating_an_order_returns_null_fields(api: TestClient) -> None:
    response = api.post(
        "/api/v1/orders",
        json=orders_api.VALID_BODY,
        headers=sign_in(api, UserRole.CUSTOMER),
    )
    assert response.status_code == 201
    assert [response.json()[key] for key in CONFIRMED_KEYS] == [None] * 3


def test_the_list_shows_the_fields_too(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    order = confirmed_order()

    async def listing(_: object, **kwargs: Any) -> tuple[list[Order], int]:
        return [order], 1

    confirm_in_service(monkeypatch, order)
    monkeypatch.setattr(service, "list_customer_orders", listing)
    items = api.get("/api/v1/orders", headers=sign_in(api, UserRole.CUSTOMER)).json()["items"]
    assert items[0]["price"] == EXAMPLE["price"]


def test_another_customers_order_is_still_not_found(
    api: TestClient, fake_orders: FakeOrders
) -> None:
    fake_orders.error = APIError(404, "order_not_found", "Order not found")
    response = get_order(api)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "order_not_found"
    assert not any(key in response.json() for key in CONFIRMED_KEYS)
