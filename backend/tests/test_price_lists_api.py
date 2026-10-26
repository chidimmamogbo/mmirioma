"""Price list endpoint tests that need no database (#37).

Contract: docs/api/admin-directory.md, "Price lists" (agreed 2026-10-26).
The price list service is faked, so these cover roles (FR-001, T-07), CSRF,
request validation, paging, the arguments passed to the service, the
response shape against the contract's examples, and error codes passing
through. Database behaviour is in test_price_lists_integration.py.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.modules.auth import service as auth_service
from app.modules.auth.models import UserRole, UserSession
from app.modules.pricing import price_lists
from app.modules.pricing.models import MarginType, PriceListVersion, PriceRule
from app.modules.pricing.price_lists import Person, PriceListView, RuleInput
from app.modules.pricing.schemas import PriceListCreate, PriceListPage, PriceListRead
from tests.test_dispatch_api import keys
from tests.test_service_zones_api import ADMIN, USERS, error_of, example, sign_in

NOW = datetime(2026, 10, 26, 9, 0, tzinfo=UTC)
LISTS = "/api/v1/admin/price-lists"
CURRENT = f"{LISTS}/current"


def view() -> PriceListView:
    version = PriceListVersion(
        id=uuid.uuid4(),
        version=3,
        effective_from=NOW,
        created_by=ADMIN.id,
        reason="Sample change for review",
        changes=[{"path": "rules[1].distance_rate_minor_units_per_km", "from": 12000, "to": 15000}],
    )
    common = {
        "price_list_version_id": version.id,
        "zone_id": None,
        "water_category_id": None,
        "distance_rate_minor_units_per_km": 15_000,
        "additional_trip_minor_units": 150_000,
        "handling_minor_units": 50_000,
    }
    # In the example's order: a fixed margin first, then a percentage one.
    rules = [
        PriceRule(
            id=uuid.uuid4(),
            position=0,
            min_litres=600,
            max_litres=1999,
            base_delivery_fee_minor_units=100_000,
            margin_type=MarginType.FIXED,
            margin_amount_minor_units=50_000,
            margin_basis_points=None,
            **common,
        ),
        PriceRule(
            id=uuid.uuid4(),
            position=1,
            min_litres=2000,
            max_litres=None,
            base_delivery_fee_minor_units=200_000,
            margin_type=MarginType.PERCENTAGE,
            margin_amount_minor_units=None,
            margin_basis_points=1000,
            **common,
        ),
    ]
    return PriceListView(version=version, created_by=Person(ADMIN.id, ADMIN.name), rules=rules)


class Fake:
    """Records the price list service calls the router makes."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.error: APIError | None = None

    def _record(self, name: str, kwargs: dict[str, Any]) -> None:
        self.calls.append((name, kwargs))
        if self.error:
            raise self.error

    async def list_price_lists(self, _: object, **kwargs: Any) -> tuple[list[PriceListView], int]:
        self._record("list_price_lists", kwargs)
        return [view()], 7

    async def current_price_list(self, _: object) -> PriceListView:
        self._record("current_price_list", {})
        return view()

    async def save_price_list(self, _: object, **kwargs: Any) -> PriceListView:
        self._record("save_price_list", kwargs)
        return view()


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Fake:
    fake = Fake()
    for name in ("list_price_lists", "current_price_list", "save_price_list"):
        monkeypatch.setattr(price_lists, name, getattr(fake, name))
    return fake


@pytest.fixture
def api(client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: Fake) -> TestClient:
    """Client whose session cookie value names the signed-in role."""

    async def lookup(_: object, token: str) -> auth_service.AuthenticatedSession | None:
        try:
            user = USERS[UserRole(token)]
        except ValueError:
            return None
        session = UserSession(
            id=uuid.uuid4(), user_id=user.id, token_hash="x", expires_at=NOW + timedelta(days=9999)
        )
        return auth_service.AuthenticatedSession(user=user, session=session, token=token)

    monkeypatch.setattr(auth_service, "get_authenticated_session", lookup)
    return client


def body(**changes: Any) -> dict[str, Any]:
    return {**example("admin-price-list-create-request.json"), **changes}


def with_rule(**changes: Any) -> dict[str, Any]:
    rule = {**example("admin-price-list-create-request.json")["rules"][0], **changes}
    return body(rules=[rule])


CALLS = [("GET", LISTS, None), ("GET", CURRENT, None), ("POST", LISTS, "create")]


def call(client: TestClient, method: str, path: str, kind: str | None, headers: dict) -> Any:
    return client.request(method, path, json=body() if kind else None, headers=headers)


# --- Examples match the schemas -------------------------------------------------------


def test_examples_match_the_schemas(api: TestClient) -> None:
    PriceListRead.model_validate(example("admin-price-list.json"))
    PriceListCreate.model_validate(example("admin-price-list-create-request.json"))
    response = api.get(CURRENT, headers=sign_in(api, UserRole.ADMIN))
    assert keys(response.json()) == keys(example("admin-price-list.json"))


# --- Access (FR-001, T-07) ------------------------------------------------------------


@pytest.mark.parametrize(("method", "path", "kind"), CALLS)
def test_signed_out_is_not_authenticated(
    api: TestClient, fake: Fake, method: str, path: str, kind: str | None
) -> None:
    assert error_of(call(api, method, path, kind, {})) == (401, "not_authenticated")
    assert fake.calls == []


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path", "kind"), CALLS)
def test_t07_only_admins(
    api: TestClient, fake: Fake, role: UserRole, method: str, path: str, kind: str | None
) -> None:
    headers = sign_in(api, role)
    assert error_of(call(api, method, path, kind, headers)) == (403, "forbidden")
    assert fake.calls == []


