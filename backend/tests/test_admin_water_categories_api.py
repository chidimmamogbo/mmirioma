"""``GET /admin/water-categories`` tests that need no database (#161).

Contract: docs/api/admin-directory.md, "Amendment (#160): the list of water
categories" (agreed 2026-10-28). The pricing service is faked, so these cover
roles (FR-001, T-07), the response shape against the contract example, the
fields left out (``code``), and that inactive categories are passed on.
Database behaviour is in test_admin_water_categories_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.modules.auth import security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.pricing import service as pricing_service
from app.modules.pricing.schemas import AdminWaterCategoryList
from app.modules.sources.models import WaterCategory
from tests.test_dispatch_api import keys

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"
NOW = datetime(2026, 10, 28, 10, 0, tzinfo=UTC)
URL = "/api/v1/admin/water-categories"

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


def example() -> Any:
    return json.loads((EXAMPLES / "admin-water-categories.json").read_text(encoding="utf-8"))


def categories() -> list[WaterCategory]:
    """The contract example as rows, with a ``code`` the response must not show."""
    return [
        WaterCategory(
            id=uuid.UUID(item["id"]),
            code=f"code-{index}",
            label=item["label"],
            supported_uses="Not for the response",
            is_active=item["is_active"],
        )
        for index, item in enumerate(example()["items"])
    ]


class Fake:
    """Stands in for the pricing service and records its calls."""

    def __init__(self) -> None:
        self.calls = 0

    async def list_water_categories(self, _: object) -> list[WaterCategory]:
        self.calls += 1
        return categories()


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Fake:
    fake = Fake()
    monkeypatch.setattr(pricing_service, "list_water_categories", fake.list_water_categories)
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: Fake) -> TestClient:
    """Client whose session cookie value names the signed-in role."""

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
    return client


def sign_in(client: TestClient, role: UserRole) -> dict[str, str]:
    client.cookies.set(SESSION_COOKIE_NAME, role.value)
    secret = get_settings().session_secret.get_secret_value()
    return {CSRF_HEADER_NAME: security.csrf_token_for(role.value, secret)}


def test_the_example_matches_the_response_schema() -> None:
    AdminWaterCategoryList.model_validate(example())


def test_an_admin_gets_the_contract_example(api: TestClient, fake: Fake) -> None:
    response = api.get(URL, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json() == example()
    assert keys(response.json()) == keys(example())
    assert fake.calls == 1


def test_the_list_never_shows_the_code_or_the_description(api: TestClient) -> None:
    items = api.get(URL, headers=sign_in(api, UserRole.ADMIN)).json()["items"]
    assert all(set(item) == {"id", "label", "is_active"} for item in items)


def test_inactive_categories_are_listed_with_their_flag(api: TestClient) -> None:
    items = api.get(URL, headers=sign_in(api, UserRole.ADMIN)).json()["items"]
    assert [item["is_active"] for item in items] == [False, True]


def test_the_list_keeps_the_order_the_service_gives(api: TestClient) -> None:
    items = api.get(URL, headers=sign_in(api, UserRole.ADMIN)).json()["items"]
    assert [item["label"] for item in items] == ["Potable Water", "Utility Water"]


def test_signed_out_is_not_authenticated(api: TestClient, fake: Fake) -> None:
    response = api.get(URL)
    assert (response.status_code, response.json()["error"]["code"]) == (401, "not_authenticated")
    assert fake.calls == 0


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.DRIVER])
def test_t07_only_admins_read_the_list(api: TestClient, fake: Fake, role: UserRole) -> None:
    response = api.get(URL, headers=sign_in(api, role))
    assert (response.status_code, response.json()["error"]["code"]) == (403, "forbidden")
    assert fake.calls == 0


def test_the_list_is_read_only(api: TestClient, fake: Fake) -> None:
    headers = sign_in(api, UserRole.ADMIN)
    for method in ("POST", "PATCH", "PUT", "DELETE"):
        assert api.request(method, URL, json={}, headers=headers).status_code in (404, 405)
    assert fake.calls == 0
