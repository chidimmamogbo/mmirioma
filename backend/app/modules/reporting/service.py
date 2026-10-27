"""Admin overview reads (docs/api/admin-operations.md): shell, settings,
dashboard, live map, activity and reports.

This module owns no table. It reads the other modules through their service
functions (CLAUDE.md, Architecture): orders for order counts and events,
dispatch for drivers and jobs, deliveries for holds and pickups, payments
for cash, sources for usable sources, pricing for zone names, customers for
support requests, notifications for the bell, and auth for the staff list.

Reports and the dashboard count real or simulated records, never both
(BR-09); see :mod:`app.modules.orders.reporting` for the counting rules.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.auth import service as auth_service
from app.modules.auth.models import User
from app.modules.customers import requests as support_requests
from app.modules.deliveries import holds
from app.modules.deliveries import service as deliveries_service
from app.modules.deliveries.codes import CODE_LIFETIME
from app.modules.dispatch import service as dispatch_service
from app.modules.notifications import service as notifications_service
from app.modules.orders import reporting as orders_reporting
from app.modules.orders.models import OrderStatus
from app.modules.payments import service as payments_service
from app.modules.pricing import service as pricing_service
from app.modules.sources import service as sources_service
from app.modules.sources.models import WaterSource
from app.shared.lagos_time import lagos_day_start_utc, lagos_today


@dataclass(frozen=True)
class ShellCounts:
    """The sidebar badges and the header bell (``GET /admin/shell``).

    Attributes:
        orders_needing_action: Orders to confirm or assign next (FR-030,
            FR-031), simulated ones included: staff act on them too.
        support_requests_open: Support requests still open.
        notifications_unread: This admin's unread notifications.
    """

    orders_needing_action: int
    support_requests_open: int
    notifications_unread: int


@dataclass(frozen=True)
class AdminSettings:
    """What the read-only Settings page shows (``GET /admin/settings``).

    Attributes:
        support_phone: The ``SUPPORT_PHONE`` setting (FR-055), E.164.
        whatsapp_enabled: The ``SUPPORT_WHATSAPP_ENABLED`` setting.
        delivery_code_validity_minutes: The server constant (FR-035: 10
            minutes, final).
        staff: Active administrators by name.
    """

    support_phone: str
    whatsapp_enabled: bool
    delivery_code_validity_minutes: int
    staff: list[auth_service.StaffMember]


async def shell_counts(session: AsyncSession, admin: User) -> ShellCounts:
    """Return the shell badges for the signed-in admin.

    Args:
        session: Database session.
        admin: The signed-in admin, whose unread notifications are counted.

    Returns:
        The counts.
    """
    return ShellCounts(
        orders_needing_action=await dispatch_service.count_orders_needing_action(session),
        support_requests_open=await support_requests.count_open_support_requests(session),
        notifications_unread=await notifications_service.unread_count(session, user_id=admin.id),
    )


async def admin_settings(session: AsyncSession) -> AdminSettings:
    """Return the settings and staff list; nothing here can be changed in the app.

    Changing any value is a configuration or command-line change by the
    technical lead (contract decision 4).

    Args:
        session: Database session.

    Returns:
        The settings.
    """
    settings = get_settings()
    return AdminSettings(
        support_phone=settings.support_phone,
        whatsapp_enabled=settings.support_whatsapp_enabled,
        delivery_code_validity_minutes=int(CODE_LIFETIME.total_seconds() // 60),
        staff=await auth_service.list_staff(session),
    )


# --- Part 2: dashboard, live map, activity, reports ------------------------------------

#: The report's ranges (the screen's pills) and how many Lagos days each covers,
#: ending today.
REPORT_RANGE_DAYS = {"today": 1, "7d": 7, "30d": 30}


@dataclass(frozen=True)
class Dashboard:
    """``GET /admin/dashboard`` for one Lagos date (FR-052).

    ``orders``, ``deliveries``, ``cash`` and ``oldest_waiting_minutes`` follow
    ``simulated`` (BR-09); ``holds_open``, ``support_requests_open``,
    ``drivers``, ``sources_usable`` and ``sources_not_usable`` are "now"
    values, the same for both.
    """

    day: date
    is_simulated: bool
    orders: orders_reporting.OrderCounts
    oldest_waiting_minutes: int | None
    deliveries: orders_reporting.DeliveryCounts
    holds_open: int
    support_requests_open: int
    drivers: dispatch_service.AvailableDrivers
    sources_usable: int
    sources_not_usable: int
    cash: payments_service.CashTotals


@dataclass(frozen=True)
class ZoneRow:
    """One ``by_zone`` row; ``zone_id`` and ``name`` are None for orders with no zone."""

    zone_id: uuid.UUID | None
    name: str | None
    orders: int
    delivered: int


@dataclass(frozen=True)
class SourceRow:
    """One ``by_source`` row: pickup records per source."""

    source_id: uuid.UUID
    name: str
    pickups: int


@dataclass(frozen=True)
class Report:
    """``GET /admin/reports`` over a range of Lagos days ending today (FR-052, FR-053)."""

    range: str
    from_day: date
    to_day: date
    is_simulated: bool
    orders: orders_reporting.OrderCounts
    deliveries: orders_reporting.DeliveryCounts
    cash: payments_service.CashTotals
    by_zone: list[ZoneRow]
    by_driver: list[dispatch_service.DriverDeliveries]
    by_source: list[SourceRow]


@dataclass(frozen=True)
class LiveMapDelivery:
    """A job on the road, placed by its source and zone (no GPS, FR-037)."""

    job: dispatch_service.LiveJob
    source_name: str | None
    zone_name: str | None


@dataclass(frozen=True)
class LiveMap:
    """``GET /admin/live-map``: jobs on the road and every source."""

    deliveries: list[LiveMapDelivery]
    sources: list[tuple[WaterSource, bool]]


@dataclass(frozen=True)
class ActivityItem:
    """One line of the dashboard's recent activity.

    Attributes:
        id: The order event's or the support request's id.
        at: When it happened.
        kind: ``order_status`` or ``support_request``.
        order_reference: The order, or None (a support request without one).
        to_status: For ``order_status``, the status the order moved to.
        actor: Staff or driver who did it; None for the system and customers.
        is_simulated: The order's flag; False without an order.
    """

    id: uuid.UUID
    at: datetime
    kind: Literal["order_status", "support_request"]
    order_reference: str | None
    to_status: OrderStatus | None
    actor: User | None
    is_simulated: bool


def _day_bounds(first: date, last: date) -> tuple[datetime, datetime]:
    """UTC instants of the start of ``first`` and the end of ``last`` (Lagos days)."""
    return lagos_day_start_utc(first), lagos_day_start_utc(last + timedelta(days=1))


async def dashboard(
    session: AsyncSession, *, day: date, simulated: bool, now: datetime | None = None
) -> Dashboard:
    """Return the dashboard numbers for a Lagos date.

    Args:
        session: Database session.
        day: The Lagos date (today or earlier, checked by the schema).
        simulated: Simulated records only (True) or real ones only (False).
        now: The current time, for ``oldest_waiting_minutes``; defaults to now.

    Returns:
        The dashboard.
    """
    now = now or datetime.now(UTC)
    start, end = _day_bounds(day, day)
    oldest = await dispatch_service.oldest_waiting_created_at(session, simulated=simulated)
    usability = await sources_service.source_usability(session, today=lagos_today())
    usable = sum(1 for _, ok in usability if ok)
    return Dashboard(
        day=day,
        is_simulated=simulated,
        orders=await orders_reporting.count_orders(
            session, created_from=start, created_to=end, simulated=simulated, include_open=True
        ),
        # Whole minutes, rounded down (contract, "Time ranges").
        oldest_waiting_minutes=(
            max(0, int((now - oldest).total_seconds() // 60)) if oldest is not None else None
        ),
        deliveries=await orders_reporting.count_deliveries(
            session, delivered_from=start, delivered_to=end, simulated=simulated
        ),
        holds_open=await holds.count_open_holds(session),
        support_requests_open=await support_requests.count_open_support_requests(session),
        drivers=await dispatch_service.available_drivers(session),
        sources_usable=usable,
        sources_not_usable=len(usability) - usable,
        cash=await payments_service.cash_totals(
            session, collected_from=start, collected_to=end, simulated=simulated
        ),
    )


async def report(session: AsyncSession, *, range_name: str, simulated: bool) -> Report:
    """Return the report for ``today``, the last 7 or the last 30 Lagos days.

    Rows hold aggregates, driver names and source names only, no customer
    data (FR-053), so the screen can build its CSV from them. Refunds, costs
    and contribution are not returned (F6, F7).

    ``by_zone[].delivered`` counts the zone's deliveries in the range (by
    delivery time, as ``deliveries.delivered``), so the rows add up to it.

    Args:
        session: Database session.
        range_name: ``today``, ``7d`` or ``30d`` (checked by the schema).
        simulated: Simulated records only (True) or real ones only (False).

    Returns:
        The report.
    """
    last = lagos_today()
    first = last - timedelta(days=REPORT_RANGE_DAYS[range_name] - 1)
    start, end = _day_bounds(first, last)
    orders = await orders_reporting.count_orders(
        session, created_from=start, created_to=end, simulated=simulated, include_open=False
    )
    deliveries = await orders_reporting.count_deliveries(
        session, delivered_from=start, delivered_to=end, simulated=simulated
    )
    zone_ids = set(orders.by_zone) | set(deliveries.by_zone)
    names = await pricing_service.zone_names(session, zone_ids)
    by_zone = sorted(
        (
            ZoneRow(
                zone_id=zone_id,
                name=names.get(zone_id) if zone_id is not None else None,
                orders=orders.by_zone.get(zone_id, 0),
                delivered=deliveries.by_zone.get(zone_id, 0),
            )
            for zone_id in zone_ids
        ),
        key=lambda row: (-row.orders, -row.delivered, row.zone_id is None, row.name or ""),
    )
    pickups = await deliveries_service.pickups_by_source(
        session, picked_up_from=start, picked_up_to=end, simulated=simulated
    )
    source_names = await sources_service.source_names(session, (sid for sid, _ in pickups))
    return Report(
        range=range_name,
        from_day=first,
        to_day=last,
        is_simulated=simulated,
        orders=orders,
        deliveries=deliveries,
        cash=await payments_service.cash_totals(
            session, collected_from=start, collected_to=end, simulated=simulated
        ),
        by_zone=by_zone,
        by_driver=await dispatch_service.deliveries_by_driver(session, deliveries.order_ids),
        by_source=[
            SourceRow(source_id=source_id, name=source_names[source_id], pickups=count)
            for source_id, count in pickups
            if source_id in source_names
        ],
    )


async def live_map(session: AsyncSession) -> LiveMap:
    """Return the jobs on the road and every source, with no GPS (FR-037).

    Args:
        session: Database session.

    Returns:
        The map data; no customer name, phone or address.
    """
    jobs = await dispatch_service.live_jobs(session)
    zones = await pricing_service.zone_names(session, (job.order.service_zone_id for job in jobs))
    sources = await sources_service.source_usability(session, today=lagos_today())
    names = {source.id: source.name for source, _ in sources}
    return LiveMap(
        deliveries=[
            LiveMapDelivery(
                job=job,
                source_name=names.get(job.order.source_id) if job.order.source_id else None,
                zone_name=(
                    zones.get(job.order.service_zone_id) if job.order.service_zone_id else None
                ),
            )
            for job in jobs
        ],
        sources=sources,
    )


async def activity(session: AsyncSession, *, limit: int) -> list[ActivityItem]:
    """Return the newest order status changes and support requests, newest first.

    Availability changes are not recorded as events, so the design's
    ``online`` lines are not created; staff actions are in the audit log.

    Args:
        session: Database session.
        limit: How many (1-20, checked by the schema).

    Returns:
        At most ``limit`` items.
    """
    events = await orders_reporting.recent_events(session, limit=limit)
    requests_ = await support_requests.recent_support_requests(session, limit=limit)
    items = [
        ActivityItem(
            id=view.event.id,
            at=view.event.created_at,
            kind="order_status",
            order_reference=view.order_reference,
            to_status=view.event.to_status,
            actor=view.actor,
            is_simulated=view.is_simulated,
        )
        for view in events
    ] + [
        ActivityItem(
            id=request.id,
            at=request.created_at,
            kind="support_request",
            order_reference=request.order_reference,
            to_status=None,
            actor=None,
            is_simulated=request.is_simulated,
        )
        for request in requests_
    ]
    items.sort(key=lambda item: (item.at, item.id), reverse=True)
    return items[:limit]
