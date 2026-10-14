"""Async SQLAlchemy engine and session management.

The application talks to PostgreSQL through asyncpg. Alembic does not use this
module's engine; it opens its own synchronous connection (see alembic/env.py).
"""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

CONNECT_TIMEOUT_SECONDS = 5


@lru_cache
def get_engine() -> AsyncEngine:
    """Return the process-wide async engine, creating it on first use.

    Creating it lazily means importing the app (e.g. in unit tests) never needs
    a database. ``pool_pre_ping`` discards connections that the server closed.

    Returns:
        The shared AsyncEngine.
    """
    settings = get_settings()
    return create_async_engine(
        settings.async_database_url,
        echo=settings.app_debug,
        pool_pre_ping=True,
        connect_args={"timeout": CONNECT_TIMEOUT_SECONDS},
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Return the shared session factory bound to :func:`get_engine`.

    ``expire_on_commit=False`` is the setting SQLAlchemy recommends for asyncio:
    attributes stay readable after ``commit()`` without triggering implicit I/O.

    Returns:
        The shared async_sessionmaker.
    """
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that provides one AsyncSession per request.

    The session is closed when the request finishes, which also rolls back any
    transaction that was not committed. Handlers must call ``commit()`` explicitly
    to persist changes. Do not share a session between concurrent tasks.

    Yields:
        An open AsyncSession.
    """
    async with get_sessionmaker()() as session:
        yield session


async def ping_database(session: AsyncSession | AsyncConnection) -> None:
    """Run ``SELECT 1`` to prove the database is reachable.

    Args:
        session: A session or connection to run the query on.

    Raises:
        sqlalchemy.exc.SQLAlchemyError, OSError: If the database cannot be reached.
    """
    await session.execute(text("SELECT 1"))


async def dispose_engine() -> None:
    """Close all pooled connections and reset the cached engine.

    Called on application shutdown. The caches are cleared so a later
    :func:`get_engine` call (e.g. in a new test app) creates a fresh engine.
    """
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
    get_sessionmaker.cache_clear()
    get_engine.cache_clear()
