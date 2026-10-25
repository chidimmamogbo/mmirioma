"""The API serving the built frontend on one origin, and HTTPS only (#103).

docs/architecture/deployment.md: on Railway the frontend and ``/api`` share
one service. These cover the SPA fallback, caching, API 404s staying JSON,
path traversal, the startup check, and the HSTS header in production.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.https import HSTS_VALUE
from app.main import create_app

INDEX = "<!doctype html><title>MmiriOma</title>"


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    """A minimal Vite build: index.html, a hashed bundle and a favicon."""
    build = tmp_path / "dist"
    (build / "assets").mkdir(parents=True)
    (build / "index.html").write_text(INDEX, encoding="utf-8")
    (build / "assets" / "index-AbC123.js").write_text("console.log(1)", encoding="utf-8")
    (build / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("outside the build", encoding="utf-8")
    return build


@pytest.fixture
def served(dist: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("FRONTEND_DIST_DIR", str(dist))
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        yield client
    get_settings.cache_clear()


@pytest.mark.parametrize(
    "path", ["/", "/driver/jobs/MO-1042/cash", "/admin/orders?status=confirmed"]
)
def test_app_paths_get_the_page_never_cached(served: TestClient, path: str) -> None:
    response = served.get(path)
    assert response.status_code == 200
    assert response.text == INDEX
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"


def test_head_works_for_app_paths(served: TestClient) -> None:
    response = served.head("/driver/sign-in")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


def test_hashed_bundles_are_cached_for_a_year(served: TestClient) -> None:
    response = served.get("/assets/index-AbC123.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert served.get("/assets/missing.js").status_code == 404


def test_other_build_files_are_served_as_they_are(served: TestClient) -> None:
    response = served.get("/favicon.svg")
    assert response.text == "<svg/>"
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("path", ["/api", "/api/v1/nothing-here", "/api/v2/orders"])
def test_unknown_api_paths_keep_the_json_404(served: TestClient, path: str) -> None:
    response = served.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_api_routes_still_answer(served: TestClient) -> None:
    assert served.get("/api/v1/health").json()["status"] == "ok"


def test_paths_cannot_leave_the_build(served: TestClient) -> None:
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"):
        response = served.get(path)
        assert "outside the build" not in response.text, path


def test_without_the_setting_nothing_is_served(client: TestClient) -> None:
    # Development and tests: Vite serves the frontend.
    assert client.get("/").status_code == 404
    assert client.get("/driver").status_code == 404


def test_a_missing_build_fails_at_startup(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="FRONTEND_DIST_DIR"):
        Settings(frontend_dist_dir=tmp_path)  # type: ignore[call-arg]


def test_hsts_only_in_production(
    dist: Path, monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    assert "strict-transport-security" not in client.get("/api/v1/health").headers
    for name, value in {
        "APP_ENV": "production",
        "FRONTEND_URL": "https://mmirioma.up.railway.app",
        "SESSION_SECRET": "x" * 40,
        "SMS_PROVIDER": "termii",
        "TERMII_API_KEY": "test-only-key",
        "TERMII_SENDER_ID": "MmiriOma",
        "FRONTEND_DIST_DIR": str(dist),
    }.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    try:
        with TestClient(create_app(), base_url="https://testserver") as production:
            for path in ("/api/v1/health", "/", "/api/v1/nothing-here"):
                assert production.get(path).headers["strict-transport-security"] == HSTS_VALUE
    finally:
        get_settings.cache_clear()
