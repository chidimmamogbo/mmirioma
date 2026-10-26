"""Service zones, their delivery fees, and the zone delivery cost (#30).

Contract: docs/api/admin-directory.md, "Service zones" (agreed 2026-10-26,
PR #38 and PR #41). Feature doc: docs/features/service-zones.md.

Business rules (FR-010, FR-020, FR-022):

- Administrators configure zones: name (unique ignoring case), active flag,
  a centre point, an optional boundary, and one delivery fee per water
  category. Zones are never deleted; they are switched off.
- Customers pick their zone from the active ones (FR-020, contract
  "Which zone an address is in"). The server never derives a zone from
  address text and never geocodes.
- Until road distance exists (OSRM is open, SRS §12.1), the delivery cost
  of a quote is the picked zone's fee for the quote's category, once per
  order (:func:`delivery_cost_from_zone`). No zone, an inactive zone or a
  missing fee gives a reason for a manual quote, never an estimate ("No
  fabricated route estimates", FR-022).

Every write records an audit row in the same transaction (NFR-004), with
ids and field names only.
"""

import json
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from http import HTTPStatus

from geoalchemy2 import Geometry, WKTElement
from sqlalchemy import cast, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.modules.audit import service as audit
from app.modules.auth.models import User
from app.modules.pricing.models import ServiceZone, ServiceZoneDeliveryFee
from app.modules.sources import service as sources

AUDIT_TARGET_TYPE = "service_zone"

#: A GeoJSON position: ``(longitude, latitude)``, the order GeoJSON and
#: PostGIS use.
Position = tuple[float, float]


@dataclass(frozen=True)
class Coordinates:
    """A WGS 84 point (SRID 4326) in decimal degrees."""

    latitude: float
    longitude: float


@dataclass(frozen=True)
class FeeInput:
    """One delivery fee to store: the category and the fee in kobo."""

    water_category_id: uuid.UUID
    fee_minor_units: int


@dataclass(frozen=True)
class ZoneData:
    """Every field of a zone, as an administrator writes it.

    Attributes:
        name: Trimmed name.
        is_active: Whether new orders may use the zone.
        centre: The zone's coordinates.
        boundary: The outer ring of the boundary polygon, closed (first and
            last positions equal), or ``None`` for no boundary.
        fees: The whole fee list; each category at most once.
    """

    name: str
    is_active: bool
    centre: Coordinates
    boundary: list[Position] | None
    fees: list[FeeInput]


@dataclass(frozen=True)
class ZoneUpdate:
    """A partial change (``PATCH``): only the fields named in ``sent`` apply.

    A field in ``sent`` with ``boundary=None`` clears the boundary; a sent
    ``fees`` list replaces the whole list (``[]`` removes every fee).
    """

    sent: frozenset[str]
    name: str | None = None
    is_active: bool | None = None
    centre: Coordinates | None = None
    boundary: list[Position] | None = None
    fees: list[FeeInput] | None = None


@dataclass(frozen=True)
class ZoneFee:
    """A stored fee with its category's current label (FR-014)."""

    water_category_id: uuid.UUID
    water_category_label: str
    fee_minor_units: int


@dataclass(frozen=True)
class ZoneView:
    """A zone as the admin endpoints return it."""

    zone: ServiceZone
    centre: Coordinates
    boundary: list[Position] | None
    fees: list[ZoneFee]


class ZoneCostUnavailable(StrEnum):
    """Why a zone gives no delivery cost; the quote becomes a manual quote.

    The values are the ``manual_quote_required`` reasons of
    docs/api/order-details-and-price.md that a zone decides.
    """

    #: No zone was picked, or the zone is switched off (FR-010, T-02).
    OUTSIDE_SERVICE_ZONE = "outside_service_zone"
    #: The zone has no fee for the category (FR-022, T-18).
    DELIVERY_COST_UNAVAILABLE = "delivery_cost_unavailable"


@dataclass(frozen=True)
class ZoneDeliveryCost:
    """The delivery cost a zone gives, or why it gives none.

    Exactly one of the two fields is set.

    Attributes:
        fee_minor_units: The delivery cost in kobo, charged once per order.
        unavailable: The manual-quote reason when there is no cost.
    """

    fee_minor_units: int | None
    unavailable: ZoneCostUnavailable | None


# --- Reads ----------------------------------------------------------------------------


