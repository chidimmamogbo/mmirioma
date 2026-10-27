"""Support and deletion request endpoint tests that need no database.

docs/api/customer-account.md, "Support requests" and "Account deletion":
roles (FR-001), CSRF, validation, status codes, bodies against the contract
examples, and the acknowledge-by date rule (decision 11). The request
service is faked; database behaviour is in
test_customer_requests_integration.py.
"""

import json
import uuid
from datetime import UTC, date, datetime
from http import HTTPStatus
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth.models import UserRole
from app.modules.customers import requests
from app.modules.customers.models import (
    DeletionRequest,
    DeletionRequestStatus,
    SupportRequest,
    SupportRequestStatus,
    SupportRequestType,
)
from tests import test_customer_account_api as account_api
from tests.test_customer_account_api import CUSTOMER, sign_in

api = account_api.api
fake = account_api.fake  # the profile and address service fakes (unused here)

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


CREATE_EXAMPLE = example("support-request-create-request.json")
PAGE_EXAMPLE = example("support-requests-page.json")
DELETION_EXAMPLE = example("deletion-request.json")

ENDPOINTS: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/v1/me/support-requests", None),
    ("POST", "/api/v1/me/support-requests", CREATE_EXAMPLE),
    ("POST", "/api/v1/me/deletion-request", {}),
    ("GET", "/api/v1/me/deletion-request", None),
]


def support_from(body: dict[str, Any]) -> SupportRequest:
    return SupportRequest(
        id=uuid.uuid4(),
        reference=body["reference"],
        user_id=CUSTOMER.id,
        type=SupportRequestType(body["type"]),
        message=body["message"],
        status=SupportRequestStatus(body["status"]),
        idempotency_key=uuid.uuid4(),
        created_at=datetime.fromisoformat(body["created_at"]),
        resolved_at=None,
    )


def deletion_from(body: dict[str, Any]) -> DeletionRequest:
    return DeletionRequest(
        id=uuid.uuid4(),
        reference=body["reference"],
        user_id=CUSTOMER.id,
        status=DeletionRequestStatus(body["status"]),
        acknowledge_by=date.fromisoformat(body["acknowledge_by"]),
        created_at=datetime.fromisoformat(body["requested_at"]),
    )


class FakeRequests:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.created = True
        self.error: APIError | None = None

    def _record(self, name: str, **kwargs: Any) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def list_support_requests(
        self, _: object, customer: object, **kwargs: Any
    ) -> tuple[list[tuple[SupportRequest, str | None]], int]:
        self._record("list_support_requests", **kwargs)
        item = PAGE_EXAMPLE["items"][0]
        return [(support_from(item), item["order_reference"])], PAGE_EXAMPLE["total"]

    async def create_support_request(
        self, _: object, customer: object, **kwargs: Any
    ) -> tuple[SupportRequest, str | None, bool]:
        self._record("create_support_request", **kwargs)
        item = PAGE_EXAMPLE["items"][0]
        return support_from(item), kwargs["order_reference"], self.created

    async def request_deletion(
        self, _: object, customer: object, **kwargs: Any
    ) -> tuple[DeletionRequest, bool]:
        self._record("request_deletion", **kwargs)
        return deletion_from(DELETION_EXAMPLE), self.created

    async def get_open_deletion_request(self, _: object, customer: object) -> DeletionRequest:
        self._record("get_open_deletion_request")
        return deletion_from(DELETION_EXAMPLE)


@pytest.fixture
def fake_requests(monkeypatch: pytest.MonkeyPatch) -> FakeRequests:
    fake = FakeRequests()
    for name in (
        "list_support_requests",
        "create_support_request",
        "request_deletion",
        "get_open_deletion_request",
    ):
        monkeypatch.setattr(requests, name, getattr(fake, name))
    return fake


def error_code(response: Any) -> str:
    return response.json()["error"]["code"]


# --- Access (FR-001) ---------------------------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_signed_out_is_not_authenticated(
    api: TestClient,
    fake_requests: FakeRequests,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = api.request(method, path, json=body)
    assert (response.status_code, error_code(response)) == (
        HTTPStatus.UNAUTHORIZED,
        "not_authenticated",
    )
    assert fake_requests.calls == []


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
def test_staff_and_drivers_are_forbidden(
    api: TestClient,
    fake_requests: FakeRequests,
    role: UserRole,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = api.request(method, path, json=body, headers=sign_in(api, role))
    assert (response.status_code, error_code(response)) == (HTTPStatus.FORBIDDEN, "forbidden")
    assert fake_requests.calls == []


@pytest.mark.parametrize(
    ("path", "body"),
    [("/api/v1/me/support-requests", CREATE_EXAMPLE), ("/api/v1/me/deletion-request", {})],
)
def test_posts_need_the_csrf_token(
    api: TestClient, fake_requests: FakeRequests, path: str, body: dict[str, Any]
) -> None:
    sign_in(api, UserRole.CUSTOMER)
    response = api.post(path, json=body)
    assert (response.status_code, error_code(response)) == (HTTPStatus.FORBIDDEN, "csrf_failed")
    assert fake_requests.calls == []


# --- Support requests --------------------------------------------------------


def test_page_matches_the_contract_example(api: TestClient, fake_requests: FakeRequests) -> None:
    response = api.get("/api/v1/me/support-requests", headers=sign_in(api, UserRole.CUSTOMER))
    assert response.status_code == HTTPStatus.OK
    assert response.json() == PAGE_EXAMPLE
    assert fake_requests.calls == [("list_support_requests", {"limit": 50, "offset": 0})]


@pytest.mark.parametrize(
    ("created", "status"), [(True, HTTPStatus.CREATED), (False, HTTPStatus.OK)]
)
def test_create_is_201_and_a_retry_200(
    api: TestClient, fake_requests: FakeRequests, created: bool, status: HTTPStatus
) -> None:
    fake_requests.created = created
    body = {**CREATE_EXAMPLE, "message": "  The water has not arrived yet.  "}
    response = api.post(
        "/api/v1/me/support-requests", json=body, headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == status
    assert response.json() == PAGE_EXAMPLE["items"][0]
    assert fake_requests.calls == [
        (
            "create_support_request",
            {
                "type": SupportRequestType.LATE,
                "message": "The water has not arrived yet.",  # trimmed
                "order_reference": CREATE_EXAMPLE["order_reference"],
                "idempotency_key": uuid.UUID(CREATE_EXAMPLE["idempotency_key"]),
            },
        )
    ]


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"type": "quality"}, "type"),
        ({"message": "ab"}, "message"),
        ({"message": "x" * 1001}, "message"),
        ({"idempotency_key": "not-a-uuid"}, "idempotency_key"),
        ({"status": "resolved"}, "status"),
    ],
)
def test_invalid_support_bodies_are_validation_errors(
    api: TestClient, fake_requests: FakeRequests, change: dict[str, Any], field: str
) -> None:
    response = api.post(
        "/api/v1/me/support-requests",
        json={**CREATE_EXAMPLE, **change},
        headers=sign_in(api, UserRole.CUSTOMER),
    )
    assert (response.status_code, error_code(response)) == (
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "validation_error",
    )
    assert ["body", field] in [detail["loc"] for detail in response.json()["error"]["details"]]
    assert fake_requests.calls == []


