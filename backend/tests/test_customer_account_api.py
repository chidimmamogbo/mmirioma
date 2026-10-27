"""Customer profile and saved address endpoint tests that need no database.

docs/api/customer-account.md, "Profile" and "Saved addresses". Session
lookup and the customer service are replaced with in-memory fakes, so these
cover roles (FR-001), CSRF, request validation, status codes and response
bodies against the contract's examples. Database behaviour is in
test_customer_account_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.auth import security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.customers import service
from app.modules.customers.models import CustomerAddress
from app.modules.pricing.models import ServiceZone

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


PROFILE_EXAMPLE = example("customer-profile.json")
ADDRESSES_EXAMPLE = example("saved-addresses-page.json")
CREATE_EXAMPLE = example("address-create-request.json")
DEFAULT_ERROR_EXAMPLE = example("error-default-address.json")

USERS = {
    role: User(
        id=uuid.uuid4(),
        name=PROFILE_EXAMPLE["name"],
        phone=PROFILE_EXAMPLE["phone"],
        password_hash="x",
        role=role,
        phone_verified_at=datetime(2026, 10, 14, 9, 35, tzinfo=UTC),
        created_at=datetime.fromisoformat(PROFILE_EXAMPLE["customer_since"]),
    )
    for role in UserRole
}
CUSTOMER = USERS[UserRole.CUSTOMER]
ADDRESS_ID = ADDRESSES_EXAMPLE["items"][0]["id"]

ENDPOINTS: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/v1/me/profile", None),
    ("GET", "/api/v1/me/addresses", None),
    ("POST", "/api/v1/me/addresses", CREATE_EXAMPLE),
    ("PATCH", f"/api/v1/me/addresses/{ADDRESS_ID}", CREATE_EXAMPLE),
    ("POST", f"/api/v1/me/addresses/{ADDRESS_ID}/default", None),
    ("DELETE", f"/api/v1/me/addresses/{ADDRESS_ID}", None),
]
UNSAFE = [endpoint for endpoint in ENDPOINTS if endpoint[0] != "GET"]


def view_from(body: dict[str, Any]) -> service.AddressView:
    """The service view that should produce ``body`` (a contract example)."""
    zone = body["zone"]
    return service.AddressView(
        address=CustomerAddress(
            id=uuid.UUID(body["id"]),
            customer_id=CUSTOMER.id,
            zone_id=uuid.UUID(zone["id"]),
            label=body["label"],
            address=body["address"],
            landmark=body["landmark"],
            is_default=body["is_default"],
            created_at=datetime.fromisoformat(body["created_at"]),
            updated_at=datetime.fromisoformat(body["updated_at"]),
        ),
        zone=ServiceZone(id=uuid.UUID(zone["id"]), name=zone["name"], is_active=zone["is_active"]),
    )


VIEWS = [view_from(item) for item in ADDRESSES_EXAMPLE["items"]]


class FakeCustomers:
    """Records service calls and returns canned results."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.error: APIError | None = None

    def _record(self, name: str, **kwargs: Any) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def get_profile(self, _: object, customer: User) -> service.CustomerProfile:
        self._record("get_profile", customer=customer)
        stats = PROFILE_EXAMPLE["stats"]
        return service.CustomerProfile(
            user=customer, order_count=stats["orders"], address_count=stats["addresses"]
        )

    async def list_addresses(
        self, _: object, customer: User, **kwargs: Any
    ) -> tuple[list[service.AddressView], int]:
        self._record("list_addresses", customer=customer, **kwargs)
        return VIEWS, ADDRESSES_EXAMPLE["total"]

    async def add_address(
        self, _: object, customer: User, data: service.AddressData
    ) -> service.AddressView:
        self._record("add_address", data=data)
        return VIEWS[1]

    async def update_address(
        self, _: object, customer: User, address_id: uuid.UUID, data: service.AddressData
    ) -> service.AddressView:
        self._record("update_address", address_id=address_id, data=data)
        return VIEWS[1]

    async def set_default_address(
        self, _: object, customer: User, address_id: uuid.UUID
    ) -> service.AddressView:
        self._record("set_default_address", address_id=address_id)
        return VIEWS[0]

    async def remove_address(self, _: object, customer: User, address_id: uuid.UUID) -> None:
        self._record("remove_address", address_id=address_id)


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeCustomers:
    fake = FakeCustomers()
    for name in (
        "get_profile",
        "list_addresses",
        "add_address",
        "update_address",
        "set_default_address",
        "remove_address",
    ):
        monkeypatch.setattr(service, name, getattr(fake, name))
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: FakeCustomers) -> TestClient:
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


