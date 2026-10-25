"""Request IDs on responses and log lines, without personal data (NFR-015)."""

import io
import logging
import re
import uuid
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.log_config import (
    LOG_FORMAT,
    RequestIDLogFilter,
    configure_logging,
    safe_exception_text,
)
from app.core.request_id import get_request_id, resolve_request_id
from app.main import create_app

PHONE_E164 = "+2348031234567"
PHONE_LOCAL = "08031234567"
CANONICAL_UUID = "3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b"
NGINX_REQUEST_ID = "0f1e2d3c4b5a69788796a5b4c3d2e1f0"
SECRET_TOKEN_MESSAGE = "session token 7f3a9c"

UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")


class SignupInput(BaseModel):
    phone: str
    name: str


def _duplicate_phone_error() -> IntegrityError:
    """Build the error SQLAlchemy raises for a duplicate phone number.

    Its message repeats the SQL parameters and the database's duplicate-key
    detail, both containing the phone number: exactly what must not be logged.
    """
    database_error = Exception(
        f'duplicate key value violates unique constraint "uq_users_phone"\n'
        f"DETAIL:  Key (phone)=({PHONE_E164}) already exists."
    )
    return IntegrityError(
        "INSERT INTO users (phone, name) VALUES ($1, $2)",
        (PHONE_E164, "Adaeze Okafor"),
        database_error,
    )


@pytest.fixture
def log_output() -> Iterator[io.StringIO]:
    """Capture ``app`` log lines exactly as the configured handler writes them."""
    get_settings.cache_clear()
    buffer = io.StringIO()
    yield buffer
    configure_logging()


@pytest.fixture
def app_with_test_routes(log_output: io.StringIO) -> FastAPI:
    """The real application, plus routes that log and crash during a request."""
    app = create_app()
    configure_logging(stream=log_output)
    logger = logging.getLogger("app.tests.request_id")

    @app.post("/test/signup")
    async def signup(body: SignupInput) -> dict[str, str]:
        logger.warning("Signup received")
        error = _duplicate_phone_error()
        raise error from error.orig

    @app.get("/test/log")
    async def log_line() -> dict[str, str | None]:
        logger.info("Inside the request")
        return {"request_id": get_request_id()}

    @app.get("/test/uvicorn-error")
    async def uvicorn_error() -> None:
        # Stands in for uvicorn's "Exception in ASGI application" record.
        try:
            raise _duplicate_phone_error()
        except IntegrityError as exc:
            logging.getLogger("uvicorn.error").error(
                "Exception in ASGI application\n", exc_info=exc
            )

    return app


def test_response_carries_a_generated_request_id(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert UUID_PATTERN.fullmatch(response.headers["x-request-id"])


def test_each_request_gets_its_own_id(client: TestClient) -> None:
    first = client.get("/api/v1/health").headers["x-request-id"]
    second = client.get("/api/v1/health").headers["x-request-id"]

    assert first != second


@pytest.mark.parametrize("incoming", [CANONICAL_UUID, CANONICAL_UUID.upper(), NGINX_REQUEST_ID])
def test_well_formed_incoming_request_id_is_kept(client: TestClient, incoming: str) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": incoming})

    assert response.headers["x-request-id"] == incoming


@pytest.mark.parametrize(
    "incoming",
    [
        PHONE_LOCAL,
        PHONE_E164,
        "order-123",
        "",
        CANONICAL_UUID + "0",
        "x" * 200,
        f"{CANONICAL_UUID} injected",
    ],
)
def test_unsafe_incoming_request_id_is_replaced(client: TestClient, incoming: str) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": incoming})

    request_id = response.headers["x-request-id"]
    assert request_id != incoming
    assert UUID_PATTERN.fullmatch(request_id)


def test_repeated_incoming_request_id_is_replaced(client: TestClient) -> None:
    response = client.get(
        "/api/v1/health",
        headers=[("X-Request-ID", CANONICAL_UUID), ("X-Request-ID", NGINX_REQUEST_ID)],
    )

    assert response.headers["x-request-id"] not in {CANONICAL_UUID, NGINX_REQUEST_ID}


def test_resolve_request_id_generates_without_incoming_value() -> None:
    assert uuid.UUID(resolve_request_id(None)).version == 4


def test_error_responses_carry_the_request_id(client: TestClient) -> None:
    response = client.get("/api/v1/no-such-route", headers={"X-Request-ID": CANONICAL_UUID})

    assert response.status_code == 404
    assert response.headers["x-request-id"] == CANONICAL_UUID


def test_cors_preflight_carries_the_id_and_exposes_the_header(client: TestClient) -> None:
    preflight = client.options(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})

    assert UUID_PATTERN.fullmatch(preflight.headers["x-request-id"])
    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()


