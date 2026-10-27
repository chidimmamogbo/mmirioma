"""``POST /auth/password`` without a database (#56).

Contract: docs/api/auth.md, "Change password" (agreed in #8). Sessions are
faked (cookie value = role name, as in test_auth_api.py) and the service's
password check and change are replaced, so these cover the request rules,
every role, CSRF, the error codes and the sign-in failure limits. Database
behaviour (the hash, revoked sessions, the audit row) is in
test_change_password_integration.py.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth import service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import UserRole
from tests.test_auth_api import csrf_for, error_code, fake_session

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"
REQUEST = json.loads((EXAMPLES / "change-password-request.json").read_text())
PATH = "/api/v1/auth/password"


class Fake:
    """Records calls; ``wrong`` makes the current-password check fail."""

    def __init__(self) -> None:
        self.checked: list[str] = []
        self.changed: list[dict[str, Any]] = []
        self.wrong = False


@pytest.fixture
def fake(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Fake:
    calls = Fake()

    async def lookup(_: object, token: str) -> service.AuthenticatedSession | None:
        try:
            return fake_session(UserRole(token), token)
        except ValueError:
            return None

    async def check_password(user: object, password: str) -> None:
        calls.checked.append(password)
        if calls.wrong:
            raise APIError(403, "password_incorrect", "Your password is incorrect")

    async def change_password(_: object, **kwargs: Any) -> None:
        calls.changed.append(kwargs)

    monkeypatch.setattr(service, "get_authenticated_session", lookup)
    monkeypatch.setattr(service, "check_password", check_password)
    monkeypatch.setattr(service, "change_password", change_password)
    return calls


def post(client: TestClient, body: Any, role: UserRole = UserRole.CUSTOMER) -> Any:
    client.cookies.set(SESSION_COOKIE_NAME, role.value)
    return client.post(PATH, json=body, headers={CSRF_HEADER_NAME: csrf_for(role.value)})


@pytest.mark.parametrize("role", list(UserRole))
def test_any_role_changes_its_password(client: TestClient, fake: Fake, role: UserRole) -> None:
    response = post(client, REQUEST, role)
    assert response.status_code == 204
    assert response.content == b""
    assert fake.checked == ["sample-current-password"]
    (call,) = fake.changed
    assert call["new_password"] == "sample-new-password"
    assert call["auth"].user.role is role


def test_signed_out_and_csrf(client: TestClient, fake: Fake) -> None:
    response = client.post(PATH, json=REQUEST)
    assert (response.status_code, error_code(response)) == (401, "not_authenticated")
    client.cookies.set(SESSION_COOKIE_NAME, UserRole.CUSTOMER.value)
    response = client.post(PATH, json=REQUEST)
    assert (response.status_code, error_code(response)) == (403, "csrf_failed")
    assert fake.checked == []


def test_wrong_current_password_is_403_and_changes_nothing(client: TestClient, fake: Fake) -> None:
    fake.wrong = True
    response = post(client, REQUEST)
    assert (response.status_code, error_code(response)) == (403, "password_incorrect")
    assert fake.changed == []


def test_wrong_passwords_count_against_the_sign_in_limit(client: TestClient, fake: Fake) -> None:
    # 5 failures per phone per 15 minutes, as for sign-in (docs/api/auth.md).
    fake.wrong = True
    for _ in range(5):
        assert post(client, REQUEST).status_code == 403
    fake.wrong = False
    response = post(client, REQUEST)
    assert (response.status_code, error_code(response)) == (429, "too_many_attempts")
    assert int(response.headers["Retry-After"]) > 0
    # Refused before the password was checked, so nothing is learned from it.
    assert len(fake.checked) == 5
    assert fake.changed == []


def test_a_right_password_does_not_use_up_the_limit(client: TestClient, fake: Fake) -> None:
    for _ in range(6):
        assert post(client, REQUEST).status_code == 204


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({**REQUEST, "new_password": "x" * 7}, "new_password"),
        ({**REQUEST, "new_password": "x" * 129}, "new_password"),
        ({**REQUEST, "current_password": ""}, "current_password"),
        ({"current_password": "sample-current-password"}, "new_password"),
        ({"new_password": "sample-new-password"}, "current_password"),
        ({**REQUEST, "new_password_again": "sample-new-password"}, "new_password_again"),
    ],
)
def test_invalid_bodies_are_422_on_the_field(
    client: TestClient, fake: Fake, body: dict[str, Any], field: str
) -> None:
    response = post(client, body)
    assert (response.status_code, error_code(response)) == (422, "validation_error")
    assert [item["loc"] for item in response.json()["error"]["details"]] == [["body", field]]
    assert fake.checked == []


def test_the_password_incorrect_example_matches_the_code() -> None:
    body = json.loads((EXAMPLES / "error-password-incorrect.json").read_text())
    assert body["error"]["code"] == "password_incorrect"
    assert body["error"]["details"] is None
