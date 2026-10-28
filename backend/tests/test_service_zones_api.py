"""Service zone endpoint tests that need no database (#30).

Contract: docs/api/admin-directory.md, "Service zones" (agreed 2026-10-26).
The pricing service is faked, so these cover roles (FR-001, T-07), the
public zone list, CSRF, request validation, the arguments each endpoint
passes (including which fields a PATCH sent), status codes, error codes
passing through, and the contract's examples against the schemas. Database
behaviour is in test_service_zones_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.auth import security
from app.modules.auth import service as auth_service
from app.modules.auth.dependencies import CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.pricing import quotes
from app.modules.pricing import service as zones_service
from app.modules.pricing.models import ServiceZone
from app.modules.pricing.schemas import ServiceZoneList, ServiceZoneOptionList, ServiceZoneRead
from app.modules.pricing.service import (
    Coordinates,
    FeeInput,
    ZoneData,
    ZoneFee,
    ZoneUpdate,
    ZoneView,
)
from app.modules.sources.models import WaterCategory
from tests.test_dispatch_api import keys

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"
NOW = datetime(2026, 10, 26, 10, 0, tzinfo=UTC)
ZONE_ID = uuid.UUID("9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b")
CATEGORY_ID = uuid.UUID("3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b")
PILOT_CATEGORY_ID = uuid.UUID("7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d")
ADMIN_LIST = "/api/v1/admin/service-zones"
ADMIN_ZONE = f"{ADMIN_LIST}/{ZONE_ID}"
PUBLIC_LIST = "/api/v1/service-zones"

USERS = {
    role: User(
        id=uuid.uuid4(),
        name=f"Sample {role.value}",
        phone="+2348000000001",
        password_hash="x",
        role=role,
    )
    for role in UserRole
}
ADMIN = USERS[UserRole.ADMIN]


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def zone_view() -> ZoneView:
    zone = ServiceZone(
        id=ZONE_ID,
        name="Independence Layout",
        is_active=True,
        created_at=NOW,
        updated_at=NOW,
    )
    return ZoneView(
        zone=zone,
        centre=Coordinates(latitude=6.4447, longitude=7.5108),
        boundary=None,
        fees=[ZoneFee(CATEGORY_ID, "Potable Water", 300_000)],
    )


class Fake:
    """Records the pricing service calls the router makes."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.error: APIError | None = None
        self.pilot: WaterCategory | None = WaterCategory(
            id=PILOT_CATEGORY_ID, code="utility", label="Utility Water"
        )

    def _record(self, name: str, kwargs: dict[str, Any]) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def list_zones(self, _: object) -> list[ZoneView]:
        self._record("list_zones", {})
        return [zone_view()]

    async def list_active_zones(self, _: object) -> list[ServiceZone]:
        self._record("list_active_zones", {})
        return [zone_view().zone]

    async def create_zone(self, _: object, **kwargs: Any) -> ZoneView:
        self._record("create_zone", kwargs)
        return zone_view()

    async def update_zone(self, _: object, **kwargs: Any) -> ZoneView:
        self._record("update_zone", kwargs)
        return zone_view()

    async def pilot_category(self, _: object) -> WaterCategory | None:
        return self.pilot


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Fake:
    fake = Fake()
    for name in ("list_zones", "list_active_zones", "create_zone", "update_zone"):
        monkeypatch.setattr(zones_service, name, getattr(fake, name))
    monkeypatch.setattr(quotes, "pilot_category", fake.pilot_category)
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: Fake) -> TestClient:
    """Client whose session cookie value names the signed-in role."""

    async def lookup(_: object, token: str) -> auth_service.AuthenticatedSession | None:
        try:
            user = USERS[UserRole(token)]
        except ValueError:
            return None
        user_session = UserSession(
            id=uuid.uuid4(), user_id=user.id, token_hash="x", expires_at=NOW + timedelta(days=9999)
        )
        return auth_service.AuthenticatedSession(user=user, session=user_session, token=token)

    monkeypatch.setattr(auth_service, "get_authenticated_session", lookup)
    return client


