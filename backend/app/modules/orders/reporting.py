"""Order counts for the admin dashboard, reports and activity (FR-052, BR-09).

docs/api/admin-operations.md, "Simulated data", "Time ranges",
``GET /admin/dashboard``, ``GET /admin/reports`` and ``GET /admin/activity``.
Other modules read orders and their events through these functions, never
the tables (CLAUDE.md, Architecture).

Rules implemented here:

- **Simulated or real, never mixed** (BR-09): every count takes
  ``simulated`` and counts only orders whose ``is_simulated`` equals it.
  Activity is an operational list, not a report, so it shows every event
  with its flag.
- **Days are Lagos days.** Callers pass UTC instants from
  :func:`app.shared.lagos_time.lagos_day_start_utc`; an order belongs to a
  day by its ``created_at``, a delivery by the time of its ``delivered``
  event.
- **On time** (FR-052): delivered at or before the confirmed window's end.
  An order without a window is never on time.
- **Delivery type and zone** come from the order (#21). Orders without
  them (created before #21, or the area was not listed) are counted as
  ``not_recorded`` or the no-zone row, never guessed.
"""

import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import service as auth_service
from app.modules.auth.models import User, UserRole
from app.modules.orders.models import DeliveryType, Order, OrderEvent, OrderStatus

#: Statuses after which an order is no longer open (the dashboard's
#: "including open orders").
CLOSED_STATUSES = frozenset({OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.FAILED})

#: The ``by_delivery_type`` key for orders created before #21.
NOT_RECORDED = "not_recorded"


@dataclass(frozen=True)
class OrderCounts:
    """Orders counted by status, delivery type and zone.

    Attributes:
        total: Every counted order.
        by_status: Count per backend status; statuses with none are absent.
        by_delivery_type: ``keke``, ``tanker`` and ``not_recorded``, always
            all three.
        by_zone: Count per ``service_zone_id``; ``None`` for no zone.
    """

    total: int
    by_status: dict[str, int]
    by_delivery_type: dict[str, int]
    by_zone: dict[uuid.UUID | None, int]


@dataclass(frozen=True)
class DeliveryCounts:
    """Orders delivered in a time range.

    Attributes:
        order_ids: The delivered orders, for per-driver counts.
        delivered: How many.
        with_window: Of those, the ones with a confirmed delivery window.
        on_time: Of those, the ones delivered at or before the window's end.
        by_zone: Deliveries per ``service_zone_id``; ``None`` for no zone.
    """

    order_ids: list[uuid.UUID]
    delivered: int
    with_window: int
    on_time: int
    by_zone: dict[uuid.UUID | None, int]


@dataclass(frozen=True)
class EventView:
    """One order status change for the activity list.

    Attributes:
        event: The order event.
        order_reference: The order's public reference.
        is_simulated: The order's flag.
        actor: Staff or driver who made the change; None for the system and
            for customers, so no customer name reaches the dashboard.
    """

    event: OrderEvent
    order_reference: str
    is_simulated: bool
    actor: User | None


async def count_orders(
    session: AsyncSession,
    *,
    created_from: datetime,
    created_to: datetime,
    simulated: bool,
    include_open: bool,
) -> OrderCounts:
    """Count the orders created in ``[created_from, created_to)``.

    Args:
        session: Database session.
        created_from: First instant, inclusive (UTC).
        created_to: Last instant, exclusive (UTC).
        simulated: Count simulated orders only (True) or real ones only (False).
        include_open: Also count older orders that are still open (not
            delivered, cancelled or failed): the dashboard's "Orders today,
            including open orders".

    Returns:
        The counts.
    """
    in_range = (Order.created_at >= created_from) & (Order.created_at < created_to)
    condition: ColumnElement[bool] = in_range
    if include_open:
        still_open = (Order.created_at < created_from) & Order.status.not_in(CLOSED_STATUSES)
        condition = or_(in_range, still_open)
    rows = (
        await session.execute(
            select(Order.status, Order.delivery_type, Order.service_zone_id, func.count())
            .where(condition, Order.is_simulated.is_(simulated))
            .group_by(Order.status, Order.delivery_type, Order.service_zone_id)
        )
    ).all()
    by_status: Counter[str] = Counter()
    by_type: Counter[str] = Counter({t.value: 0 for t in DeliveryType} | {NOT_RECORDED: 0})
    by_zone: Counter[uuid.UUID | None] = Counter()
    for status, delivery_type, zone_id, count in rows:
        by_status[status.value] += count
        by_type[delivery_type.value if delivery_type is not None else NOT_RECORDED] += count
        by_zone[zone_id] += count
    return OrderCounts(
        total=sum(by_status.values()),
        by_status=dict(by_status),
        by_delivery_type=dict(by_type),
        by_zone=dict(by_zone),
    )


async def count_deliveries(
    session: AsyncSession, *, delivered_from: datetime, delivered_to: datetime, simulated: bool
) -> DeliveryCounts:
    """Count the orders delivered in ``[delivered_from, delivered_to)``.

    The delivery time is the order's first ``delivered`` event, so an order
    disputed after delivery still counts once, on its delivery day.

    Args:
        session: Database session.
        delivered_from: First instant, inclusive (UTC).
        delivered_to: Last instant, exclusive (UTC).
        simulated: Simulated orders only (True) or real ones only (False).

    Returns:
        The counts.
    """
    delivered_at = (
        select(OrderEvent.order_id, func.min(OrderEvent.created_at).label("at"))
        .where(OrderEvent.to_status == OrderStatus.DELIVERED)
        .group_by(OrderEvent.order_id)
        .subquery()
    )
    rows = (
        await session.execute(
            select(
                Order.id,
                Order.service_zone_id,
                Order.delivery_window_end_at,
                delivered_at.c.at,
            )
            .join(delivered_at, delivered_at.c.order_id == Order.id)
            .where(
                delivered_at.c.at >= delivered_from,
                delivered_at.c.at < delivered_to,
                Order.is_simulated.is_(simulated),
            )
        )
    ).all()
    by_zone: Counter[uuid.UUID | None] = Counter(zone_id for _, zone_id, _, _ in rows)
    with_window = [(end, at) for _, _, end, at in rows if end is not None]
    return DeliveryCounts(
        order_ids=[order_id for order_id, _, _, _ in rows],
        delivered=len(rows),
        with_window=len(with_window),
        on_time=sum(1 for end, at in with_window if at <= end),
        by_zone=dict(by_zone),
    )


async def recent_events(session: AsyncSession, *, limit: int) -> list[EventView]:
    """Return the newest order status changes, newest first, for the activity list.

    Every order is included with its ``is_simulated`` flag: the list is
    operational, so staff can still act on a demo order.

    Args:
        session: Database session.
        limit: How many (1-20, checked by the router).

    Returns:
        The events.
    """
    rows = (
        await session.execute(
            select(OrderEvent, Order.reference, Order.is_simulated)
            .join(Order, Order.id == OrderEvent.order_id)
            .order_by(OrderEvent.created_at.desc(), OrderEvent.id.desc())
            .limit(limit)
        )
    ).all()
    actors = await auth_service.get_users_by_ids(
        session, {event.actor_id for event, _, _ in rows if event.actor_id is not None}
    )

    def staff_or_driver(actor_id: uuid.UUID | None) -> User | None:
        actor = actors.get(actor_id) if actor_id is not None else None
        return actor if actor is not None and actor.role is not UserRole.CUSTOMER else None

    return [
        EventView(
            event=event,
            order_reference=reference,
            is_simulated=is_simulated,
            actor=staff_or_driver(event.actor_id),
        )
        for event, reference, is_simulated in rows
    ]