async def list_zones(session: AsyncSession) -> list[ZoneView]:
    """Return every zone, active or not, by name, with its fees.

    Args:
        session: Database session.

    Returns:
        The zones with their coordinates, boundary and fees.
    """
    return await _zone_views(session, None)


async def list_active_zones(session: AsyncSession) -> list[ServiceZone]:
    """Return the zones a customer or partner can pick (FR-020), by name.

    Args:
        session: Database session.

    Returns:
        Active zones only. Callers expose ``id`` and ``name`` only.
    """
    rows = await session.scalars(
        select(ServiceZone)
        .where(ServiceZone.is_active.is_(True))
        .order_by(func.lower(ServiceZone.name), ServiceZone.id)
    )
    return list(rows)


async def delivery_cost_from_zone(
    session: AsyncSession, *, zone_id: uuid.UUID | None, water_category_id: uuid.UUID
) -> ZoneDeliveryCost:
    """Return the delivery cost for an order in a zone, or why there is none.

    FR-022: when road distance is unavailable (always, until OSRM exists,
    SRS §12.1), the delivery cost falls back to the zone's configured rate,
    or the order becomes a manual quote. Decided for #30: one fee per zone
    and water category, charged **once per order** whatever the number of
    trips. Handling and margin are not part of it; the quote adds them.

    Outcomes (contract, "Delivery cost from the zone"):

    - active zone with a fee for the category: that fee;
    - active zone without one: ``delivery_cost_unavailable``;
    - no zone (the customer's area is not listed) or an inactive zone:
      ``outside_service_zone`` (FR-010, T-02).

    Never another zone's fee or an estimate.

    Args:
        session: Database session.
        zone_id: The zone the customer picked, or ``None`` when their area is
            not listed.
        water_category_id: The quote's water category.

    Returns:
        The fee, or the manual-quote reason.

    Raises:
        APIError: 404 ``service_zone_not_found`` for an unknown zone id.
    """
    if zone_id is None:
        return ZoneDeliveryCost(None, ZoneCostUnavailable.OUTSIDE_SERVICE_ZONE)
    zone = await session.get(ServiceZone, zone_id)
    if zone is None:
        raise _zone_not_found()
    if not zone.is_active:
        return ZoneDeliveryCost(None, ZoneCostUnavailable.OUTSIDE_SERVICE_ZONE)
    fee = await session.scalar(
        select(ServiceZoneDeliveryFee.fee_minor_units).where(
            ServiceZoneDeliveryFee.zone_id == zone_id,
            ServiceZoneDeliveryFee.water_category_id == water_category_id,
        )
    )
    if fee is None:
        return ZoneDeliveryCost(None, ZoneCostUnavailable.DELIVERY_COST_UNAVAILABLE)
    return ZoneDeliveryCost(fee, None)


async def zone_names(
    session: AsyncSession, zone_ids: Iterable[uuid.UUID | None]
) -> dict[uuid.UUID, str]:
    """Return the current name of each zone, for the order views (``service_zone``).

    Other modules show a zone's ``{id, name}`` through this function rather
    than reading the zones table themselves.

    Args:
        session: Database session.
        zone_ids: Zone ids; ``None`` entries are skipped.

    Returns:
        Name by id, for the zones that exist.
    """
    ids = {zone_id for zone_id in zone_ids if zone_id is not None}
    if not ids:
        return {}
    rows = await session.execute(
        select(ServiceZone.id, ServiceZone.name).where(ServiceZone.id.in_(ids))
    )
    return {zone_id: name for zone_id, name in rows}


async def ensure_zone_exists(session: AsyncSession, zone_id: uuid.UUID) -> None:
    """Refuse an unknown zone id sent by a client; an inactive zone is accepted.

    Raises:
        APIError: 404 ``service_zone_not_found``.
    """
    if await session.get(ServiceZone, zone_id) is None:
        raise _zone_not_found()


# --- Writes ---------------------------------------------------------------------------


