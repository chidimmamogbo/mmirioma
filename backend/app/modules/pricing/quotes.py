"""Server quotes: pricing a customer's choice, and checking it at order time (#21).

Contract: docs/api/order-details-and-price.md, ``POST /quotes`` and "POST
/orders changes" (agreed 2026-10-26, #42). Feature doc:
docs/features/pricing.md.

**The price** (FR-022): water + delivery + handling + MmiriOma margin.

- **Water:** the highest cost per litre among the sources eligible today for
  the pilot category and of the preferred kind (decision 3; Keke: any kind),
  times the litres. The cost per litre is never sent to a customer (FR-011).
- **Delivery:** the picked zone's fee for the category, once per order. There
  is no road distance yet (OSRM, SRS §12.1), so the zone fee replaces the
  whole FR-022 delivery cost: base fee, distance and extra trips (decision B).
- **Handling and margin:** from the price rule that matches the zone,
  category and litres (#37). A percentage margin applies to water +
  delivery + handling.
- **Rounding** (decision C): amounts are exact kobo; a percentage margin is
  computed with ``Decimal`` and rounded half-up to whole kobo; the total is
  then rounded **up** to whole naira, and the adjustment is stored.

**No reliable price, no number** (SRS §6): the answer is
``manual_quote_required`` with the first reason that applies, in this order
(decision F): ``outside_service_zone``, ``category_unavailable``,
``no_eligible_source``, ``no_vehicle_plan``, ``delivery_cost_unavailable``,
``no_price_rule`` (decision A). Nothing is stored for a manual answer.
"""

import re
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from http import HTTPStatus

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.dispatch import vehicles
from app.modules.pricing import price_lists
from app.modules.pricing import service as zones
from app.modules.pricing.models import KOBO_PER_NAIRA, MarginType, Quote, ServiceZone
from app.modules.sources import service as sources
from app.modules.sources.models import WaterCategory, WaterSourceKind
from app.shared.lagos_time import LAGOS_TZ

BASIS_POINTS_PER_WHOLE = 10_000


class ManualReason(StrEnum):
    """Why a quote has no price (contract, ``manual_quote_required``), in check order."""

    OUTSIDE_SERVICE_ZONE = "outside_service_zone"
    CATEGORY_UNAVAILABLE = "category_unavailable"
    NO_ELIGIBLE_SOURCE = "no_eligible_source"
    NO_VEHICLE_PLAN = "no_vehicle_plan"
    DELIVERY_COST_UNAVAILABLE = "delivery_cost_unavailable"
    #: Decision A (2026-10-26): no price rule matches, or no price list exists.
    NO_PRICE_RULE = "no_price_rule"


@dataclass(frozen=True)
class Choice:
    """What a customer chose, as the quote and the order both carry it.

    The orders module builds it from its own request type, so this module
    never imports the orders service.

    Attributes:
        delivery_type: ``keke`` or ``tanker``.
        keke_can_size_litres, keke_can_count: Keke details, else None.
        tanker_tank_type, tanker_quantity_local_gallons: Tanker details, else None.
        water_source: Tanker only: ``ninth_mile`` or ``borehole``.
        quantity_litres: The server's conversion (FR-021).
        delivery_address: As sent (trimmed by the request schema).
        service_zone_id: The zone the customer picked, or None.
    """

    delivery_type: str
    keke_can_size_litres: int | None
    keke_can_count: int | None
    tanker_tank_type: str | None
    tanker_quantity_local_gallons: int | None
    water_source: str | None
    quantity_litres: int
    delivery_address: str
    service_zone_id: uuid.UUID | None


@dataclass(frozen=True)
class Breakdown:
    """The FR-022 components of a price, in kobo."""

    water: int
    delivery: int
    handling: int
    margin: int
    rounding: int
    total: int


