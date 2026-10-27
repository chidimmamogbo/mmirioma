"""Order details on ``POST /orders`` and ``OrderRead``, without a database (#21).

Contract: docs/api/order-details-and-price.md, "Delivery details", "POST
/orders changes" and "OrderRead changes" (agreed 2026-10-26). The orders
service is faked (fixtures from test_orders_api.py), so these cover the new
request shape and its validation, what the router passes to the service, and
the new response fields. Database behaviour is in
test_order_details_integration.py.
"""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth.models import UserRole
from app.modules.orders import service
from app.modules.orders.models import DeliveryType, Order, TankType, WaterSourcePreference
from app.modules.orders.service import NewOrder
from app.modules.pricing import service as pricing
from tests import test_orders_api as orders_api
from tests.test_orders_api import VALID_BODY, FakeOrders, make_order, sign_in

# Fixtures shared with the orders API tests.
api = orders_api.api
fake_orders = orders_api.fake_orders

ZONE_ID = uuid.UUID("9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b")
OLD_SHAPE = {key: value for key, value in VALID_BODY.items() if key != "quantity_litres"}
KEKE = {**OLD_SHAPE, "delivery_type": "keke", "keke": {"can_size_litres": 25, "can_count": 24}}
TANKER = {
    **OLD_SHAPE,
    "delivery_type": "tanker",
    "tanker": {"tank_type": "ground", "quantity_local_gallons": 750},
    "water_source": "borehole",
    "service_zone_id": str(ZONE_ID),
}


def post(client: TestClient, body: dict[str, Any]) -> Any:
    return client.post("/api/v1/orders", json=body, headers=sign_in(client, UserRole.CUSTOMER))


def sent(fake: FakeOrders) -> NewOrder:
    assert [name for name, _ in fake.calls] == ["create_order"]
    return fake.calls[0][1]["request"]


def error(response: Any) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


def test_keke_quantity_is_cans_times_size(api: TestClient, fake_orders: FakeOrders) -> None:
    response = post(api, KEKE)
    assert response.status_code == 201
    request = sent(fake_orders)
    assert request.quantity_litres == 600
    assert (request.delivery_type, request.keke_can_size_litres, request.keke_can_count) == (
        DeliveryType.KEKE,
        25,
        24,
    )
    assert (request.tanker_tank_type, request.water_source, request.service_zone_id) == (
        None,
        None,
        None,
    )


def test_tanker_quantity_is_gallons_times_four(api: TestClient, fake_orders: FakeOrders) -> None:
    response = post(api, TANKER)
    assert response.status_code == 201
    request = sent(fake_orders)
    assert request.quantity_litres == 3000
    assert (request.tanker_tank_type, request.tanker_quantity_local_gallons) == (
        TankType.GROUND,
        750,
    )
    assert (request.water_source, request.service_zone_id) == (
        WaterSourcePreference.BOREHOLE,
        ZONE_ID,
    )


def test_any_can_count_reaching_600_litres(api: TestClient, fake_orders: FakeOrders) -> None:
    # Decision 4: not only the design's presets (12, 24, 30, 60).
    body = {**KEKE, "keke": {"can_size_litres": 50, "can_count": 13}}
    assert post(api, body).status_code == 201
    assert sent(fake_orders).quantity_litres == 650


def test_the_quantity_only_shape_still_works_with_a_zone(
    api: TestClient, fake_orders: FakeOrders
) -> None:
    response = post(api, {**VALID_BODY, "service_zone_id": str(ZONE_ID)})
    assert response.status_code == 201
    request = sent(fake_orders)
    assert (request.quantity_litres, request.delivery_type, request.service_zone_id) == (
        1200,
        None,
        ZONE_ID,
    )


