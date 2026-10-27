"""Customer notification endpoint tests that need no database.

docs/api/customer-account.md, "Notifications": roles (FR-001), CSRF, the
page body against the contract example, and the mark-read request. The
notification service is faked; its queries are covered by the partner and
customer integration tests.
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
from app.modules.auth import security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import Notification

EXAMPLE = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "api"
        / "examples"
        / "customer-notifications-page.json"
    ).read_text(encoding="utf-8")
)

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
CUSTOMER = USERS[UserRole.CUSTOMER]

ENDPOINTS: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/v1/me/notifications", None),
    ("POST", "/api/v1/me/notifications/read", {}),
]


def example_page() -> notifications_service.NotificationPage:
    views = [
        notifications_service.NotificationView(
            notification=Notification(
                id=uuid.UUID(item["id"]),
                user_id=CUSTOMER.id,
                kind=item["kind"],
                title=item["title"],
                body=item["body"],
                created_at=datetime.fromisoformat(item["created_at"]),
                read_at=datetime.fromisoformat(item["read_at"]) if item["read_at"] else None,
            ),
            order_reference=item["reference"],
        )
        for item in EXAMPLE["items"]
    ]
    return notifications_service.NotificationPage(
        items=views, total=EXAMPLE["total"], unread_count=EXAMPLE["unread_count"]
    )


class FakeNotifications:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def list_for_user(
        self, _: object, **kwargs: Any
    ) -> notifications_service.NotificationPage:
        self.calls.append(("list_for_user", kwargs))
        return example_page()

    async def mark_read(self, _: object, **kwargs: Any) -> None:
        self.calls.append(("mark_read", kwargs))


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeNotifications:
    fake = FakeNotifications()
    monkeypatch.setattr(notifications_service, "list_for_user", fake.list_for_user)
    monkeypatch.setattr(notifications_service, "mark_read", fake.mark_read)
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: FakeNotifications) -> TestClient:
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


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_signed_out_is_not_authenticated(
    api: TestClient, fake: FakeNotifications, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = api.request(method, path, json=body)
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert error_code(response) == "not_authenticated"
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_staff_and_drivers_are_forbidden(
    api: TestClient,
    fake: FakeNotifications,
    role: UserRole,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = api.request(method, path, json=body, headers=sign_in(api, role))
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert error_code(response) == "forbidden"
    assert fake.calls == []


def test_mark_read_needs_the_csrf_token(api: TestClient, fake: FakeNotifications) -> None:
    sign_in(api, UserRole.CUSTOMER)
    response = api.post("/api/v1/me/notifications/read", json={})
    assert (response.status_code, error_code(response)) == (HTTPStatus.FORBIDDEN, "csrf_failed")
    assert fake.calls == []


def test_page_matches_the_contract_example(api: TestClient, fake: FakeNotifications) -> None:
    response = api.get("/api/v1/me/notifications", headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.OK
    assert response.json() == EXAMPLE
    assert fake.calls == [("list_for_user", {"user_id": CUSTOMER.id, "limit": 50, "offset": 0})]


@pytest.mark.parametrize(
    ("body", "ids"),
    [
        (None, None),
        ({}, None),
        ({"ids": [EXAMPLE["items"][0]["id"]]}, [uuid.UUID(EXAMPLE["items"][0]["id"])]),
    ],
)
def test_mark_read_marks_the_given_ids_or_every_unread_one(
    api: TestClient, fake: FakeNotifications, body: dict[str, Any] | None, ids: object
) -> None:
    response = api.post(
        "/api/v1/me/notifications/read", json=body, headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == HTTPStatus.NO_CONTENT
    assert fake.calls == [("mark_read", {"user_id": CUSTOMER.id, "ids": ids})]


@pytest.mark.parametrize(
    "body",
    [
        {"ids": ["not-a-uuid"]},
        {"ids": [str(uuid.uuid4()) for _ in range(101)]},
        {"ids": [], "extra": True},
    ],
)
def test_bad_mark_read_bodies_are_validation_errors(
    api: TestClient, fake: FakeNotifications, body: dict[str, Any]
) -> None:
    response = api.post(
        "/api/v1/me/notifications/read", json=body, headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert error_code(response) == "validation_error"
    assert fake.calls == []


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1"])
def test_bad_page_queries_are_validation_errors(
    api: TestClient, fake: FakeNotifications, query: str
) -> None:
    response = api.get(f"/api/v1/me/notifications?{query}", headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert fake.calls == []
