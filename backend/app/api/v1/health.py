"""Liveness and readiness probes.

- ``GET /api/v1/health``: the process is running. Never touches the database,
  so it stays fast and cannot fail because of a dependency.
- ``GET /api/v1/health/ready``: the API can serve real traffic, which requires
  the database. Returns 503 when it is not reachable.
"""

import asyncio
import logging
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session, ping_database
from app.core.errors import APIError, ErrorResponse

logger = logging.getLogger(__name__)

# Upper bound for the whole readiness check, including waiting for a pooled connection.
READINESS_TIMEOUT_SECONDS = 5

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check() -> dict[str, str]:
    """Report that the API process is alive.

    Returns:
        ``{"status": "ok", "service": "mmirioma-api"}``.
    """
    return {
        "status": "ok",
        "service": "mmirioma-api",
    }


@router.get(
    "/ready",
    responses={HTTPStatus.SERVICE_UNAVAILABLE: {"model": ErrorResponse}},
)
async def readiness_check(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    """Report whether the API can reach the database.

    Args:
        session: Request-scoped database session.

    Returns:
        ``{"status": "ready", "database": "ok"}``.

    Raises:
        APIError: 503 ``service_unavailable`` if the database does not answer
            within ``READINESS_TIMEOUT_SECONDS``. The underlying error is logged
            by type only, so connection details never reach logs or clients.
    """
    try:
        async with asyncio.timeout(READINESS_TIMEOUT_SECONDS):
            await ping_database(session)
    except Exception as exc:
        logger.warning("Database readiness check failed: %s", type(exc).__name__)
        raise APIError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "service_unavailable",
            "Database is not reachable",
        ) from exc
    return {"status": "ready", "database": "ok"}
