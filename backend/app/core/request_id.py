"""Per-request correlation IDs (NFR-015).

Every HTTP request gets a request ID. :class:`RequestIDMiddleware` accepts a
well-formed incoming ``X-Request-ID`` (for example one set by a reverse proxy)
or generates a new one, returns it in the ``X-Request-ID`` response header,
and stores it in a context variable. The logging filter in
:mod:`app.core.log_config` reads that variable, so every log line written
while the request runs carries the same ID, including the log of an
unhandled error. See docs/architecture/backend.md, "Request IDs and logging".
"""

import re
import uuid
from contextvars import ContextVar

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"

# Only UUIDs are accepted from clients: canonical (as most proxies and
# platforms generate) or 32 hex digits (nginx's $request_id). Anything else
# is replaced, because the ID is written to every log line: a free-form value
# could carry a phone number or forge extra log lines (NFR-015).
_ACCEPTED_REQUEST_ID = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    r"|[0-9a-fA-F]{32}"
)

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """Return the ID of the request being handled.

    Returns:
        The request ID, or ``None`` outside a request (startup, commands).
    """
    return _request_id.get()


def resolve_request_id(incoming: str | None) -> str:
    """Choose the request ID for a request.

    Args:
        incoming: The client's ``X-Request-ID`` value, if it sent exactly one.

    Returns:
        ``incoming`` unchanged if it is an accepted UUID form, so it matches
        the proxy's own logs; otherwise a new random UUID.
    """
    if incoming is not None and _ACCEPTED_REQUEST_ID.fullmatch(incoming):
        return incoming
    return str(uuid.uuid4())


def _incoming_request_id(scope: Scope) -> str | None:
    """Return the request's single ``X-Request-ID`` value, or ``None``.

    A request with the header repeated is treated as having none, because
    there is no safe way to pick one.
    """
    header_name = REQUEST_ID_HEADER.lower().encode("latin-1")
    values = [value for name, value in scope["headers"] if name == header_name]
    if len(values) != 1:
        return None
    return values[0].decode("latin-1")


class RequestIDMiddleware:
    """ASGI middleware that assigns each HTTP request a correlation ID.

    Add it last in ``create_app`` so it is the outermost user middleware and
    also covers responses that other middleware produce (CORS preflights).

    The 500 response for an unhandled error is sent by Starlette's
    ``ServerErrorMiddleware``, which sits outside every user middleware, so
    this middleware cannot add the header to it; the 500 handler in
    :mod:`app.core.errors` adds it instead.

    Args:
        app: The ASGI application to wrap.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Handle one ASGI connection; only ``http`` scopes get an ID."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = resolve_request_id(_incoming_request_id(scope))
        # Deliberately never reset. The ID must still be set when the
        # unhandled-error handler and the server log a failure, which happens
        # after the exception has left this middleware. It cannot leak into
        # another request: uvicorn runs every request in a task with a new,
        # empty context, so a value set here is gone when the request ends.
        _request_id.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
            await send(message)

        await self.app(scope, receive, send_with_request_id)
