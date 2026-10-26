"""Price lists: saving versions, reading them, and matching a quote to a rule (#37).

Contract: docs/api/admin-directory.md, "Price lists" (agreed 2026-10-26).
Feature doc: docs/features/pricing.md.

Business rules (FR-022, SRS §5 ``pricing_rules``):

- A price list holds every admin-configured FR-022 rate except the
  supplier's cost per litre (FR-011, on the source's activation): base
  delivery fee, distance rate, additional-trip charge, handling (per order,
  open question 18) and margin, by zone, water category and quantity band.
- Saving creates a new **version** that takes effect at once (open question
  16); versions are never edited, so a quote keeps the version it used
  (FR-024, T-09). The admin sends the version they edited (``base_version``);
  if another admin saved meanwhile, nothing is saved (409
  ``price_list_changed``).
- Rules with the same zone and category must not overlap in litres (422
  ``price_rules_overlap``), so :func:`match_price_rule` is never ambiguous:
  a rule for the zone beats one for every zone, then a rule for the category
  beats one for every category. No match means a manual quote, never a
  guessed price (FR-021, FR-022).

Amounts are integer kobo (BR-01). Rounding is the quote's job (#21).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from http import HTTPStatus
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.modules.audit import service as audit
from app.modules.auth.models import User
from app.modules.pricing.models import MarginType, PriceListVersion, PriceRule, ServiceZone
from app.modules.sources import service as sources

AUDIT_TARGET_TYPE = "price_list"


@dataclass(frozen=True)
class RuleInput:
    """One rule as an administrator writes it (validated by the request schema)."""

    zone_id: uuid.UUID | None
    water_category_id: uuid.UUID | None
    min_litres: int
    max_litres: int | None
    base_delivery_fee_minor_units: int
    distance_rate_minor_units_per_km: int
    additional_trip_minor_units: int
    handling_minor_units: int
    margin_type: MarginType
    margin_amount_minor_units: int | None
    margin_basis_points: int | None


@dataclass(frozen=True)
class Person:
    """An administrator's id and name, as the contract's ``created_by``."""

    id: uuid.UUID
    name: str


@dataclass(frozen=True)
class PriceListView:
    """A saved version with its rules (in saved order) and who saved it."""

    version: PriceListVersion
    created_by: Person
    rules: list[PriceRule]


@dataclass(frozen=True)
class RuleMatch:
    """The rule a quote uses, and the version it belongs to (kept on the quote, FR-024)."""

    version: PriceListVersion
    rule: PriceRule


# --- Reads ----------------------------------------------------------------------------


async def list_price_lists(
    session: AsyncSession, *, limit: int, offset: int
) -> tuple[list[PriceListView], int]:
    """Return a page of versions, newest first, and the total count.

    Args:
        session: Database session.
        limit: Page size (1-100, checked by the router).
        offset: Rows to skip.

    Returns:
        The page and the number of versions.
    """
    total = await session.scalar(select(func.count()).select_from(PriceListVersion)) or 0
    versions = list(
        await session.scalars(
            select(PriceListVersion)
            .order_by(PriceListVersion.version.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return await _views(session, versions), total


async def current_price_list(session: AsyncSession) -> PriceListView:
    """Return the current (highest) version.

    Raises:
        APIError: 404 ``price_list_not_found`` before the first save.
    """
    version = await _current_version(session)
    if version is None:
        raise APIError(
            HTTPStatus.NOT_FOUND, "price_list_not_found", "No price list has been saved yet"
        )
    return (await _views(session, [version]))[0]


async def match_price_rule(
    session: AsyncSession,
    *,
    zone_id: uuid.UUID | None,
    water_category_id: uuid.UUID,
    litres: int,
) -> RuleMatch | None:
    """Find the one rule of the current price list that prices a quote.

    A rule matches when its zone is the quote's zone or ``NULL``, its
    category is the quote's or ``NULL``, and ``litres`` is inside its band
    (inclusive). The most specific wins: a zone's own rule beats an
    every-zone rule, then a category's own rule beats an every-category
    rule. Saving refuses overlapping bands for one zone and category, so two
    rules can never tie.

    Args:
        session: Database session.
        zone_id: The zone the customer picked, or ``None`` (only every-zone
            rules then match; the quote decides whether a zone is required).
        water_category_id: The quote's category (the pilot's, #10).
        litres: The order quantity in whole litres.

    Returns:
        The rule and its version, or ``None`` when nothing matches (the quote
        becomes a manual quote, never a guessed price, FR-022).
    """
    version = await _current_version(session)
    if version is None:
        return None
    rules = await session.scalars(
        select(PriceRule).where(
            PriceRule.price_list_version_id == version.id,
            (PriceRule.zone_id == zone_id) | PriceRule.zone_id.is_(None),
            (PriceRule.water_category_id == water_category_id)
            | PriceRule.water_category_id.is_(None),
            PriceRule.min_litres <= litres,
            PriceRule.max_litres.is_(None) | (PriceRule.max_litres >= litres),
        )
    )
    candidates = sorted(
        rules,
        key=lambda rule: (rule.zone_id is None, rule.water_category_id is None, rule.position),
    )
    return RuleMatch(version, candidates[0]) if candidates else None


# --- Save -----------------------------------------------------------------------------


async def save_price_list(
    session: AsyncSession,
    *,
    actor: User,
    base_version: int | None,
    reason: str | None,
    rules: list[RuleInput],
) -> PriceListView:
    """Save a new version from the whole set of rules and audit it.

    Checks, in order: overlapping bands (422), unknown zones and categories
    (404), a stale ``base_version`` (409 ``price_list_changed``), and rules
    equal to the current version's (409 ``price_list_unchanged``). The new
    version takes effect at once (open question 16).

    Args:
        session: Database session; committed here.
        actor: The administrator.
        base_version: The version the administrator edited, or ``None`` for
            the first price list.
        reason: Optional reason, trimmed by the schema.
        rules: The whole new set, in order.

    Returns:
        The saved version.

    Raises:
        APIError: 404 ``service_zone_not_found`` or ``water_category_not_found``;
            409 ``price_list_changed`` (``details.current_version``) or
            ``price_list_unchanged``; 422 ``price_rules_overlap``.
    """
    _check_overlaps(rules)
    await _check_references(session, rules)
    current = await _current_version(session)
    current_number = current.version if current else None
    if base_version != current_number:
        raise _changed(current_number)

    new_rules = [_rule_dict(rule) for rule in rules]
    old_rules: list[dict[str, Any]] = []
    if current is not None:
        old_rules = [_rule_dict(rule) for rule in await _rules_of(session, current.id)]
        if old_rules == new_rules:
            raise APIError(
                HTTPStatus.CONFLICT,
                "price_list_unchanged",
                "These prices are the same as the current price list",
            )

    version = PriceListVersion(
        id=uuid.uuid4(),
        version=(current_number or 0) + 1,
        effective_from=datetime.now(UTC),
        created_by=actor.id,
        reason=reason,
        changes=_changes(old_rules, new_rules) if current is not None else [],
    )
    session.add(version)
    for position, rule in enumerate(rules):
        session.add(
            PriceRule(
                price_list_version_id=version.id,
                position=position,
                zone_id=rule.zone_id,
                water_category_id=rule.water_category_id,
                min_litres=rule.min_litres,
                max_litres=rule.max_litres,
                base_delivery_fee_minor_units=rule.base_delivery_fee_minor_units,
                distance_rate_minor_units_per_km=rule.distance_rate_minor_units_per_km,
                additional_trip_minor_units=rule.additional_trip_minor_units,
                handling_minor_units=rule.handling_minor_units,
                margin_type=rule.margin_type,
                margin_amount_minor_units=rule.margin_amount_minor_units,
                margin_basis_points=rule.margin_basis_points,
            )
        )
    audit.record(
        session,
        actor_id=actor.id,
        action="price_list_saved",
        target_type=AUDIT_TARGET_TYPE,
        target_id=version.id,
        details={"version": version.version, "rules": len(rules)},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        # The unique version: another administrator saved the same number first.
        await session.rollback()
        latest = await _current_version(session)
        raise _changed(latest.version if latest else None) from exc
    return (await _views(session, [version]))[0]


# --- Helpers --------------------------------------------------------------------------


async def _current_version(session: AsyncSession) -> PriceListVersion | None:
    return await session.scalar(
        select(PriceListVersion).order_by(PriceListVersion.version.desc()).limit(1)
    )


async def _rules_of(session: AsyncSession, version_id: uuid.UUID) -> list[PriceRule]:
    return list(
        await session.scalars(
            select(PriceRule)
            .where(PriceRule.price_list_version_id == version_id)
            .order_by(PriceRule.position)
        )
    )


async def _views(session: AsyncSession, versions: list[PriceListVersion]) -> list[PriceListView]:
    if not versions:
        return []
    ids = [version.id for version in versions]
    rules_by_version: dict[uuid.UUID, list[PriceRule]] = {version_id: [] for version_id in ids}
    for rule in await session.scalars(
        select(PriceRule)
        .where(PriceRule.price_list_version_id.in_(ids))
        .order_by(PriceRule.position)
    ):
        rules_by_version[rule.price_list_version_id].append(rule)
    # Names of the administrators who saved them (the contract's created_by).
    names = {
        user_id: name
        for user_id, name in await session.execute(
            select(User.id, User.name).where(User.id.in_({v.created_by for v in versions}))
        )
    }
    return [
        PriceListView(
            version=version,
            created_by=Person(version.created_by, names.get(version.created_by, "")),
            rules=rules_by_version[version.id],
        )
        for version in versions
    ]


def _band(rule: RuleInput) -> str:
    if rule.max_litres is None:
        return f"{rule.min_litres:,} litres and more"
    return f"{rule.min_litres:,} to {rule.max_litres:,} litres"


def _check_overlaps(rules: list[RuleInput]) -> None:
    """422 ``price_rules_overlap`` when two rules for one zone and category share litres."""
    details = []
    for later_index, later in enumerate(rules):
        for earlier_index, earlier in enumerate(rules[:later_index]):
            same_scope = (earlier.zone_id, earlier.water_category_id) == (
                later.zone_id,
                later.water_category_id,
            )
            # Two inclusive bands overlap unless one ends before the other starts.
            apart = (earlier.max_litres is not None and earlier.max_litres < later.min_litres) or (
                later.max_litres is not None and later.max_litres < earlier.min_litres
            )
            if same_scope and not apart:
                details.append(
                    {
                        "loc": ["body", "rules", later_index],
                        "msg": f"Overlaps rules[{earlier_index}] ({_band(earlier)})",
                        "type": "value_error",
                    }
                )
                break
    if details:
        raise APIError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "price_rules_overlap",
            "Two rules for the same zone and category cover the same quantities",
            details,
        )


async def _check_references(session: AsyncSession, rules: list[RuleInput]) -> None:
    """404 for a zone or category id that does not exist (inactive ones are allowed)."""
    zone_ids = {rule.zone_id for rule in rules if rule.zone_id is not None}
    if zone_ids:
        found = set(
            await session.scalars(select(ServiceZone.id).where(ServiceZone.id.in_(zone_ids)))
        )
        if found != zone_ids:
            raise APIError(HTTPStatus.NOT_FOUND, "service_zone_not_found", "Service zone not found")
    category_ids = {rule.water_category_id for rule in rules if rule.water_category_id is not None}
    if category_ids:
        known = {category.id for category in await sources.list_categories(session)}
        if not category_ids <= known:
            raise APIError(
                HTTPStatus.NOT_FOUND, "water_category_not_found", "Water category not found"
            )


def _changed(current_version: int | None) -> APIError:
    return APIError(
        HTTPStatus.CONFLICT,
        "price_list_changed",
        "Prices changed since you opened this page",
        {"current_version": current_version},
    )


def _rule_dict(rule: RuleInput | PriceRule) -> dict[str, Any]:
    """A rule as the contract writes it (JSON-ready), for comparing and diffing versions."""
    margin: dict[str, Any] = {"type": str(rule.margin_type)}
    if rule.margin_type == MarginType.FIXED:
        margin["amount_minor_units"] = rule.margin_amount_minor_units
    else:
        margin["basis_points"] = rule.margin_basis_points
    return {
        "zone_id": str(rule.zone_id) if rule.zone_id else None,
        "water_category_id": str(rule.water_category_id) if rule.water_category_id else None,
        "min_litres": rule.min_litres,
        "max_litres": rule.max_litres,
        "base_delivery_fee_minor_units": rule.base_delivery_fee_minor_units,
        "distance_rate_minor_units_per_km": rule.distance_rate_minor_units_per_km,
        "additional_trip_minor_units": rule.additional_trip_minor_units,
        "handling_minor_units": rule.handling_minor_units,
        "margin": margin,
    }


def _changes(old: list[dict[str, Any]], new: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The contract's ``changes``: per field of rules at the same position.

    An added rule is ``{"path": "rules[n]", "from": null, "to": rule}``, a
    removed one the reverse; ``margin`` is compared as a whole.
    """
    changes: list[dict[str, Any]] = []
    for index in range(max(len(old), len(new))):
        before = old[index] if index < len(old) else None
        after = new[index] if index < len(new) else None
        if before is None or after is None:
            changes.append({"path": f"rules[{index}]", "from": before, "to": after})
            continue
        for field, value in after.items():
            if before[field] != value:
                changes.append(
                    {"path": f"rules[{index}].{field}", "from": before[field], "to": value}
                )
    return changes
