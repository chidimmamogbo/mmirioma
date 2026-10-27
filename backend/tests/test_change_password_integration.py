"""``POST /auth/password`` against a real, migrated database (#56).

Contract: docs/api/auth.md, "Change password" (agreed in #8). Covers the new
hash (sign-in works with the new password only), every other session ending
while this one keeps its CSRF token, the audit row with no password data,
and a wrong current password changing nothing.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
"""

from collections.abc import Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from tests import test_auth_integration as auth_part
from tests.test_auth_integration import PASSWORD, TEST_DATABASE_URL, e164, register

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created_phones = auth_part.created_phones
db_client = auth_part.db_client
NEW_PASSWORD = "a new sample password"


def _connect() -> psycopg.Connection:
    url = get_settings().sync_database_url.set(drivername="postgresql")
    return psycopg.connect(url.render_as_string(hide_password=False))


@pytest.fixture
def audit_rows_first(created_phones: list[str]) -> Iterator[None]:
    """Delete this test's audit rows before the users they point at (RESTRICT)."""
    yield
    with _connect() as connection:
        connection.execute(
            "DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE phone = ANY(%s))",
            ([e164(phone) for phone in created_phones],),
        )


def login(client: TestClient, phone: str, password: str) -> int:
    return client.post(
        "/api/v1/auth/login", json={"phone": phone, "password": password}
    ).status_code


def change(client: TestClient, csrf: str, current: str, new: str = NEW_PASSWORD) -> object:
    return client.post(
        "/api/v1/auth/password",
        json={"current_password": current, "new_password": new},
        headers={CSRF_HEADER_NAME: csrf},
    )


def test_a_change_keeps_this_session_and_ends_the_others(
    db_client: TestClient, created_phones: list[str], audit_rows_first: None
) -> None:
    account = register(db_client, created_phones)
    phone, csrf = account["phone"], account["csrf_token"]
    this_cookie = db_client.cookies.get(SESSION_COOKIE_NAME)

    # A second device signed in with the same password.
    db_client.cookies.clear()
    assert login(db_client, phone, PASSWORD) == 200
    other_cookie = db_client.cookies.get(SESSION_COOKIE_NAME)
    assert other_cookie != this_cookie

    db_client.cookies.clear()
    db_client.cookies.set(SESSION_COOKIE_NAME, this_cookie)
    response = change(db_client, csrf, PASSWORD)
    assert response.status_code == 204, response.text  # type: ignore[attr-defined]

    # This session stays signed in, with the same CSRF token.
    me = db_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["csrf_token"] == csrf

    # The other device is signed out.
    db_client.cookies.clear()
    db_client.cookies.set(SESSION_COOKIE_NAME, other_cookie)
    assert db_client.get("/api/v1/auth/me").status_code == 401

    # Only the new password signs in now.
    db_client.cookies.clear()
    assert login(db_client, phone, PASSWORD) == 401
    assert login(db_client, phone, NEW_PASSWORD) == 200

    with _connect() as connection:
        rows = connection.execute(
            "SELECT a.action, a.target_type, a.metadata, u.password_hash "
            "FROM audit_logs a JOIN users u ON u.id = a.actor_id "
            "WHERE u.phone = %s AND a.target_id = u.id",
            (e164(phone),),
        ).fetchall()
    assert [(action, target) for action, target, _, _ in rows] == [("password_changed", "user")]
    details, password_hash = rows[0][2], rows[0][3]
    assert not details  # no password, hash or session data
    assert NEW_PASSWORD not in password_hash and password_hash.startswith("scrypt")


def test_a_wrong_current_password_changes_nothing(
    db_client: TestClient, created_phones: list[str], audit_rows_first: None
) -> None:
    account = register(db_client, created_phones)
    response = change(db_client, account["csrf_token"], "not the password")
    assert response.status_code == 403  # type: ignore[attr-defined]
    assert response.json()["error"]["code"] == "password_incorrect"  # type: ignore[attr-defined]
    # Still signed in (403, not 401), and the old password still works.
    assert db_client.get("/api/v1/auth/me").status_code == 200
    db_client.cookies.clear()
    assert login(db_client, account["phone"], PASSWORD) == 200
