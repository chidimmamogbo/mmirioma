"""Server quotes without a database (#21).

Contract: docs/api/order-details-and-price.md, ``POST /quotes`` (agreed
2026-10-26). Covers the price arithmetic and its rounding rule (decision C),
address normalization for ``quote_mismatch``, the request schema, the two
response shapes against the contract examples, the rate limits (decision E)
and roles. The quote service is faked; database behaviour is in
test_quotes_integration.py.
"""

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import APIError
from app.modules.auth.models import UserRole
from app.modules.orders.models import WaterSourcePreference
from app.modules.pricing import quotes
from app.modules.pricing.models import MarginType, Quote
from app.modules.pricing.quotes import ManualReason, QuoteAnswer, compute_price, normalize_address
from app.modules.pricing.rate_limit import (
    QUOTES_PER_CUSTOMER,
    QUOTES_PER_IP,
    QuoteRateLimits,
    get_quote_rate_limits,
)
from app.modules.sources.models import WaterCategory, WaterSourceKind
from tests import test_orders_api as orders_api
from tests.test_orders_api import sign_in

# Fixtures shared with the orders API tests.
api = orders_api.api
fake_orders = orders_api.fake_orders

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"
REQUEST = json.loads((EXAMPLES / "quote-create-request.json").read_text())
CATEGORY = WaterCategory(
    id=uuid.uuid4(), code="utility", label="Utility Water", supported_uses=None, is_active=True
)
VALID_UNTIL = datetime(2026, 10, 26, 13, 30, tzinfo=UTC)


def example(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text())


def stored_quote() -> Quote:
    return Quote(
        id=uuid.UUID("c7e1b9a2-4d3f-4a6b-8e05-9f2d1c0b3a74"),
        water_category_label="Utility Water",
        total_minor_units=2_000_000,
        price_valid_until=VALID_UNTIL,
    )


@pytest.fixture(autouse=True)
def fresh_limits() -> Any:
    get_quote_rate_limits().clear()
    yield
    get_quote_rate_limits().clear()