def test_saving_needs_the_csrf_header(api: TestClient, fake: Fake) -> None:
    sign_in(api, UserRole.ADMIN)
    assert error_of(api.post(LISTS, json=body())) == (403, "csrf_failed")
    assert fake.calls == []


# --- Reads ----------------------------------------------------------------------------


def test_list_pages_newest_first(api: TestClient, fake: Fake) -> None:
    response = api.get(f"{LISTS}?limit=5&offset=10", headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 200
    page = PriceListPage.model_validate(response.json())
    assert (page.total, page.limit, page.offset) == (7, 5, 10)
    assert fake.calls == [("list_price_lists", {"limit": 5, "offset": 10})]
    assert response.json()["items"][0]["changes"][0]["from"] == 12000


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1"])
def test_list_paging_is_checked(api: TestClient, fake: Fake, query: str) -> None:
    response = api.get(f"{LISTS}?{query}", headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


def test_current_returns_the_margin_shape(api: TestClient) -> None:
    rules = api.get(CURRENT, headers=sign_in(api, UserRole.ADMIN)).json()["rules"]
    assert [rule["margin"] for rule in rules] == [
        {"type": "fixed", "amount_minor_units": 50_000},
        {"type": "percentage", "basis_points": 1000},
    ]


# --- Save -----------------------------------------------------------------------------


def test_save_passes_the_rules_and_returns_201(api: TestClient, fake: Fake) -> None:
    response = api.post(
        LISTS, json=body(reason="  Diesel price rise  "), headers=sign_in(api, UserRole.ADMIN)
    )
    assert response.status_code == 201
    assert fake.calls == [
        (
            "save_price_list",
            {
                "actor": ADMIN,
                "base_version": 3,
                "reason": "Diesel price rise",
                "rules": [
                    RuleInput(
                        zone_id=None,
                        water_category_id=None,
                        min_litres=600,
                        max_litres=None,
                        base_delivery_fee_minor_units=200_000,
                        distance_rate_minor_units_per_km=15_000,
                        additional_trip_minor_units=150_000,
                        handling_minor_units=50_000,
                        margin_type=MarginType.PERCENTAGE,
                        margin_amount_minor_units=None,
                        margin_basis_points=1000,
                    )
                ],
            },
        )
    ]


def test_a_fixed_margin_and_the_first_list(api: TestClient, fake: Fake) -> None:
    payload = with_rule(margin={"type": "fixed", "amount_minor_units": 50_000})
    payload["base_version"] = None
    payload["reason"] = "   "
    response = api.post(LISTS, json=payload, headers=sign_in(api, UserRole.ADMIN))
    assert response.status_code == 201
    saved = fake.calls[0][1]
    assert (saved["base_version"], saved["reason"]) == (None, None)
    rule = saved["rules"][0]
    assert (rule.margin_type, rule.margin_amount_minor_units, rule.margin_basis_points) == (
        MarginType.FIXED,
        50_000,
        None,
    )


INVALID = [
    pytest.param(with_rule(min_litres=599), id="band-below-600"),
    pytest.param(with_rule(min_litres=2000, max_litres=1999), id="band-reversed"),
    pytest.param(with_rule(handling_minor_units=-1), id="negative-amount"),
    pytest.param(with_rule(base_delivery_fee_minor_units=1000.5), id="fractional-amount"),
    pytest.param(
        with_rule(margin={"type": "percentage", "basis_points": 10_001}), id="margin-over-100"
    ),
    pytest.param(
        with_rule(margin={"type": "percentage", "amount_minor_units": 5}), id="margin-wrong-field"
    ),
    pytest.param(with_rule(margin={"type": "share", "basis_points": 5}), id="margin-unknown-type"),
    pytest.param(body(rules=[]), id="no-rules"),
    pytest.param(body(base_version=0), id="version-zero"),
    pytest.param(body(reason="x" * 501), id="reason-too-long"),
    pytest.param(with_rule(id=str(uuid.uuid4())), id="rule-with-id"),
    pytest.param(
        {k: v for k, v in body().items() if k != "base_version"}, id="base-version-missing"
    ),
]


@pytest.mark.parametrize("payload", INVALID)
def test_save_validation(api: TestClient, fake: Fake, payload: dict[str, Any]) -> None:
    response = api.post(LISTS, json=payload, headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (422, "validation_error")
    assert fake.calls == []


@pytest.mark.parametrize(
    "error",
    [
        APIError(409, "price_list_changed", "Changed", {"current_version": 4}),
        APIError(409, "price_list_unchanged", "Unchanged"),
        APIError(422, "price_rules_overlap", "Overlap", [{"loc": ["body", "rules", 1]}]),
        APIError(404, "service_zone_not_found", "Not found"),
        APIError(404, "water_category_not_found", "Not found"),
    ],
)
def test_service_errors_keep_their_codes(api: TestClient, fake: Fake, error: APIError) -> None:
    fake.error = error
    response = api.post(LISTS, json=body(), headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (error.status_code, error.code)
    assert response.json()["error"]["details"] == error.details


def test_current_before_the_first_save_is_not_found(api: TestClient, fake: Fake) -> None:
    fake.error = APIError(404, "price_list_not_found", "None yet")
    response = api.get(CURRENT, headers=sign_in(api, UserRole.ADMIN))
    assert error_of(response) == (404, "price_list_not_found")
