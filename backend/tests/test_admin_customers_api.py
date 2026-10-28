"""Admin customer directory endpoints that need no database (#45).

docs/api/admin-directory.md, "Customers": roles (FR-001), the CSRF header on
the address write, the query rules (``q`` trimmed, 1-100 characters; ``limit``
1-100; ``offset`` 0 or more), the address body rules (extra fields refused), no
create endpoint, and bodies equal to the contract examples, with the
directory service faked. The queries and rules themselves run against a real
database in test_admin_customers_integration.py.
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth.dependencies import CSRF_HEADER_NAME
from app.modules.auth.models import User, UserRole
from app.modules.customers import directory
from app.modules.customers.models import CustomerAddress
from app.modules.orders.models import DeliveryType, Order, OrderStatus
from app.modules.pricing.models import ServiceZone
from tests import test_customer_account_api as account_api
from tests.test_customer_account_api import sign_in

api = account_api.api
fake = account_api.fake  # the customer service fakes the shared client needs

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


PAGE = example("admin-customers-page.json")
CUSTOMER = example("admin-customer.json")
ADDRESS_REQUEST = example("admin-customer-address-request.json")

LIST_PATH = "/api/v1/admin/customers"
DETAIL_PATH = f"{LIST_PATH}/{CUSTOMER['id']}"
ADDRESS_PATH = f"{DETAIL_PATH}/addresses"
ENDPOINTS = [("GET", LIST_PATH), ("GET", DETAIL_PATH), ("POST", ADDRESS_PATH)]


def at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def customer_user(body: dict[str, Any]) -> User:
    return User(
        id=uuid.UUID(body["id"]),
        name=body["name"],
        phone=body["phone"],
        role=UserRole.CUSTOMER,
        is_active=body["is_active"],
        phone_verified_at=at(body["created_at"]) if body["phone_verified"] else None,
        created_at=at(body["created_at"]),
    )


def detail_from_example() -> directory.CustomerDetail:
    addresses = []
    for item in CUSTOMER["addresses"]:
        address = CustomerAddress(
            id=uuid.UUID(item["id"]),
            label=item["label"],
            address=item["address"],
            landmark=item["landmark"],
            is_default=item["is_default"],
            created_at=at(item["created_at"]),
        )
        zone = ServiceZone(
            id=uuid.UUID(item["zone"]["id"]),
            name=item["zone"]["name"],
            is_active=item["zone"]["is_active"],
        )
        addresses.append(directory.AddressWithZone(address, zone))
    orders = [
        Order(
            reference=item["reference"],
            created_at=at(item["created_at"]),
            status=OrderStatus(item["status"]),
            quantity_litres=item["quantity_litres"],
            delivery_type=DeliveryType(item["delivery_type"]) if item["delivery_type"] else None,
        )
        for item in CUSTOMER["recent_orders"]
    ]
    return directory.CustomerDetail(
        row=directory.CustomerRow(customer_user(CUSTOMER), CUSTOMER["orders_count"]),
        paid_total_minor_units=CUSTOMER["paid_total_minor_units"],
        addresses=addresses,
        recent_orders=orders,
    )


class FakeDirectory:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.missing = False

    async def list_customers(self, _: object, **kwargs: Any) -> directory.CustomerPage:
        self.calls.append(("list_customers", kwargs))
        rows = [directory.CustomerRow(customer_user(i), i["orders_count"]) for i in PAGE["items"]]
        return directory.CustomerPage(
            rows=rows, total=PAGE["total"], ordered_last_7_days=PAGE["ordered_last_7_days"]
        )

    async def get_customer(self, _: object, customer_id: uuid.UUID) -> directory.CustomerDetail:
        self.calls.append(("get_customer", {"customer_id": customer_id}))
        if self.missing:
            raise APIError(404, "customer_not_found", "Customer not found")
        return detail_from_example()

    async def add_address(self, _: object, **kwargs: Any) -> directory.CustomerDetail:
        self.calls.append(("add_address", kwargs))
        if self.missing:
            raise APIError(404, "customer_not_found", "Customer not found")
        return detail_from_example()


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch) -> FakeDirectory:
    fake_directory = FakeDirectory()
    for name in ("list_customers", "get_customer", "add_address"):
        monkeypatch.setattr(directory, name, getattr(fake_directory, name))
    return fake_directory


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


def request(client: TestClient, method: str, path: str, headers: dict[str, str]) -> Any:
    body = ADDRESS_REQUEST if method == "POST" else None
    return client.request(method, path, json=body, headers=headers)


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_signed_out_is_not_authenticated(
    api: TestClient, service: FakeDirectory, method: str, path: str
) -> None:
    response = request(api, method, path, {})
    assert (response.status_code, error_code(response)) == (401, "not_authenticated")
    assert service.calls == []


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_customers_and_drivers_are_forbidden(
    api: TestClient, service: FakeDirectory, role: UserRole, method: str, path: str
) -> None:
    response = request(api, method, path, sign_in(api, role))
    assert (response.status_code, error_code(response)) == (403, "forbidden")
    assert service.calls == []


def test_the_list_matches_the_example_and_passes_the_defaults(
    api: TestClient, service: FakeDirectory
) -> None:
    response = api.get(LIST_PATH, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json() == PAGE
    assert service.calls == [("list_customers", {"q": None, "limit": 50, "offset": 0})]


def test_the_search_text_is_trimmed_before_it_reaches_the_service(
    api: TestClient, service: FakeDirectory
) -> None:
    api.get(
        LIST_PATH,
        params={"q": "  Ada  ", "limit": 10, "offset": 20},
        headers=sign_in(api, UserRole.ADMIN),
    )
    assert service.calls == [("list_customers", {"q": "Ada", "limit": 10, "offset": 20})]


@pytest.mark.parametrize(
    "query",
    [{"q": ""}, {"q": "   "}, {"q": "x" * 101}, {"limit": 0}, {"limit": 101}, {"offset": -1}],
)
def test_bad_list_queries_are_validation_errors(
    api: TestClient, service: FakeDirectory, query: dict[str, Any]
) -> None:
    response = api.get(LIST_PATH, params=query, headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert service.calls == []


def test_the_detail_matches_the_example(api: TestClient, service: FakeDirectory) -> None:
    response = api.get(DETAIL_PATH, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json() == CUSTOMER
    assert service.calls == [("get_customer", {"customer_id": uuid.UUID(CUSTOMER["id"])})]


def test_an_unknown_customer_is_404_customer_not_found(
    api: TestClient, service: FakeDirectory
) -> None:
    service.missing = True
    response = api.get(DETAIL_PATH, headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (404, "customer_not_found")


def test_a_malformed_customer_id_is_a_validation_error(
    api: TestClient, service: FakeDirectory
) -> None:
    response = api.get(f"{LIST_PATH}/not-an-id", headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert service.calls == []


def test_saving_an_address_returns_201_and_the_whole_customer(
    api: TestClient, service: FakeDirectory
) -> None:
    response = api.post(ADDRESS_PATH, json=ADDRESS_REQUEST, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 201
    assert response.json() == CUSTOMER
    name, kwargs = service.calls[0]
    assert name == "add_address"
    assert kwargs["customer_id"] == uuid.UUID(CUSTOMER["id"])
    assert {key: kwargs[key] for key in ("label", "address", "landmark")} == {
        key: ADDRESS_REQUEST[key] for key in ("label", "address", "landmark")
    }
    assert kwargs["zone_id"] == uuid.UUID(ADDRESS_REQUEST["zone_id"])
    assert kwargs["admin"].role is UserRole.ADMIN


def test_saving_an_address_needs_the_csrf_header(api: TestClient, service: FakeDirectory) -> None:
    headers = sign_in(api, UserRole.ADMIN)
    headers.pop(CSRF_HEADER_NAME)
    response = api.post(ADDRESS_PATH, json=ADDRESS_REQUEST, headers=headers)
    assert (response.status_code, error_code(response)) == (403, "csrf_failed")
    assert service.calls == []


@pytest.mark.parametrize(
    "changes",
    [
        {"label": ""},
        {"label": "x" * 51},
        {"address": "abc"},
        {"address": "x" * 501},
        {"landmark": "x" * 201},
        {"zone_id": "not-a-uuid"},
        {"zone_id": None},
        {"is_default": True},  # unknown fields are refused: the first address is the default
    ],
)
def test_a_bad_address_body_is_a_validation_error(
    api: TestClient, service: FakeDirectory, changes: dict[str, Any]
) -> None:
    body = {**ADDRESS_REQUEST, **changes}
    response = api.post(ADDRESS_PATH, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert service.calls == []


def test_a_missing_zone_is_a_validation_error(api: TestClient, service: FakeDirectory) -> None:
    body = {key: value for key, value in ADDRESS_REQUEST.items() if key != "zone_id"}
    response = api.post(ADDRESS_PATH, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert (response.status_code, error_code(response)) == (422, "validation_error")


def test_the_address_text_is_trimmed(api: TestClient, service: FakeDirectory) -> None:
    body = {**ADDRESS_REQUEST, "label": "  Shop  ", "address": "  4 Sample Market Road  "}
    api.post(ADDRESS_PATH, json=body, headers=sign_in(api, UserRole.ADMIN))
    kwargs = service.calls[0][1]
    assert (kwargs["label"], kwargs["address"]) == ("Shop", "4 Sample Market Road")


def test_staff_cannot_create_customers(api: TestClient, service: FakeDirectory) -> None:
    # Decided 2026-10-26: customers register themselves, so there is no create endpoint.
    response = api.post(
        LIST_PATH,
        json={"name": "Sample", "phone": "08000000001"},
        headers=sign_in(api, UserRole.ADMIN),
    )
    assert response.status_code in (404, 405)
    assert service.calls == []
