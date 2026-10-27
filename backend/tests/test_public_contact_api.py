"""``GET /public/contact`` (#56). No database: it reads settings only.

Contract: docs/api/public-site.md (agreed in #8). Covers both values of
``SUPPORT_WHATSAPP_ENABLED`` against the example, no session needed, the
cache header, ``SUPPORT_PHONE`` as the single source (FR-055), and the per-IP
limit decided in #56 (120 per 10 minutes).
"""

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import OFFICIAL_SUPPORT_PHONE, get_settings
from app.modules.public.router import CONTACT_REQUESTS_PER_IP, get_contact_limiter

EXAMPLE = json.loads(
    (Path(__file__).resolve().parents[2] / "docs/api/examples/public-contact.json").read_text()
)
PATH = "/api/v1/public/contact"


@pytest.fixture(autouse=True)
def fresh(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Reset the limiter, and the settings after any test that changes them."""
    monkeypatch.delenv("SUPPORT_WHATSAPP_ENABLED", raising=False)
    monkeypatch.delenv("SUPPORT_PHONE", raising=False)
    get_contact_limiter().clear()
    get_settings.cache_clear()
    yield
    get_contact_limiter().clear()
    get_settings.cache_clear()


def configure(monkeypatch: pytest.MonkeyPatch, **values: str) -> None:
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()


def test_with_whatsapp_on_it_matches_the_example(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    configure(monkeypatch, SUPPORT_WHATSAPP_ENABLED="true")
    response = client.get(PATH)
    assert response.status_code == 200
    assert response.json() == EXAMPLE
    assert response.headers["Cache-Control"] == "public, max-age=300"


def test_whatsapp_is_off_by_default(client: TestClient) -> None:
    assert get_settings().support_whatsapp_enabled is False
    assert client.get(PATH).json() == {"phone": OFFICIAL_SUPPORT_PHONE, "whatsapp": None}


def test_both_numbers_come_from_support_phone(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    configure(monkeypatch, SUPPORT_PHONE="+2348000000099", SUPPORT_WHATSAPP_ENABLED="true")
    assert client.get(PATH).json() == {"phone": "+2348000000099", "whatsapp": "+2348000000099"}


def test_needs_no_session_and_ignores_a_bad_cookie(client: TestClient) -> None:
    client.cookies.set("mmirioma_session", "not-a-session")
    assert client.get(PATH).status_code == 200


def test_the_121st_request_in_ten_minutes_is_429(client: TestClient) -> None:
    for _ in range(CONTACT_REQUESTS_PER_IP):
        assert client.get(PATH).status_code == 200
    response = client.get(PATH)
    assert response.status_code == 429
    body = response.json()["error"]
    assert body["code"] == "too_many_attempts"
    assert body["details"]["retry_after_seconds"] == int(response.headers["Retry-After"]) > 0


def test_post_is_not_allowed(client: TestClient) -> None:
    assert client.post(PATH).status_code == 405