@pytest.mark.parametrize(
    "error",
    [
        APIError(HTTPStatus.NOT_FOUND, "order_not_found", "Order not found"),
        APIError(HTTPStatus.CONFLICT, "idempotency_key_reused", "Already received"),
    ],
)
def test_create_errors_use_the_envelope(
    api: TestClient, fake_requests: FakeRequests, error: APIError
) -> None:
    fake_requests.error = error
    response = api.post(
        "/api/v1/me/support-requests", json=CREATE_EXAMPLE, headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert (response.status_code, error_code(response)) == (error.status_code, error.code)


# --- Deletion request --------------------------------------------------------


@pytest.mark.parametrize(
    ("created", "status"), [(True, HTTPStatus.ACCEPTED), (False, HTTPStatus.OK)]
)
@pytest.mark.parametrize("body", [None, {}, {"reason": "  Moving away  "}])
def test_deletion_request_is_202_or_200_with_the_open_one(
    api: TestClient,
    fake_requests: FakeRequests,
    created: bool,
    status: HTTPStatus,
    body: dict[str, Any] | None,
) -> None:
    fake_requests.created = created
    response = api.post(
        "/api/v1/me/deletion-request", json=body, headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == status
    assert response.json() == DELETION_EXAMPLE
    reason = "Moving away" if body and "reason" in body else None
    assert fake_requests.calls == [("request_deletion", {"reason": reason})]


@pytest.mark.parametrize("body", [{"reason": "x" * 501}, {"reason": "ok", "status": "completed"}])
def test_invalid_deletion_bodies_are_validation_errors(
    api: TestClient, fake_requests: FakeRequests, body: dict[str, Any]
) -> None:
    response = api.post(
        "/api/v1/me/deletion-request", json=body, headers=sign_in(api, UserRole.CUSTOMER)
    )
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert fake_requests.calls == []


def test_get_returns_the_open_request_or_404(api: TestClient, fake_requests: FakeRequests) -> None:
    headers = sign_in(api, UserRole.CUSTOMER)
    assert api.get("/api/v1/me/deletion-request", headers=headers).json() == DELETION_EXAMPLE
    fake_requests.error = APIError(
        HTTPStatus.NOT_FOUND, "deletion_request_not_found", "No open deletion request"
    )
    response = api.get("/api/v1/me/deletion-request", headers=headers)
    assert (response.status_code, error_code(response)) == (
        HTTPStatus.NOT_FOUND,
        "deletion_request_not_found",
    )


# --- Acknowledge-by date (decision 11) ---------------------------------------


@pytest.mark.parametrize(
    ("requested_at", "expected"),
    [
        # The contract example: Monday 26 October 2026 → Thursday 29.
        (datetime(2026, 10, 26, 13, 20, tzinfo=UTC), date(2026, 10, 29)),
        (datetime(2026, 10, 28, 9, 0, tzinfo=UTC), date(2026, 11, 2)),  # Wed → Mon
        (datetime(2026, 10, 30, 9, 0, tzinfo=UTC), date(2026, 11, 4)),  # Fri → Wed
        (datetime(2026, 10, 31, 9, 0, tzinfo=UTC), date(2026, 11, 4)),  # Sat → Wed
        (datetime(2026, 11, 1, 9, 0, tzinfo=UTC), date(2026, 11, 4)),  # Sun → Wed
        # 23:30 UTC on Sunday is already Monday in Lagos.
        (datetime(2026, 11, 1, 23, 30, tzinfo=UTC), date(2026, 11, 5)),
    ],
)
def test_acknowledge_by_counts_three_working_days_in_lagos(
    requested_at: datetime, expected: date
) -> None:
    assert requests.acknowledge_by(requested_at) == expected


def test_references_are_prefixed_and_use_the_safe_alphabet() -> None:
    for prefix in (requests.SUPPORT_PREFIX, requests.DELETION_PREFIX):
        reference = requests.new_reference(prefix)
        assert reference.startswith(prefix) and len(reference) == 11
        assert set(reference[3:]) <= set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
