"""HTTPS only in production (NFR-001): the Strict-Transport-Security header.

In production the reverse proxy (Caddy, compose.production.yaml) terminates
TLS and redirects plain HTTP to HTTPS, so the API only sees forwarded TLS
traffic. This header makes browsers go straight to HTTPS for later visits
too, so a first request on a hostile network cannot be downgraded. It is added
only in production, never to plain-http local development.
"""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: One year. ``includeSubDomains`` and ``preload`` are left out: the app runs
#: on a host whose other subdomains may not be served over HTTPS yet.
HSTS_VALUE = "max-age=31536000"


class StrictTransportSecurityMiddleware:
    """ASGI middleware adding ``Strict-Transport-Security`` to every HTTP response.

    Args:
        app: The ASGI application to wrap.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Handle one ASGI connection; only ``http`` scopes get the header."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_hsts(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["Strict-Transport-Security"] = HSTS_VALUE
            await send(message)

        await self.app(scope, receive, send_with_hsts)
