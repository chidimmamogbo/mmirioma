"""Application logging: request IDs on every line, no personal data (NFR-015).

:func:`configure_logging` sets up two things:

- The ``app`` logger (the parent of every ``logging.getLogger(__name__)`` in
  this package) writes to stderr, with the current request ID on each line.
- Exception tracebacks, from ``app`` loggers and from uvicorn's error logger,
  keep the exception types and the stack frames but withhold the exception
  messages. A message can carry personal data: SQLAlchemy and asyncpg errors
  repeat the failing SQL, its parameters and the duplicate key, for example a
  customer's phone number.

Log messages themselves are still the caller's responsibility: never log a
name, address, delivery code, token or unmasked phone number
(``app.modules.messaging.sms.mask_phone`` masks numbers).
"""

import logging
import sys
import traceback
from typing import TextIO

from app.core.request_id import get_request_id

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s"

_APP_LOGGER = "app"
# Uvicorn logs "Exception in ASGI application" with the full traceback to
# this logger whenever a request fails, after our own 500 handler has run.
_UVICORN_ERROR_LOGGER = "uvicorn.error"
_HANDLER_NAME = "mmirioma"

_CAUSE_LINK = "The above exception was the direct cause of the following exception:"
_CONTEXT_LINK = "During handling of the above exception, another exception occurred:"


def safe_exception_text(exception: BaseException) -> str:
    """Format an exception's traceback without exception messages.

    Like the standard traceback, every exception in the chain (``__cause__``,
    or ``__context__`` unless suppressed) is shown, oldest first, as its
    stack frames followed by its qualified type name. Messages and
    ``__notes__`` are withheld because they may contain personal data or
    secrets; the type and the line that raised are enough to find the fault.

    Args:
        exception: The exception being logged.

    Returns:
        The traceback text, without a trailing newline.
    """
    # Newest first. links[i] is the sentence printed between chain[i + 1]
    # (older) and chain[i].
    chain: list[BaseException] = []
    links: list[str] = []
    current: BaseException | None = exception
    while current is not None and all(current is not seen for seen in chain):
        chain.append(current)
        if current.__cause__ is not None:
            links.append(_CAUSE_LINK)
            current = current.__cause__
        elif current.__context__ is not None and not current.__suppress_context__:
            links.append(_CONTEXT_LINK)
            current = current.__context__
        else:
            current = None

    parts: list[str] = []
    for position in range(len(chain) - 1, -1, -1):
        if position < len(chain) - 1:
            parts.append(f"\n{links[position]}\n\n")
        parts.append("Traceback (most recent call last):\n")
        parts.extend(traceback.format_list(traceback.extract_tb(chain[position].__traceback__)))
        exception_type = type(chain[position])
        parts.append(
            f"{exception_type.__module__}.{exception_type.__qualname__}: (message withheld)\n"
        )
    return "".join(parts).rstrip("\n")


class RequestIDLogFilter(logging.Filter):
    """Add ``request_id`` to each record and withhold exception messages.

    Attach it to a handler (it then sees records from every child logger) or
    to a logger (only records logged on that logger itself). It never drops a
    record.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """Annotate the record in place.

        Sets ``record.request_id`` (``"-"`` outside a request) and, for a
        record with an exception, pre-fills ``record.exc_text`` with
        :func:`safe_exception_text`. Every standard formatter prints
        ``exc_text`` when it is set instead of formatting the traceback
        itself, so the safe text is what every handler writes.

        Args:
            record: The record being logged.

        Returns:
            Always ``True``.
        """
        record.request_id = get_request_id() or "-"
        if record.exc_info and record.exc_info[1] is not None and not record.exc_text:
            record.exc_text = safe_exception_text(record.exc_info[1])
        return True


class _UvicornErrorFilter(RequestIDLogFilter):
    """Request ID and safe tracebacks for uvicorn's error logger.

    Uvicorn's formatter does not print ``%(request_id)s``, so the ID is also
    appended to the message of records logged during a request.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        super().filter(record)
        request_id = get_request_id()
        if request_id is not None and isinstance(record.msg, str):
            # Accepted request IDs contain only hex digits and hyphens, so
            # appending one cannot add a "%" placeholder to the message.
            record.msg = f"{record.msg.rstrip()} [request_id={request_id}]"
        return True


class _StderrHandler(logging.StreamHandler[TextIO]):
    """Stream handler that looks up ``sys.stderr`` on every write.

    Holding on to the stream from setup time would break when it is replaced
    later (pytest's output capture does this for each test).
    """

    @property
    def stream(self) -> TextIO:
        return sys.stderr

    @stream.setter
    def stream(self, _: TextIO) -> None:
        # StreamHandler.__init__ assigns the stream; the property ignores it.
        pass


def configure_logging(stream: TextIO | None = None) -> None:
    """Install the application's log handler and filters.

    Safe to call more than once (``create_app`` runs for every test): an
    existing MmiriOma handler or filter is replaced, never duplicated. The
    root logger and uvicorn's own handlers and formats are left alone.

    Args:
        stream: Where ``app`` loggers write. Defaults to the current
            ``sys.stderr``; tests pass a buffer.
    """
    handler: logging.Handler = (
        logging.StreamHandler(stream) if stream is not None else _StderrHandler()
    )
    handler.set_name(_HANDLER_NAME)
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    handler.addFilter(RequestIDLogFilter())

    app_logger = logging.getLogger(_APP_LOGGER)
    for existing in list(app_logger.handlers):
        if existing.get_name() == _HANDLER_NAME:
            app_logger.removeHandler(existing)
    app_logger.addHandler(handler)
    app_logger.setLevel(logging.INFO)

    uvicorn_error_logger = logging.getLogger(_UVICORN_ERROR_LOGGER)
    for existing_filter in list(uvicorn_error_logger.filters):
        if isinstance(existing_filter, _UvicornErrorFilter):
            uvicorn_error_logger.removeFilter(existing_filter)
    uvicorn_error_logger.addFilter(_UvicornErrorFilter())