@pytest.fixture
def answers(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Fake ``create_quote``: record its arguments, answer with a stored quote."""
    calls: list[dict[str, Any]] = []

    async def create_quote(_: object, **kwargs: Any) -> QuoteAnswer:
        calls.append(kwargs)
        return QuoteAnswer(stored_quote(), CATEGORY, kwargs["choice"].quantity_litres, None)

    monkeypatch.setattr(quotes, "create_quote", create_quote)
    return calls


def post(client: TestClient, body: dict[str, Any], role: UserRole = UserRole.CUSTOMER) -> Any:
    return client.post("/api/v1/quotes", json=body, headers=sign_in(client, role))


def error(response: Any) -> tuple[int, str]:
    return response.status_code, response.json()["error"]["code"]


# --- The price (FR-022, decision C) -------------------------------------------------


def test_fixed_margin_total_is_the_sum_rounded_up_to_whole_naira() -> None:
    price = compute_price(
        cost_per_litre=151,
        litres=601,
        delivery=300_000,
        handling=50_000,
        margin_type=MarginType.FIXED,
        margin_amount=20_000,
        margin_basis_points=None,
    )
    assert (price.water, price.margin) == (151 * 601, 20_000)
    # 90,751 + 300,000 + 50,000 + 20,000 = 460,751 kobo, up to 460,800.
    assert (price.rounding, price.total) == (49, 460_800)


def test_percentage_margin_rounds_half_up_then_the_total_rounds_up() -> None:
    price = compute_price(
        cost_per_litre=151,
        litres=601,
        delivery=300_000,
        handling=50_000,
        margin_type=MarginType.PERCENTAGE,
        margin_amount=None,
        margin_basis_points=1234,
    )
    # 12.34% of 440,751 = 54,388.67 kobo, half-up to 54,389.
    assert price.margin == 54_389
    assert (price.rounding, price.total) == (60, 495_200)


def test_a_whole_naira_sum_needs_no_rounding() -> None:
    price = compute_price(
        cost_per_litre=150,
        litres=3000,
        delivery=300_000,
        handling=50_000,
        margin_type=MarginType.PERCENTAGE,
        margin_amount=None,
        margin_basis_points=1000,
    )
    assert (price.margin, price.rounding, price.total) == (80_000, 0, 880_000)
    assert price.total == price.water + price.delivery + price.handling + price.margin


def test_addresses_match_ignoring_case_and_spacing_only() -> None:
    assert normalize_address("  12 Sample  Close,\tENUGU ") == normalize_address(
        "12 sample close, Enugu"
    )
    assert normalize_address("12 Sample Close, Enugu") != normalize_address("12 Sample Close Enugu")


def test_source_kinds_match_the_customer_preferences() -> None:
    # A Tanker customer's water_source is compared with a source's kind.
    assert {kind.value for kind in WaterSourceKind} == {
        preference.value for preference in WaterSourcePreference
    }


def test_quote_settings_defaults() -> None:
    settings = Settings(_env_file=None, database_url="postgresql+asyncpg://u:p@localhost/db")  # type: ignore[call-arg]
    assert (settings.pilot_water_category, settings.quote_validity_minutes) == ("utility", 60)


# --- Rate limits (NFR-002, decision E) ----------------------------------------------


def test_customer_limit_then_429_with_retry_after() -> None:
    limits = QuoteRateLimits()
    for _ in range(QUOTES_PER_CUSTOMER):
        limits.check_and_record("customer-a", "198.51.100.1")
    with pytest.raises(APIError) as caught:
        limits.check_and_record("customer-a", "198.51.100.1")
    assert (caught.value.status_code, caught.value.code) == (429, "too_many_attempts")
    assert caught.value.headers is not None and int(caught.value.headers["Retry-After"]) > 0
    # Another customer on the same IP is not affected, and the refusal was not counted.
    limits.check_and_record("customer-b", "198.51.100.1")
    assert len(limits.by_ip._current("198.51.100.1") or []) == QUOTES_PER_CUSTOMER + 1


def test_ip_limit_covers_many_customers() -> None:
    limits = QuoteRateLimits()
    for number in range(QUOTES_PER_IP):
        limits.check_and_record(f"customer-{number}", "198.51.100.2")
    with pytest.raises(APIError, match="Too many attempts"):
        limits.check_and_record("customer-new", "198.51.100.2")


# --- POST /quotes --------------------------------------------------------------------


def test_available_answer_matches_the_contract_example(
    api: TestClient, answers: list[dict[str, Any]]
) -> None:
    response = post(api, REQUEST)
    assert response.status_code == 200
    assert response.json() == example("quote-available.json")
    (call,) = answers
    choice = call["choice"]
    assert (choice.delivery_type, choice.tanker_tank_type, choice.water_source) == (
        "tanker",
        "ground",
        "borehole",
    )
    assert (choice.quantity_litres, choice.tanker_quantity_local_gallons) == (3000, 750)
    assert choice.service_zone_id == uuid.UUID(REQUEST["service_zone_id"])
    assert call["customer_id"] == orders_api.USERS[UserRole.CUSTOMER].id


def test_never_sends_the_breakdown(api: TestClient, answers: list[dict[str, Any]]) -> None:
    body = post(api, REQUEST).json()
    assert set(body) == {
        "status",
        "quote_id",
        "currency",
        "quantity_litres",
        "water_category",
        "total_minor_units",
        "price_valid_until",
    }


def test_manual_answer_matches_the_contract_example(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def create_quote(_: object, **kwargs: Any) -> QuoteAnswer:
        return QuoteAnswer(None, CATEGORY, 6000, ManualReason.NO_VEHICLE_PLAN)

    monkeypatch.setattr(quotes, "create_quote", create_quote)
    response = post(api, REQUEST)
    assert response.status_code == 200
    assert response.json() == example("quote-manual.json")


def test_reason_codes_in_the_agreed_order() -> None:
    assert [reason.value for reason in ManualReason] == [
        "outside_service_zone",
        "category_unavailable",
        "no_eligible_source",
        "no_vehicle_plan",
        "delivery_cost_unavailable",
        "no_price_rule",
    ]


def test_keke_choice_is_cans_times_size_with_no_source(
    api: TestClient, answers: list[dict[str, Any]]
) -> None:
    body = {
        "delivery_type": "keke",
        "keke": {"can_size_litres": 50, "can_count": 12},
        "delivery_address": "12 Sample Close, Enugu",
    }
    assert post(api, body).status_code == 200
    choice = answers[0]["choice"]
    assert (choice.quantity_litres, choice.water_source, choice.service_zone_id) == (
        600,
        None,
        None,
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"delivery_address": ...},  # removed: no price without the address
        {"delivery_address": "  "},
        {"water_category_id": str(uuid.uuid4())},  # the server picks the category
        {"water_source": None},  # Tanker needs one
        {"keke": {"can_size_litres": 25, "can_count": 24}},  # both details
        {"tanker": {"tank_type": "ground", "quantity_local_gallons": 100}},  # below 600 L
        {"delivery_type": None},
        {"service_zone_id": "not-a-uuid"},
    ],
)
def test_invalid_bodies_are_422(
    api: TestClient, answers: list[dict[str, Any]], changes: dict[str, Any]
) -> None:
    body = {key: value for key, value in {**REQUEST, **changes}.items() if value is not ...}
    assert error(post(api, body)) == (422, "validation_error")
    assert answers == []


def test_keke_with_a_source_is_422(api: TestClient, answers: list[dict[str, Any]]) -> None:
    body = {
        "delivery_type": "keke",
        "keke": {"can_size_litres": 25, "can_count": 24},
        "water_source": "borehole",
        "delivery_address": "12 Sample Close, Enugu",
    }
    assert error(post(api, body)) == (422, "validation_error")


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.DRIVER])
def test_staff_and_drivers_are_forbidden(
    api: TestClient, answers: list[dict[str, Any]], role: UserRole
) -> None:
    assert error(post(api, REQUEST, role)) == (403, "forbidden")


def test_signed_out_and_missing_csrf(api: TestClient, answers: list[dict[str, Any]]) -> None:
    assert error(api.post("/api/v1/quotes", json=REQUEST)) == (401, "not_authenticated")
    sign_in(api, UserRole.CUSTOMER)
    assert error(api.post("/api/v1/quotes", json=REQUEST)) == (403, "csrf_failed")
    assert answers == []


def test_the_31st_quote_in_ten_minutes_is_429(
    api: TestClient, answers: list[dict[str, Any]]
) -> None:
    for _ in range(QUOTES_PER_CUSTOMER):
        assert post(api, REQUEST).status_code == 200
    response = post(api, REQUEST)
    assert error(response) == (429, "too_many_attempts")
    assert int(response.headers["Retry-After"]) > 0
    assert response.json()["error"]["details"]["retry_after_seconds"] > 0
    assert len(answers) == QUOTES_PER_CUSTOMER


def test_unknown_zone_passes_through(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def create_quote(_: object, **kwargs: Any) -> QuoteAnswer:
        raise APIError(404, "service_zone_not_found", "Service zone not found")

    monkeypatch.setattr(quotes, "create_quote", create_quote)
    assert error(post(api, REQUEST)) == (404, "service_zone_not_found")