def sign_in(client: TestClient, role: UserRole) -> dict[str, str]:
    client.cookies.set(SESSION_COOKIE_NAME, role.value)
    secret = get_settings().session_secret.get_secret_value()
    return {CSRF_HEADER_NAME: security.csrf_token_for(role.value, secret)}


def error_of(response: Any) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


def write_body(**changes: Any) -> dict[str, Any]:
    return {**example("admin-service-zone-write-request.json"), **changes}


ADMIN_CALLS = [
    ("GET", ADMIN_LIST, None),
    ("POST", ADMIN_LIST, "admin-service-zone-write-request.json"),
    ("PATCH", ADMIN_ZONE, "admin-service-zone-write-request.json"),
]


def call(client: TestClient, method: str, path: str, body: str | None, headers: dict) -> Any:
    return client.request(method, path, json=example(body) if body else None, headers=headers)


# --- Examples match the schemas -------------------------------------------------------


def test_examples_match_the_response_schemas() -> None:
    ServiceZoneList.model_validate(example("admin-service-zones.json"))
    ServiceZoneOptionList.model_validate(example("service-zones.json"))


def test_responses_have_the_examples_shape(api: TestClient) -> None:
    headers = sign_in(api, UserRole.ADMIN)
    listed = api.get(ADMIN_LIST, headers=headers).json()
    assert keys(listed) == keys(example("admin-service-zones.json"))
    api.cookies.clear()
    assert keys(api.get(PUBLIC_LIST).json()) == keys(example("service-zones.json"))


# --- Access (FR-001, T-07) ------------------------------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_CALLS)
def test_signed_out_admin_requests_are_not_authenticated(
    api: TestClient, fake: Fake, method: str, path: str, body: str | None
) -> None:
    assert error_of(call(api, method, path, body, {})) == (401, "not_authenticated")
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path", "body"), ADMIN_CALLS)
def test_t07_only_admins_manage_zones(
    api: TestClient, fake: Fake, role: UserRole, method: str, path: str, body: str | None
) -> None:
    headers = sign_in(api, role)
    assert error_of(call(api, method, path, body, headers)) == (403, "forbidden")
    assert fake.calls == []


@pytest.mark.parametrize(("method", "path"), [("POST", ADMIN_LIST), ("PATCH", ADMIN_ZONE)])
def test_writes_need_the_csrf_header(api: TestClient, fake: Fake, method: str, path: str) -> None:
    sign_in(api, UserRole.ADMIN)
    response = api.request(method, path, json=write_body())
    assert error_of(response) == (403, "csrf_failed")
    assert fake.calls == []


@pytest.mark.parametrize("role", [None, *UserRole])
def test_the_zone_list_needs_no_session(api: TestClient, fake: Fake, role: UserRole | None) -> None:
    if role is not None:
        sign_in(api, role)
    response = api.get(PUBLIC_LIST)
    assert response.status_code == 200
    # id and name only: no fees, coordinates or boundary.
    assert response.json() == {"items": [{"id": str(ZONE_ID), "name": "Independence Layout"}]}
    assert fake.calls == [("list_active_zones", {})]


# --- Admin list and create ------------------------------------------------------------