async def create_zone(session: AsyncSession, *, actor: User, data: ZoneData) -> ZoneView:
    """Create a zone with its fees and audit it (``service_zone_created``).

    Args:
        session: Database session; committed here.
        actor: The administrator.
        data: The new zone.

    Returns:
        The stored zone.

    Raises:
        APIError: 404 ``water_category_not_found``; 409
            ``service_zone_name_taken``; 422 ``validation_error`` for a
            boundary that is not a valid polygon.
    """
    await _check_categories(session, data.fees)
    await _check_boundary(session, data.boundary)
    await _check_name_free(session, data.name, None)
    # The id is set here, not at flush, so nothing is written before
    # _commit, which turns a concurrent name clash into a 409.
    zone = ServiceZone(
        id=uuid.uuid4(),
        name=data.name,
        is_active=data.is_active,
        centre=_point(data.centre),
        boundary=_polygon(data.boundary),
    )
    session.add(zone)
    _add_fees(session, zone.id, data.fees)
    audit.record(
        session,
        actor_id=actor.id,
        action="service_zone_created",
        target_type=AUDIT_TARGET_TYPE,
        target_id=zone.id,
        details={"water_category_ids": [str(fee.water_category_id) for fee in data.fees]},
    )
    await _commit(session)
    return await _zone_view(session, zone.id)


async def update_zone(
    session: AsyncSession, *, actor: User, zone_id: uuid.UUID, update: ZoneUpdate
) -> ZoneView:
    """Apply a partial change to a zone and audit it (``service_zone_updated``).

    An empty change returns the zone unchanged and records nothing.
    Switching a zone off never changes existing orders (FR-024).

    Args:
        session: Database session; committed here.
        actor: The administrator.
        zone_id: The zone.
        update: The fields sent and their values.

    Returns:
        The stored zone.

    Raises:
        APIError: 404 ``service_zone_not_found`` or
            ``water_category_not_found``; 409 ``service_zone_name_taken``;
            422 ``validation_error`` for an invalid boundary.
    """
    zone = await session.get(ServiceZone, zone_id, with_for_update=True)
    if zone is None:
        raise _zone_not_found()
    if not update.sent:
        await session.rollback()
        return await _zone_view(session, zone_id)

    if "fees" in update.sent:
        await _check_categories(session, update.fees or [])
    if "boundary" in update.sent:
        await _check_boundary(session, update.boundary)
    if "name" in update.sent and update.name is not None:
        await _check_name_free(session, update.name, zone_id)
        zone.name = update.name
    if "is_active" in update.sent and update.is_active is not None:
        zone.is_active = update.is_active
    if "centre" in update.sent and update.centre is not None:
        zone.centre = _point(update.centre)
    if "boundary" in update.sent:
        zone.boundary = _polygon(update.boundary)
    if "fees" in update.sent:
        await session.execute(
            delete(ServiceZoneDeliveryFee).where(ServiceZoneDeliveryFee.zone_id == zone_id)
        )
        _add_fees(session, zone_id, update.fees or [])
    # A fee-only change leaves the zone row as it was, so the ORM would not
    # refresh updated_at; the zone's "last changed" covers its fees too.
    zone.updated_at = func.now()
    audit.record(
        session,
        actor_id=actor.id,
        action="service_zone_updated",
        target_type=AUDIT_TARGET_TYPE,
        target_id=zone_id,
        details={"fields": sorted(update.sent)},
    )
    await _commit(session)
    return await _zone_view(session, zone_id)


# --- Helpers --------------------------------------------------------------------------


async def _zone_views(session: AsyncSession, zone_id: uuid.UUID | None) -> list[ZoneView]:
    # Geography has no ST_X/ST_Y; a geometry cast reads the stored values
    # (as in deliveries.holds). ST_AsGeoJSON returns the boundary as text.
    centre = cast(ServiceZone.centre, Geometry)
    query = (
        select(
            ServiceZone,
            func.ST_Y(centre),
            func.ST_X(centre),
            func.ST_AsGeoJSON(cast(ServiceZone.boundary, Geometry)),
        )
        .order_by(func.lower(ServiceZone.name), ServiceZone.id)
        .execution_options(populate_existing=True)
    )
    if zone_id is not None:
        query = query.where(ServiceZone.id == zone_id)
    rows = (await session.execute(query)).all()

    fees_by_zone: dict[uuid.UUID, list[ServiceZoneDeliveryFee]] = {}
    fee_query = select(ServiceZoneDeliveryFee)
    if zone_id is not None:
        fee_query = fee_query.where(ServiceZoneDeliveryFee.zone_id == zone_id)
    for fee in await session.scalars(fee_query):
        fees_by_zone.setdefault(fee.zone_id, []).append(fee)
    # Labels come through the sources module's service (module boundary).
    labels = {category.id: category.label for category in await sources.list_categories(session)}

    views = []
    for zone, latitude, longitude, boundary_json in rows:
        fees = sorted(
            (
                ZoneFee(fee.water_category_id, labels[fee.water_category_id], fee.fee_minor_units)
                for fee in fees_by_zone.get(zone.id, [])
            ),
            key=lambda fee: fee.water_category_label,
        )
        views.append(
            ZoneView(
                zone=zone,
                centre=Coordinates(latitude=float(latitude), longitude=float(longitude)),
                boundary=_ring_from_geojson(boundary_json),
                fees=fees,
            )
        )
    return views


