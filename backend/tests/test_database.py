import os
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.database import get_db_session, ping_database


class FakeSession:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.statements: list[str] = []

    async def execute(self, statement: Any) -> None:
        self.statements.append(str(statement))
        if self.error:
            raise self.error


def override_session(client: TestClient, session: FakeSession) -> None:
    async def _session() -> AsyncIterator[FakeSession]:
        yield session

    client.app.dependency_overrides[get_db_session] = _session  # type: ignore[attr-defined]


def test_readiness_ok_when_database_responds(client: TestClient) -> None:
    session = FakeSession()
    override_session(client, session)

    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok"}
    assert session.statements == ["SELECT 1"]


def test_readiness_503_when_database_unreachable(client: TestClient) -> None:
    override_session(client, FakeSession(error=ConnectionRefusedError("secret-host:5432")))

    response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "service_unavailable",
            "message": "Database is not reachable",
            "details": None,
        }
    }
    assert "secret-host" not in response.text


def test_readiness_503_without_mocks_when_database_is_down(client: TestClient) -> None:
    # conftest points DATABASE_URL at a closed port, so the real engine fails fast.
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.mark.integration
@pytest.mark.anyio
@pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")
async def test_real_database_is_reachable_and_has_postgis() -> None:
    engine = create_async_engine(TEST_DATABASE_URL or "")
    try:
        async with engine.connect() as connection:
            await ping_database(connection)
            result = await connection.execute(
                text("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
            )
            assert result.scalar_one_or_none() is not None
    finally:
        await engine.dispose()
