"""FastAPI application factory and ASGI entry point (``uvicorn app.main:app``)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import dispose_engine
from app.core.errors import register_exception_handlers
from app.core.frontend import mount_frontend
from app.core.https import StrictTransportSecurityMiddleware
from app.core.log_config import configure_logging
from app.core.request_id import REQUEST_ID_HEADER, RequestIDMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Release database connections when the application shuts down."""
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    """Build and configure the FastAPI application.

    Tests call this to get a fresh app; production uses the module-level ``app``.

    Returns:
        The configured application.
    """
    settings = get_settings()
    configure_logging()

    app = FastAPI(
        title="MmiriOma API",
        description="Water delivery and distribution platform",
        version="0.1.0",
        debug=settings.app_debug,
        lifespan=lifespan,
    )

    # Credentials are allowed, so origins must be explicit; never use "*".
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        # X-CSRF-Token carries the session's CSRF token (app/modules/auth).
        allow_headers=["Accept", "Content-Type", "Authorization", "X-CSRF-Token"],
        # Lets the frontend read the request ID to show it in error reports.
        expose_headers=[REQUEST_ID_HEADER],
    )
    if settings.is_production:
        # HTTPS only (NFR-001): browsers keep to HTTPS on later visits.
        app.add_middleware(StrictTransportSecurityMiddleware)
    # Added last, so it is the outermost user middleware: every response,
    # including CORS preflights, carries X-Request-ID (NFR-015).
    app.add_middleware(RequestIDMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router)
    if settings.frontend_dist_dir is not None:
        # After the API routes: one origin for the app and /api (#103).
        mount_frontend(app, settings.frontend_dist_dir)
    return app


app = create_app()