def test_list_returns_every_zone_with_fees(api: TestClient) -> None:
    response = api.get(ADMIN_LIST, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    zone = response.json()["items"][0]
    assert zone["fallback_delivery_fees"] == [
        {
            "water_category": {"id": str(CATEGORY_ID), "label": "Potable Water"},
            "fee_minor_units": 300_000,
        }
    ]
    assert (zone["centre"], zone["boundary"]) == (
        {"latitude": 6.4447, "longitude": 7.5108},
        None,
    )


def test_list_names_the_pilot_water_category(api: TestClient) -> None:
    # Amendment #74 (#109): the category whose fee the Service areas screen edits.
    response = api.get(ADMIN_LIST, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json()["pilot_water_category"] == {
        "id": str(PILOT_CATEGORY_ID),
        "label": "Utility Water",
    }


def test_list_pilot_water_category_is_null_without_the_configured_category(
    api: TestClient, fake: Fake
) -> None:
    fake.pilot = None
    response = api.get(ADMIN_LIST, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert response.json()["pilot_water_category"] is None
    assert len(response.json()["items"]) == 1


def test_create_passes_the_zone_and_returns_201(api: TestClient, fake: Fake) -> None:
    ring = [[7.5, 6.45], [7.51, 6.45], [7.51, 6.46], [7.5, 6.45]]
    body = write_body(
        name="  Independence Layout  ", boundary={"type": "Polygon", "coordinates": [ring]}
    )
    response = api.post(ADMIN_LIST, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 201
    ServiceZoneRead.model_validate(response.json())
    assert fake.calls == [
        (
            "create_zone",
            {
                "actor": ADMIN,
                "data": ZoneData(
                    name="Independence Layout",
                    is_active=True,
                    centre=Coordinates(latitude=6.4447, longitude=7.5108),
                    boundary=[(7.5, 6.45), (7.51, 6.45), (7.51, 6.46), (7.5, 6.45)],
                    fees=[FeeInput(CATEGORY_ID, 300_000)],
                ),
            },
        )
    ]


def test_create_without_boundary_or_fees(api: TestClient, fake: Fake) -> None:
    body = write_body()
    del body["boundary"], body["fallback_delivery_fees"]
    response = api.post(ADMIN_LIST, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 201
    data = fake.calls[0][1]["data"]
    assert (data.boundary, data.fees) == (None, [])


SQUARE = [[7.5, 6.45], [7.51, 6.45], [7.51, 6.46], [7.5, 6.46], [7.5, 6.45]]
INVALID_WRITES = [
    pytest.param({"name": " A "}, ["body", "name"], id="name-too-short"),
    pytest.param({"name": "x" * 101}, ["body", "name"], id="name-too-long"),
    pytest.param(
        {"centre": {"latitude": 90.5, "longitude": 7.5}},
        ["body", "centre", "latitude"],
        id="latitude-out-of-range",
    ),
    pytest.param(
        {"centre": {"latitude": 6.4, "longitude": -180.5}},
        ["body", "centre", "longitude"],
        id="longitude-out-of-range",
    ),
    pytest.param(
        {"boundary": {"type": "Polygon", "coordinates": [SQUARE[:-1]]}},
        ["body", "boundary", "coordinates"],
        id="ring-not-closed",
    ),
    pytest.param(
        {"boundary": {"type": "Polygon", "coordinates": [[SQUARE[0], SQUARE[1], SQUARE[0]]]}},
        ["body", "boundary", "coordinates"],
        id="ring-too-short",
    ),
    pytest.param(
        {"boundary": {"type": "Polygon", "coordinates": [SQUARE, SQUARE]}},
        ["body", "boundary", "coordinates"],
        id="holes-refused",
    ),
    pytest.param(
        {
            "boundary": {
                "type": "Polygon",
                "coordinates": [[[7.5, 91.0], *SQUARE[1:4], [7.5, 91.0]]],
            }
        },
        ["body", "boundary", "coordinates"],
        id="position-out-of-range",
    ),
    pytest.param(
        {"boundary": {"type": "Point", "coordinates": [SQUARE]}},
        ["body", "boundary", "type"],
        id="not-a-polygon",
    ),
    pytest.param(
        {
            "fallback_delivery_fees": [
                {"water_category_id": str(CATEGORY_ID), "fee_minor_units": 100},
                {"water_category_id": str(CATEGORY_ID), "fee_minor_units": 200},
            ]
        },
        ["body", "fallback_delivery_fees"],
        id="category-twice",
    ),
    pytest.param(
        {
            "fallback_delivery_fees": [
                {"water_category_id": str(CATEGORY_ID), "fee_minor_units": -1}
            ]
        },
        ["body", "fallback_delivery_fees", 0, "fee_minor_units"],
        id="negative-fee",
    ),
    pytest.param(
        {
            "fallback_delivery_fees": [
                {"water_category_id": str(CATEGORY_ID), "fee_minor_units": 300000.5}
            ]
        },
        ["body", "fallback_delivery_fees", 0, "fee_minor_units"],
        id="fractional-fee",
    ),
    pytest.param({"station_id": None}, ["body", "station_id"], id="unknown-field"),
]


@pytest.mark.parametrize(("changes", "loc"), INVALID_WRITES)
def test_create_validation(
    api: TestClient, fake: Fake, changes: dict[str, Any], loc: list[Any]
) -> None:
    response = api.post(
        ADMIN_LIST, json=write_body(**changes), headers=sign_in(api, UserRole.ADMIN)
    )
    assert error_of(response) == (422, "validation_error")
    assert loc in [detail["loc"] for detail in response.json()["error"]["details"]]
    assert fake.calls == []


@pytest.mark.parametrize("missing", ["name", "is_active", "centre"])
def test_create_needs_name_active_flag_and_centre(
    api: TestClient, fake: Fake, missing: str
) -> None:
    body = write_body()
    del body[missing]
    response = api.post(ADMIN_LIST, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


# --- Admin update ---------------------------------------------------------------------


def test_update_names_only_the_fields_sent(api: TestClient, fake: Fake) -> None:
    body = {"is_active": False, "boundary": None, "fallback_delivery_fees": []}
    response = api.patch(ADMIN_ZONE, json=body, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert fake.calls == [
        (
            "update_zone",
            {
                "actor": ADMIN,
                "zone_id": ZONE_ID,
                "update": ZoneUpdate(
                    sent=frozenset({"is_active", "boundary", "fees"}),
                    is_active=False,
                    boundary=None,
                    fees=[],
                ),
            },
        )
    ]


def test_an_empty_update_sends_nothing(api: TestClient, fake: Fake) -> None:
    response = api.patch(ADMIN_ZONE, json={}, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    assert fake.calls[0][1]["update"] == ZoneUpdate(sent=frozenset())


@pytest.mark.parametrize("field", ["name", "is_active", "centre", "fallback_delivery_fees"])
def test_update_refuses_null_except_for_the_boundary(
    api: TestClient, fake: Fake, field: str
) -> None:
    response = api.patch(ADMIN_ZONE, json={field: None}, headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


@pytest.mark.parametrize(("changes", "loc"), INVALID_WRITES)
def test_update_validation(
    api: TestClient, fake: Fake, changes: dict[str, Any], loc: list[Any]
) -> None:
    response = api.patch(ADMIN_ZONE, json=changes, headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


def test_a_malformed_zone_id_is_a_validation_error(api: TestClient, fake: Fake) -> None:
    response = api.patch(f"{ADMIN_LIST}/not-a-uuid", json={}, headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


# --- Service errors pass through ------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path", "error"),
    [
        ("POST", ADMIN_LIST, APIError(409, "service_zone_name_taken", "Taken")),
        ("POST", ADMIN_LIST, APIError(404, "water_category_not_found", "Not found")),
        ("PATCH", ADMIN_ZONE, APIError(404, "service_zone_not_found", "Not found")),
        ("PATCH", ADMIN_ZONE, APIError(409, "service_zone_name_taken", "Taken")),
    ],
)
def test_service_errors_keep_their_codes(
    api: TestClient, fake: Fake, method: str, path: str, error: APIError
) -> None:
    fake.error = error
    response = api.request(method, path, json=write_body(), headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (error.status_code, error.code)