async def _zone_view(session: AsyncSession, zone_id: uuid.UUID) -> ZoneView:
    views = await _zone_views(session, zone_id)
    if not views:
        raise _zone_not_found()
    return views[0]


def _ring_from_geojson(text: str | None) -> list[Position] | None:
    if text is None:
        return None
    outer_ring = json.loads(text)["coordinates"][0]
    return [(float(longitude), float(latitude)) for longitude, latitude in outer_ring]


def _point(centre: Coordinates) -> WKTElement:
    # PostGIS writes points as longitude, then latitude.
    return WKTElement(f"POINT({centre.longitude!r} {centre.latitude!r})", srid=4326)


def _polygon(ring: list[Position] | None) -> WKTElement | None:
    if ring is None:
        return None
    return WKTElement(_polygon_wkt(ring), srid=4326)


def _polygon_wkt(ring: list[Position]) -> str:
    positions = ", ".join(f"{longitude!r} {latitude!r}" for longitude, latitude in ring)
    return f"POLYGON(({positions}))"


def _add_fees(session: AsyncSession, zone_id: uuid.UUID, fees: list[FeeInput]) -> None:
    for fee in fees:
        session.add(
            ServiceZoneDeliveryFee(
                zone_id=zone_id,
                water_category_id=fee.water_category_id,
                fee_minor_units=fee.fee_minor_units,
            )
        )


async def _check_categories(session: AsyncSession, fees: list[FeeInput]) -> None:
    """404 ``water_category_not_found`` when a fee names an unknown category.

    An inactive category may have a fee: whether a category is offered is
    checked when the quote is made (FR-014), not here.
    """
    if not fees:
        return
    known = {category.id for category in await sources.list_categories(session)}
    if any(fee.water_category_id not in known for fee in fees):
        await session.rollback()
        raise APIError(HTTPStatus.NOT_FOUND, "water_category_not_found", "Water category not found")


async def _check_boundary(session: AsyncSession, ring: list[Position] | None) -> None:
    """422 when the ring is closed and long enough but not a valid polygon.

    The request schema checks the shape (closed, at least 4 positions, valid
    ranges); PostGIS checks the rest, e.g. a ring that crosses itself.
    """
    if ring is None:
        return
    valid = await session.scalar(select(func.ST_IsValid(func.ST_GeomFromText(_polygon_wkt(ring)))))
    if not valid:
        await session.rollback()
        raise APIError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "validation_error",
            "Request validation failed",
            [
                {
                    "loc": ["body", "boundary"],
                    "msg": "The boundary is not a valid polygon (its edges may cross)",
                    "type": "value_error",
                }
            ],
        )


async def _check_name_free(session: AsyncSession, name: str, zone_id: uuid.UUID | None) -> None:
    """409 when another zone has the name, ignoring case.

    A friendly early answer; the unique index on ``lower(name)`` is what
    guarantees it under concurrent requests (see :func:`_commit`).
    """
    query = select(ServiceZone.id).where(func.lower(ServiceZone.name) == name.lower())
    if zone_id is not None:
        query = query.where(ServiceZone.id != zone_id)
    if await session.scalar(query) is not None:
        await session.rollback()
        raise _name_taken()


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError as exc:
        # Categories are checked and listed once each (schema), so the only
        # constraint a checked request can still hit is the name index, when
        # a concurrent request took the name first.
        await session.rollback()
        raise _name_taken() from exc


def _zone_not_found() -> APIError:
    return APIError(HTTPStatus.NOT_FOUND, "service_zone_not_found", "Service zone not found")


def _name_taken() -> APIError:
    return APIError(
        HTTPStatus.CONFLICT,
        "service_zone_name_taken",
        "A service zone with this name already exists",
    )