@dataclass(frozen=True)
class QuoteAnswer:
    """The answer to ``POST /quotes``: a stored quote, or a manual-quote reason.

    Attributes:
        quote: The stored quote when a price is available, else None.
        category: The pilot category (for ``water_category``), when known.
        quantity_litres: The server's conversion, always set.
        reason: Why there is no price, else None.
    """

    quote: Quote | None
    category: WaterCategory | None
    quantity_litres: int
    reason: ManualReason | None


@dataclass(frozen=True)
class QuoteSummary:
    """What a customer sees of an order's quote (total only, decision 6).

    ``water_category_id`` is for staff only: admins confirm with it
    (deliveries.md, amendment #72); the customer's view leaves it out.
    """

    total_minor_units: int
    water_category_id: uuid.UUID
    water_category_label: str
    supported_uses: str | None


def compute_price(
    *,
    cost_per_litre: int,
    litres: int,
    delivery: int,
    handling: int,
    margin_type: MarginType,
    margin_amount: int | None,
    margin_basis_points: int | None,
) -> Breakdown:
    """Compute the FR-022 total with the documented rounding rule (decision C).

    Args:
        cost_per_litre: Kobo per litre (the highest eligible, decision 3).
        litres: Whole litres.
        delivery: The zone fee in kobo, per order.
        handling: Kobo per order (open question 18).
        margin_type: Fixed or percentage.
        margin_amount: The fixed margin in kobo, for ``fixed``.
        margin_basis_points: The percentage in basis points (1 % = 100), for
            ``percentage``; it applies to water + delivery + handling.

    Returns:
        The components and the total, a whole number of naira rounded up.

    Examples:
        Water 450,000 + delivery 300,000 + handling 50,000 = 800,000 kobo; a
        10 % margin (1,000 basis points) adds 80,000; the total 880,000 kobo
        is already whole naira, so the rounding is 0.
    """
    water = cost_per_litre * litres
    base = water + delivery + handling
    if margin_type is MarginType.FIXED:
        margin = margin_amount or 0
    else:
        exact = Decimal(base) * Decimal(margin_basis_points or 0) / Decimal(BASIS_POINTS_PER_WHOLE)
        margin = int(exact.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    subtotal = base + margin
    total = -(-subtotal // KOBO_PER_NAIRA) * KOBO_PER_NAIRA  # round up to whole naira
    return Breakdown(water, delivery, handling, margin, total - subtotal, total)


async def _pilot_category(session: AsyncSession) -> WaterCategory | None:
    code = get_settings().pilot_water_category
    for category in await sources.list_categories(session):
        if category.code == code:
            return category
    return None


def _kind(choice: Choice) -> WaterSourceKind | None:
    # Keke orders have no source preference: any kind of source may serve them.
    return WaterSourceKind(choice.water_source) if choice.water_source else None


async def create_quote(
    session: AsyncSession,
    *,
    customer_id: uuid.UUID,
    choice: Choice,
    now: datetime | None = None,
) -> QuoteAnswer:
    """Price a choice on the server and store the quote, or say why not (FR-022).

    The checks run in the module docstring's order; the first that fails
    gives the manual-quote reason and nothing is stored.

    Args:
        session: Database session; committed here when a quote is stored.
        customer_id: The signed-in customer (only they can order the quote).
        choice: The validated choice; ``delivery_address`` is required.
        now: Current time, for tests.

    Returns:
        The stored quote with its category, or the manual-quote reason.

    Raises:
        APIError: 404 ``service_zone_not_found`` for an unknown zone id.
    """
    now = now or datetime.now(UTC)
    litres = choice.quantity_litres

    def manual(reason: ManualReason, category: WaterCategory | None = None) -> QuoteAnswer:
        return QuoteAnswer(None, category, litres, reason)

    zone: ServiceZone | None = None
    if choice.service_zone_id is not None:
        zone = await session.get(ServiceZone, choice.service_zone_id)
        if zone is None:
            await zones.ensure_zone_exists(session, choice.service_zone_id)  # raises 404
    if zone is None or not zone.is_active:
        return manual(ManualReason.OUTSIDE_SERVICE_ZONE)

    category = await _pilot_category(session)
    if (
        category is None
        or not category.is_active
        or not await sources.has_activation(session, water_category_id=category.id)
    ):
        return manual(ManualReason.CATEGORY_UNAVAILABLE)

    costs = await sources.eligible_costs_per_litre(
        session,
        water_category_id=category.id,
        kind=_kind(choice),
        today=now.astimezone(LAGOS_TZ).date(),
    )
    if not costs:
        return manual(ManualReason.NO_ELIGIBLE_SOURCE, category)

    plan = await vehicles.plan_for(session, litres=litres)
    if plan is None:
        return manual(ManualReason.NO_VEHICLE_PLAN, category)

    delivery = await zones.delivery_cost_from_zone(
        session, zone_id=zone.id, water_category_id=category.id
    )
    if delivery.fee_minor_units is None:
        return manual(ManualReason.DELIVERY_COST_UNAVAILABLE, category)

    match = await price_lists.match_price_rule(
        session, zone_id=zone.id, water_category_id=category.id, litres=litres
    )
    if match is None:
        return manual(ManualReason.NO_PRICE_RULE, category)

    rule = match.rule
    cost_per_litre = max(costs)
    price = compute_price(
        cost_per_litre=cost_per_litre,
        litres=litres,
        delivery=delivery.fee_minor_units,
        handling=rule.handling_minor_units,
        margin_type=rule.margin_type,
        margin_amount=rule.margin_amount_minor_units,
        margin_basis_points=rule.margin_basis_points,
    )
    quote = Quote(
        id=uuid.uuid4(),
        customer_id=customer_id,
        delivery_type=choice.delivery_type,
        keke_can_size_litres=choice.keke_can_size_litres,
        keke_can_count=choice.keke_can_count,
        tanker_tank_type=choice.tanker_tank_type,
        tanker_quantity_local_gallons=choice.tanker_quantity_local_gallons,
        water_source=choice.water_source,
        delivery_address=choice.delivery_address,
        service_zone_id=zone.id,
        quantity_litres=litres,
        water_category_id=category.id,
        water_category_label=category.label,
        cost_per_litre_minor_units=cost_per_litre,
        water_minor_units=price.water,
        delivery_minor_units=price.delivery,
        handling_minor_units=price.handling,
        margin_type=rule.margin_type,
        margin_amount_minor_units=rule.margin_amount_minor_units,
        margin_basis_points=rule.margin_basis_points,
        margin_minor_units=price.margin,
        rounding_minor_units=price.rounding,
        total_minor_units=price.total,
        price_list_version_id=match.version.id,
        price_rule_id=rule.id,
        vehicle_profile_id=plan.vehicle_profile_id,
        safe_payload_litres=plan.safe_payload_litres,
        trips=plan.trips,
        price_valid_until=now + timedelta(minutes=get_settings().quote_validity_minutes),
    )
    session.add(quote)
    await session.commit()
    return QuoteAnswer(quote, category, litres, None)


# --- At order time --------------------------------------------------------------------

_SPACES = re.compile(r"\s+")


def normalize_address(address: str) -> str:
    """Trim, collapse every run of whitespace to one space, and case-fold.

    Contract, "When a quote matches the order": nothing else is rewritten, so
    a changed comma or word is still a mismatch.
    """
    return _SPACES.sub(" ", address.strip()).casefold()


def _mismatched(quote: Quote, choice: Choice) -> list[str]:
    """The request fields that differ from the quote (contract table), as ``loc`` paths."""
    pairs: list[tuple[list[str], object, object]] = [
        (["delivery_type"], quote.delivery_type, choice.delivery_type),
        (["keke", "can_size_litres"], quote.keke_can_size_litres, choice.keke_can_size_litres),
        (["keke", "can_count"], quote.keke_can_count, choice.keke_can_count),
        (["tanker", "tank_type"], quote.tanker_tank_type, choice.tanker_tank_type),
        (
            ["tanker", "quantity_local_gallons"],
            quote.tanker_quantity_local_gallons,
            choice.tanker_quantity_local_gallons,
        ),
        (["water_source"], quote.water_source, choice.water_source),
        (["service_zone_id"], quote.service_zone_id, choice.service_zone_id),
        (
            ["delivery_address"],
            normalize_address(quote.delivery_address),
            normalize_address(choice.delivery_address),
        ),
    ]
    return [".".join(loc) for loc, ours, theirs in pairs if ours != theirs]


async def check_quote_for_order(
    session: AsyncSession,
    *,
    quote_id: uuid.UUID,
    customer_id: uuid.UUID,
    choice: Choice,
    now: datetime | None = None,
) -> Quote:
    """Check a quote an order is placed with, in the contract's order.

    Runs only for a new idempotency key: a retry of a placed order never
    reaches here, so it never turns into ``quote_expired`` (FR-026).

    Args:
        session: Database session.
        quote_id: The quote the order names.
        customer_id: The ordering customer.
        choice: The order's choice.
        now: Current time, for tests.

    Returns:
        The quote, to freeze on the order (FR-024).

    Raises:
        APIError: 404 ``quote_not_found`` (unknown, or another customer's,
            indistinguishable); 409 ``quote_expired``; 422 ``quote_mismatch``
            with ``details`` naming the fields; 409 ``no_eligible_source``.
    """
    now = now or datetime.now(UTC)
    quote = await session.get(Quote, quote_id)
    if quote is None or quote.customer_id != customer_id:
        raise APIError(HTTPStatus.NOT_FOUND, "quote_not_found", "Quote not found")
    if quote.price_valid_until <= now:
        raise APIError(
            HTTPStatus.CONFLICT,
            "quote_expired",
            "This price has expired. Please get a new price.",
        )
    different = _mismatched(quote, choice)
    if different:
        raise APIError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "quote_mismatch",
            "The order does not match its price. Ask for a new price.",
            details=[
                {
                    "loc": ["body", *field.split(".")],
                    "msg": "Differs from the quote",
                    "type": "value_error",
                }
                for field in different
            ],
        )
    costs = await sources.eligible_costs_per_litre(
        session,
        water_category_id=quote.water_category_id,
        kind=_kind(choice),
        today=now.astimezone(LAGOS_TZ).date(),
    )
    if not costs:
        raise APIError(
            HTTPStatus.CONFLICT,
            "no_eligible_source",
            "No water source of your choice can serve this order today.",
        )
    return quote


# --- Reads ----------------------------------------------------------------------------


async def get_quote(session: AsyncSession, quote_id: uuid.UUID) -> Quote | None:
    """Return a stored quote (for confirming a quoted order), or None."""
    return await session.get(Quote, quote_id)


async def quote_summaries(
    session: AsyncSession, quote_ids: Iterable[uuid.UUID | None]
) -> dict[uuid.UUID, QuoteSummary]:
    """Return what customers see of each quote: total and category (decision 6).

    The category label is the one frozen with the quote (FR-024); the
    supported uses are read live, as for the order's category (orders.md,
    decided question 2).
    """
    ids = {quote_id for quote_id in quote_ids if quote_id is not None}
    if not ids:
        return {}
    uses = {
        category.id: category.supported_uses for category in await sources.list_categories(session)
    }
    rows = await session.scalars(select(Quote).where(Quote.id.in_(ids)))
    return {
        quote.id: QuoteSummary(
            total_minor_units=quote.total_minor_units,
            water_category_id=quote.water_category_id,
            water_category_label=quote.water_category_label,
            supported_uses=uses.get(quote.water_category_id),
        )
        for quote in rows
    }