INVALID = [
    pytest.param(
        {**KEKE, "keke": {"can_size_litres": 25, "can_count": 23}},
        ["body", "keke", "can_count"],
        id="keke-below-600-litres",
    ),
    pytest.param(
        {**TANKER, "tanker": {"tank_type": "ground", "quantity_local_gallons": 149}},
        ["body", "tanker", "quantity_local_gallons"],
        id="tanker-below-600-litres",
    ),
    pytest.param(
        {**KEKE, "keke": {"can_size_litres": 30, "can_count": 24}},
        ["body", "keke", "can_size_litres"],
        id="can-size-not-offered",
    ),
    pytest.param(
        {**KEKE, "keke": {"can_size_litres": 25, "can_count": "24"}},
        ["body", "keke", "can_count"],
        id="can-count-as-text",
    ),
    pytest.param(
        {**TANKER, "tanker": {"tank_type": "roof", "quantity_local_gallons": 750}},
        ["body", "tanker", "tank_type"],
        id="unknown-tank-type",
    ),
    pytest.param(
        {**TANKER, "water_source": "river"}, ["body", "water_source"], id="unknown-source"
    ),
    pytest.param({**TANKER, "water_source": None}, ["body"], id="tanker-without-source"),
    pytest.param({**KEKE, "water_source": "borehole"}, ["body"], id="keke-with-source"),
    pytest.param({**KEKE, "tanker": TANKER["tanker"]}, ["body"], id="keke-with-tanker-details"),
    pytest.param({**TANKER, "tanker": None}, ["body"], id="tanker-without-details"),
    pytest.param({**KEKE, "quantity_litres": 600}, ["body"], id="details-and-litres"),
    pytest.param(
        {**OLD_SHAPE, "quantity_litres": 600, "keke": KEKE["keke"]},
        ["body"],
        id="details-without-delivery-type",
    ),
    pytest.param(
        {**KEKE, "delivery_type": "bicycle"}, ["body", "delivery_type"], id="unknown-type"
    ),
    pytest.param(
        {**KEKE, "service_zone_id": "not-a-uuid"}, ["body", "service_zone_id"], id="bad-zone"
    ),
    pytest.param(
        {**KEKE, "water_category_id": str(uuid.uuid4())},
        ["body", "water_category_id"],
        id="category-field",
    ),
]


@pytest.mark.parametrize(("body", "loc"), INVALID)
def test_invalid_details_are_rejected(
    api: TestClient, fake_orders: FakeOrders, body: dict[str, Any], loc: list[Any]
) -> None:
    response = post(api, body)
    assert error(response) == (422, "validation_error")
    locs = [detail["loc"] for detail in response.json()["error"]["details"]]
    assert any(found[: len(loc)] == loc for found in locs), locs
    assert fake_orders.calls == []


def test_unknown_zone_passes_through(api: TestClient, fake_orders: FakeOrders) -> None:
    fake_orders.error = APIError(404, "service_zone_not_found", "Service zone not found")
    assert error(post(api, TANKER)) == (404, "service_zone_not_found")


def test_order_read_shows_the_details_and_the_zone(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    order = make_order(
        quantity_litres=3000,
        delivery_type=DeliveryType.TANKER,
        tanker_tank_type=TankType.GROUND,
        tanker_quantity_local_gallons=750,
        water_source=WaterSourcePreference.BOREHOLE,
        service_zone_id=ZONE_ID,
    )

    async def get(_: object, **kwargs: Any) -> Order:
        return order

    async def names(_: object, ids: Any) -> dict[uuid.UUID, str]:
        return {ZONE_ID: "Independence Layout"} if ZONE_ID in set(ids) else {}

    monkeypatch.setattr(service, "get_customer_order", get)
    monkeypatch.setattr(pricing, "zone_names", names)
    body = api.get("/api/v1/orders/MO-7KQ2M9XH4T", headers=sign_in(api, UserRole.CUSTOMER)).json()
    assert {key: body[key] for key in ("delivery_type", "keke", "tanker", "water_source")} == {
        "delivery_type": "tanker",
        "keke": None,
        "tanker": {"tank_type": "ground", "quantity_local_gallons": 750},
        "water_source": "borehole",
    }
    assert body["service_zone"] == {"id": str(ZONE_ID), "name": "Independence Layout"}


def test_older_orders_have_no_details(api: TestClient) -> None:
    body = api.get("/api/v1/orders/MO-7KQ2M9XH4T", headers=sign_in(api, UserRole.CUSTOMER)).json()
    assert [
        body[key] for key in ("delivery_type", "keke", "tanker", "water_source", "service_zone")
    ] == [None] * 5


# --- quote_id (#21) ----------------------------------------------------------------------


def test_quote_id_is_passed_to_the_service(api: TestClient, fake_orders: FakeOrders) -> None:
    quote_id = uuid.uuid4()
    assert post(api, {**TANKER, "quote_id": str(quote_id)}).status_code == 201
    assert sent(fake_orders).quote_id == quote_id


def test_quote_id_needs_the_delivery_details(api: TestClient, fake_orders: FakeOrders) -> None:
    response = post(api, {**VALID_BODY, "quote_id": str(uuid.uuid4())})
    assert error(response) == (422, "validation_error")
    assert fake_orders.calls == []


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (404, "quote_not_found"),
        (409, "quote_expired"),
        (422, "quote_mismatch"),
        (409, "no_eligible_source"),
    ],
)
def test_quote_refusals_pass_through(
    api: TestClient, fake_orders: FakeOrders, status: int, code: str
) -> None:
    fake_orders.error = APIError(status, code, "Sample message")
    assert error(post(api, {**TANKER, "quote_id": str(uuid.uuid4())})) == (status, code)