def test_log_lines_during_a_request_carry_its_id(
    app_with_test_routes: FastAPI, log_output: io.StringIO
) -> None:
    with TestClient(app_with_test_routes) as test_client:
        response = test_client.get("/test/log", headers={"X-Request-ID": CANONICAL_UUID})

    assert response.json() == {"request_id": CANONICAL_UUID}
    assert f"[request_id={CANONICAL_UUID}] Inside the request" in log_output.getvalue()


def test_log_lines_outside_a_request_have_a_placeholder(log_output: io.StringIO) -> None:
    configure_logging(stream=log_output)

    logging.getLogger("app.tests.request_id").warning("At startup")

    assert "[request_id=-] At startup" in log_output.getvalue()


def test_unhandled_error_is_logged_with_request_id_and_no_personal_data(
    app_with_test_routes: FastAPI, log_output: io.StringIO
) -> None:
    # T: sample request carrying a phone number (issue #101 acceptance).
    with TestClient(app_with_test_routes, raise_server_exceptions=False) as test_client:
        response = test_client.post(
            "/test/signup",
            json={"phone": PHONE_LOCAL, "name": "Adaeze Okafor"},
            headers={"X-Request-ID": CANONICAL_UUID},
        )

    assert response.status_code == 500
    assert response.headers["x-request-id"] == CANONICAL_UUID
    assert response.json()["error"]["code"] == "internal_server_error"

    logs = log_output.getvalue()
    assert f"[request_id={CANONICAL_UUID}] Signup received" in logs
    assert f"[request_id={CANONICAL_UUID}] Unhandled IntegrityError on POST /test/signup" in logs
    assert "sqlalchemy.exc.IntegrityError: (message withheld)" in logs
    assert "Traceback (most recent call last):" in logs
    for personal_data in ("8031234567", "Adaeze", "Okafor", "duplicate key", "INSERT INTO"):
        assert personal_data not in logs
        assert personal_data not in response.text


def test_server_error_log_carries_request_id_and_no_personal_data(
    app_with_test_routes: FastAPI,
) -> None:
    uvicorn_logs = io.StringIO()
    handler = logging.StreamHandler(uvicorn_logs)
    handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    uvicorn_logger = logging.getLogger("uvicorn.error")
    uvicorn_logger.addHandler(handler)
    try:
        with TestClient(app_with_test_routes) as test_client:
            test_client.get("/test/uvicorn-error", headers={"X-Request-ID": CANONICAL_UUID})
    finally:
        uvicorn_logger.removeHandler(handler)

    logs = uvicorn_logs.getvalue()
    assert f"Exception in ASGI application [request_id={CANONICAL_UUID}]" in logs
    assert "sqlalchemy.exc.IntegrityError: (message withheld)" in logs
    assert "8031234567" not in logs


def test_safe_exception_text_keeps_chain_and_types_but_not_messages() -> None:
    # Messages come from variables: source lines are part of the traceback,
    # so a literal here would show up in the text being checked.
    token_message = SECRET_TOKEN_MESSAGE
    try:
        try:
            raise KeyError(PHONE_E164)
        except KeyError as inner:
            raise ValueError(token_message) from inner
    except ValueError as outer:
        caught = outer

    text = safe_exception_text(caught)

    assert "builtins.KeyError: (message withheld)" in text
    assert "The above exception was the direct cause of the following exception:" in text
    assert text.rstrip().endswith("builtins.ValueError: (message withheld)")
    assert "test_safe_exception_text_keeps_chain_and_types_but_not_messages" in text
    assert "8031234567" not in text
    assert SECRET_TOKEN_MESSAGE not in text


def test_safe_exception_text_shows_implicit_context() -> None:
    try:
        try:
            raise KeyError(PHONE_E164)
        except KeyError:
            raise RuntimeError(SECRET_TOKEN_MESSAGE)  # noqa: B904 - implicit context under test
    except RuntimeError as exc:
        caught = exc

    text = safe_exception_text(caught)

    assert "During handling of the above exception, another exception occurred:" in text
    assert "8031234567" not in text
    assert SECRET_TOKEN_MESSAGE not in text


def test_filter_withholds_messages_from_any_formatter() -> None:
    try:
        raise _duplicate_phone_error()
    except IntegrityError as exc:
        record = logging.LogRecord(
            "app.tests", logging.ERROR, __file__, 1, "Failed", None, (type(exc), exc, None)
        )

    RequestIDLogFilter().filter(record)
    formatted = logging.Formatter(LOG_FORMAT).format(record)

    assert "[request_id=-] Failed" in formatted
    assert PHONE_E164 not in formatted


def test_configure_logging_does_not_duplicate_handlers_or_filters() -> None:
    configure_logging()
    configure_logging()

    app_handlers = [h for h in logging.getLogger("app").handlers if h.get_name() == "mmirioma"]
    uvicorn_filters = logging.getLogger("uvicorn.error").filters
    assert len(app_handlers) == 1
    assert len(uvicorn_filters) == 1