# --- Access (FR-001) ---------------------------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_signed_out_requests_are_not_authenticated(
    api: TestClient, fake: FakeCustomers, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = call(api, method, path, body, {})
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert error_code(response) == "not_authenticated"
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_staff_and_drivers_are_forbidden(
    api: TestClient,
    fake: FakeCustomers,
    role: UserRole,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = call(api, method, path, body, sign_in(api, role))
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert error_code(response) == "forbidden"
    assert fake.calls == []


@pytest.mark.parametrize(("method", "path", "body"), UNSAFE)
def test_unsafe_requests_need_the_csrf_token(
    api: TestClient, fake: FakeCustomers, method: str, path: str, body: dict[str, Any] | None
) -> None:
    sign_in(api, UserRole.CUSTOMER)
    response = call(api, method, path, body, {})
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert error_code(response) == "csrf_failed"
    assert fake.calls == []


# --- Profile -----------------------------------------------------------------


def test_profile_matches_the_contract_example(api: TestClient) -> None:
    response = api.get("/api/v1/me/profile", headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.OK
    assert response.json() == PROFILE_EXAMPLE


# --- Saved addresses ---------------------------------------------------------


def test_address_page_matches_the_contract_example(api: TestClient, fake: FakeCustomers) -> None:
    response = api.get(
        "/api/v1/me/addresses?limit=50&offset=0", headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json() == ADDRESSES_EXAMPLE
    assert fake.calls == [("list_addresses", {"customer": CUSTOMER, "limit": 50, "offset": 0})]


def test_create_returns_201_and_passes_the_trimmed_address(
    api: TestClient, fake: FakeCustomers
) -> None:
    body = {**CREATE_EXAMPLE, "label": "  Office ", "landmark": "   "}
    response = api.post("/api/v1/me/addresses", json=body, headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.CREATED
    assert response.json() == ADDRESSES_EXAMPLE["items"][1]
    assert fake.calls == [
        (
            "add_address",
            {
                "data": service.AddressData(
                    label="Office",
                    address=CREATE_EXAMPLE["address"],
                    landmark=None,
                    zone_id=uuid.UUID(CREATE_EXAMPLE["zone_id"]),
                    make_default=False,
                )
            },
        )
    ]


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"label": ""}, "label"),
        ({"label": "x" * 51}, "label"),
        ({"address": "abcd"}, "address"),
        ({"address": "x" * 501}, "address"),
        ({"landmark": "x" * 201}, "landmark"),
        ({"zone_id": "not-a-uuid"}, "zone_id"),
        ({"make_default": "yes"}, "make_default"),
        ({"is_default": True}, "is_default"),
    ],
)
def test_invalid_address_bodies_are_validation_errors(
    api: TestClient, fake: FakeCustomers, change: dict[str, Any], field: str
) -> None:
    response = api.post(
        "/api/v1/me/addresses",
        json={**CREATE_EXAMPLE, **change},
        headers=sign_in(api, UserRole.CUSTOMER),
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert error_code(response) == "validation_error"
    assert ["body", field] in [detail["loc"] for detail in response.json()["error"]["details"]]
    assert fake.calls == []


def test_a_missing_zone_is_a_validation_error(api: TestClient, fake: FakeCustomers) -> None:
    body = {key: value for key, value in CREATE_EXAMPLE.items() if key != "zone_id"}
    response = api.post("/api/v1/me/addresses", json=body, headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert fake.calls == []


def test_update_and_default_return_the_address(api: TestClient, fake: FakeCustomers) -> None:
    headers = sign_in(api, UserRole.CUSTOMER)
    updated = api.patch(f"/api/v1/me/addresses/{ADDRESS_ID}", json=CREATE_EXAMPLE, headers=headers)
    default = api.post(f"/api/v1/me/addresses/{ADDRESS_ID}/default", headers=headers)
    assert (updated.status_code, default.status_code) == (HTTPStatus.OK, HTTPStatus.OK)
    assert default.json() == ADDRESSES_EXAMPLE["items"][0]
    assert [name for name, _ in fake.calls] == ["update_address", "set_default_address"]
    assert fake.calls[1][1] == {"address_id": uuid.UUID(ADDRESS_ID)}


def test_delete_returns_204_with_no_body(api: TestClient, fake: FakeCustomers) -> None:
    response = api.delete(
        f"/api/v1/me/addresses/{ADDRESS_ID}", headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == HTTPStatus.NO_CONTENT
    assert response.content == b""
    assert fake.calls == [("remove_address", {"address_id": uuid.UUID(ADDRESS_ID)})]


@pytest.mark.parametrize(
    ("method", "path", "error"),
    [
        (
            "DELETE",
            f"/api/v1/me/addresses/{ADDRESS_ID}",
            APIError(
                HTTPStatus.CONFLICT,
                "default_address",
                "Choose another default address before removing this one",
            ),
        ),
        (
            "POST",
            "/api/v1/me/addresses",
            APIError(HTTPStatus.CONFLICT, "address_limit_reached", "Limit"),
        ),
        (
            "POST",
            "/api/v1/me/addresses",
            APIError(HTTPStatus.NOT_FOUND, "service_zone_not_found", "Service zone not found"),
        ),
        (
            "PATCH",
            f"/api/v1/me/addresses/{ADDRESS_ID}",
            APIError(HTTPStatus.NOT_FOUND, "address_not_found", "Address not found"),
        ),
        (
            "POST",
            f"/api/v1/me/addresses/{ADDRESS_ID}/default",
            APIError(HTTPStatus.NOT_FOUND, "address_not_found", "Address not found"),
        ),
    ],
)
def test_service_errors_use_the_error_envelope(
    api: TestClient, fake: FakeCustomers, method: str, path: str, error: APIError
) -> None:
    fake.error = error
    body = CREATE_EXAMPLE if method in {"POST", "PATCH"} and "default" not in path else None
    response = call(api, method, path, body, sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == error.status_code
    assert error_code(response) == error.code


def test_default_address_error_matches_the_contract_example(
    api: TestClient, fake: FakeCustomers
) -> None:
    fake.error = APIError(
        HTTPStatus.CONFLICT,
        "default_address",
        "Choose another default address before removing this one",
    )
    response = api.delete(
        f"/api/v1/me/addresses/{ADDRESS_ID}", headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.json() == DEFAULT_ERROR_EXAMPLE
