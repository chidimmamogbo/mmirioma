"""Cash collection, remittance and reconciliation for the pilot (FR-041, cash part).

Contract: docs/api/payments.md (agreed G3, 2026-10-22); design:
docs/design/cash-remittance.md (approved G2). The pilot is pay on delivery
only (fallback F4), so cash is the only payment.

The custody steps, who may take them, and what each changes:

1. **Record** (driver, :func:`record_cash`): only the driver whose job
   unloaded the water, only after unloading (BR-15), never on a cancelled
   order, once per order. The amount due is the order's price snapshot
   (FR-024); the driver types only the cash received and never changes the
   amount due (FR-040, BR-13). A different amount, including ₦0 (decision
   4), needs the driver's note. Nothing changes on the order yet.
2. **Hand over** (that driver, :func:`hand_over`): ``collected`` →
   ``awaiting_remittance``. The driver still holds the cash (decision 3).
3. **Correct** (administrator, :func:`correct_amount`): before receipt only,
   with a reason; the driver's amount is kept (decision 6), because the
   payment status and the SMS are worked out from the recorded amount.
4. **Receive** (administrator, :func:`receive_cash`): ``remitted``. Sets
   each order's payment status from its recorded amount (decision 2, the
   table in the contract), keeps the counted difference on the remittance
   (decision 1), and after the commit sends the payment acknowledgment SMS
   for amounts above ₦0 (FR-041, FR-050). A refused SMS changes nothing.
5. **Reconcile** (administrator, :func:`reconcile`): ``reconciled``. The
   payment status does not change.

No step changes the order status (BR-12): an order can be ``delivered``
with payment ``pending_collection`` (T-24). Every step writes a
``cash_events`` row for the history and an ``audit_logs`` row (NFR-004)
in the same transaction; audit details hold ids, amounts and statuses only,
never names, phones or notes.

Handover deadline (FR-041, SRS §10): cash recorded before 18:00
Africa/Lagos is due at 18:00 that day; at or after 18:00, at 18:00 the next
day. Every day is an operating day. Overdue is a flag computed on read and
blocks nothing (decision 5).
"""

import logging
import uuid
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from http import HTTPStatus

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit import service as audit_service
from app.modules.auth import service as auth_service
from app.modules.auth.models import User, UserRole
from app.modules.confirmation.service import format_sms_naira
from app.modules.deliveries import service as deliveries_service
from app.modules.deliveries.service import DriverJob, JobAction
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import VehicleProfile
from app.modules.messaging.sms import SmsDeliveryError, SmsProvider, mask_phone
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderStatus, PaymentMethod, PaymentStatus
from app.modules.orders.transitions import Requirement
from app.modules.payments.models import (
    HELD_STATUSES,
    CashCollection,
    CashCollectionStatus,
    CashEvent,
    CashEventKind,
    CashRemittance,
    PaymentSmsStatus,
)
from app.modules.pricing.models import OrderPriceSnapshot
from app.shared.lagos_time import LAGOS_TZ, lagos_day_start_utc, lagos_today
from app.shared.phone import format_phone_for_display

logger = logging.getLogger(__name__)

#: FR-041: cash is handed to an administrator before 6:00 PM Lagos time.
HANDOVER_DEADLINE = time(18, 0)
#: How far back "My cash" lists handed-over cash (design K2; a display window).
HANDED_OVER_WINDOW = timedelta(days=7)


# --- Errors ---------------------------------------------------------------------------


def _order_not_found() -> APIError:
    # Same error as the driver job endpoints: another driver's job is 404 (T-07).
    return APIError(HTTPStatus.NOT_FOUND, "order_not_found", "Order not found")


def _driver_not_found() -> APIError:
    return APIError(HTTPStatus.NOT_FOUND, "driver_not_found", "Driver not found")


def _collection_not_found() -> APIError:
    return APIError(HTTPStatus.NOT_FOUND, "cash_collection_not_found", "Cash record not found")


def _collection_changed(collection_ids: Sequence[uuid.UUID]) -> APIError:
    return APIError(
        HTTPStatus.CONFLICT,
        "cash_collection_changed",
        "This cash record has changed. Refresh to see its current status.",
        details={"collection_ids": [str(collection_id) for collection_id in collection_ids]},
    )


def _already_recorded(amount_minor_units: int) -> APIError:
    return APIError(
        HTTPStatus.CONFLICT,
        "cash_already_recorded",
        "Cash for this order is already recorded.",
        details={"amount_minor_units": amount_minor_units},
    )


def _requirements_unmet(*missing: Requirement) -> APIError:
    # Same code and details as the state machine's error (orders/transitions.py).
    return APIError(
        HTTPStatus.CONFLICT,
        "transition_requirements_unmet",
        "This step needs more information before it can be recorded.",
        details={"missing": sorted(requirement.value for requirement in missing)},
    )


def _validation_error(loc: list[str | int], msg: str) -> APIError:
    # Same shape as request validation errors, for rules that need the database.
    return APIError(
        HTTPStatus.UNPROCESSABLE_CONTENT,
        "validation_error",
        "Request validation failed",
        details=[{"loc": loc, "msg": msg, "type": "value_error"}],
    )


# --- Pure rules (unit tested without a database) ---------------------------------------


def remittance_due_at(collected_at: datetime) -> datetime:
    """When cash recorded at ``collected_at`` must reach an administrator (FR-041).

    Before 18:00 Africa/Lagos: 18:00 the same Lagos day. At or after 18:00:
    18:00 the next day ("cash collected after 6:00 PM is remitted the next
    day"; 18:00 itself cannot be handed over *before* 18:00 that day).
    Every day counts; there are no closed days.

    Args:
        collected_at: Aware time the driver recorded the cash.

    Returns:
        The deadline, in UTC.
    """
    local = collected_at.astimezone(LAGOS_TZ)
    day = local.date() if local.time() < HANDOVER_DEADLINE else local.date() + timedelta(days=1)
    return datetime.combine(day, HANDOVER_DEADLINE, tzinfo=LAGOS_TZ).astimezone(UTC)


def is_overdue(collection: CashCollection, now: datetime) -> bool:
    """True while the driver still holds the cash and its deadline has passed."""
    return collection.status in HELD_STATUSES and now >= collection.remittance_due_at


@dataclass(frozen=True)
class PaymentOutcome:
    """The order's payment fields once its cash is received (contract table)."""

    status: PaymentStatus
    outstanding_balance_minor_units: int
    overpaid_minor_units: int


def payment_outcome(amount_minor_units: int, total_minor_units: int) -> PaymentOutcome:
    """Work out the payment status from the recorded cash and the amount due.

    The contract's "Payment status" table (FR-041): equal is ``paid``; less,
    including ₦0, is ``partially_paid`` with the rest outstanding (collected
    outside the app, F9); more is ``paid`` with the excess flagged for
    review (refunds outside the app, F7).

    Args:
        amount_minor_units: Recorded cash in kobo.
        total_minor_units: The order's price snapshot total in kobo.

    Returns:
        The status and the two balances, all integer kobo.
    """
    if amount_minor_units < total_minor_units:
        return PaymentOutcome(
            PaymentStatus.PARTIALLY_PAID, total_minor_units - amount_minor_units, 0
        )
    return PaymentOutcome(PaymentStatus.PAID, 0, amount_minor_units - total_minor_units)


def payment_message(
    *, reference: str, amount_minor_units: int, outstanding_minor_units: int
) -> str:
    """The payment acknowledgment SMS (FR-041, FR-050; wording in the contract).

    No water-quality or delivery wording; it carries the support number.
    "N" rather than "₦" keeps it a GSM-7 SMS (as the confirmation SMS).

    Args:
        reference: Public order reference.
        amount_minor_units: Cash received in kobo (above zero).
        outstanding_minor_units: Kobo still owed; 0 when nothing is.

    Returns:
        The text.
    """
    support = format_phone_for_display(get_settings().support_phone)
    text = (
        f"MmiriOma: we received {format_sms_naira(amount_minor_units)} cash for order {reference}."
    )
    if outstanding_minor_units > 0:
        text += f" {format_sms_naira(outstanding_minor_units)} is outstanding."
    return f"{text} Help: {support}"


def with_record_cash(actions: Sequence[JobAction], record_allowed: bool) -> list[JobAction]:
    """Add ``record_cash`` to a job's actions, before the problem report if there is one."""
    result = list(actions)
    if not record_allowed:
        return result
    if JobAction.REPORT_INCIDENT in result:
        result.insert(result.index(JobAction.REPORT_INCIDENT), JobAction.RECORD_CASH)
    else:
        result.append(JobAction.RECORD_CASH)
    return result


# --- Loading ----------------------------------------------------------------------------


@dataclass(frozen=True)
class CollectionView:
    """A collection with what the driver and admin views show about it.

    Attributes:
        collection: The row.
        order: Its order.
        amount_due_minor_units: The order's price snapshot total.
        overdue: See :func:`is_overdue`.
        driver: The driver who holds or held the cash.
        customer: The order's customer (admin views only).
        received_by: Administrator who received it.
        corrected_by: Administrator who last corrected it.
        reconciled_by: Administrator who reconciled it.
    """

    collection: CashCollection
    order: Order
    amount_due_minor_units: int
    overdue: bool
    driver: User | None
    customer: User | None
    received_by: User | None
    corrected_by: User | None
    reconciled_by: User | None


async def _snapshots(
    session: AsyncSession, order_ids: Collection[uuid.UUID]
) -> dict[uuid.UUID, OrderPriceSnapshot]:
    if not order_ids:
        return {}
    rows = await session.scalars(
        select(OrderPriceSnapshot).where(OrderPriceSnapshot.order_id.in_(set(order_ids)))
    )
    return {row.order_id: row for row in rows}


async def _views(
    session: AsyncSession, collections: Sequence[CashCollection], now: datetime
) -> list[CollectionView]:
    """Build views for many collections in a few queries, in the given order."""
    if not collections:
        return []
    order_ids = {collection.order_id for collection in collections}
    orders = {
        order.id: order
        for order in await session.scalars(select(Order).where(Order.id.in_(order_ids)))
    }
    snapshots = await _snapshots(session, order_ids)
    user_ids: set[uuid.UUID] = {order.customer_id for order in orders.values()}
    for collection in collections:
        user_ids.update(
            user_id
            for user_id in (
                collection.driver_id,
                collection.received_by,
                collection.corrected_by,
                collection.reconciled_by,
            )
            if user_id is not None
        )
    users = await auth_service.get_users_by_ids(session, user_ids)

    def user(user_id: uuid.UUID | None) -> User | None:
        return None if user_id is None else users.get(user_id)

    views = []
    for collection in collections:
        order = orders[collection.order_id]
        snapshot = snapshots.get(order.id)
        views.append(
            CollectionView(
                collection=collection,
                order=order,
                # Recording needs a snapshot, so every collection has one.
                amount_due_minor_units=snapshot.total_minor_units if snapshot else 0,
                overdue=is_overdue(collection, now),
                driver=user(collection.driver_id),
                customer=users.get(order.customer_id),
                received_by=user(collection.received_by),
                corrected_by=user(collection.corrected_by),
                reconciled_by=user(collection.reconciled_by),
            )
        )
    return views


async def _view(session: AsyncSession, collection: CashCollection, now: datetime) -> CollectionView:
    return (await _views(session, [collection], now))[0]


def _event(
    session: AsyncSession,
    collection: CashCollection,
    *,
    kind: CashEventKind,
    actor: User,
    now: datetime,
    note: str | None = None,
    previous_amount_minor_units: int | None = None,
    payment: PaymentOutcome | None = None,
) -> None:
    session.add(
        CashEvent(
            collection_id=collection.id,
            order_id=collection.order_id,
            kind=kind,
            actor_id=actor.id,
            occurred_at=now,
            amount_minor_units=collection.amount_minor_units,
            previous_amount_minor_units=previous_amount_minor_units,
            note=note,
            payment_status=None if payment is None else payment.status,
            outstanding_balance_minor_units=(
                None if payment is None else payment.outstanding_balance_minor_units
            ),
        )
    )


def _audit(
    session: AsyncSession, actor: User, action: str, collection: CashCollection, **details: object
) -> None:
    # Ids, amounts and statuses only; never names, phones or notes (NFR-004).
    audit_service.record(
        session,
        actor_id=actor.id,
        action=action,
        target_type="cash_collection",
        target_id=collection.id,
        details={
            "order_id": str(collection.order_id),
            "amount_minor_units": collection.amount_minor_units,
            "status": collection.status.value,
            **details,
        },
    )


# --- Driver: the job's Cash card (K1) --------------------------------------------------


@dataclass(frozen=True)
class JobCash:
    """The ``cash`` object on a driver job.

    Attributes:
        amount_due_minor_units: The order's price snapshot total.
        manual: The snapshot is a manual quote (``amount_due_label``).
        collection: The order's collection, once recorded.
        record_allowed: True while cash can be recorded (``record_cash``).
    """

    amount_due_minor_units: int
    manual: bool
    collection: CollectionView | None
    record_allowed: bool


async def cash_for_jobs(
    session: AsyncSession, jobs: Sequence[DriverJob], *, now: datetime | None = None
) -> dict[uuid.UUID, JobCash]:
    """The Cash card for each job that unloaded water, keyed by order id.

    A job gets one only once its unloading is recorded complete (BR-15), on
    an order that is not cancelled and has a price snapshot. Jobs without one
    show ``cash: null`` (no Cash card: the job ended before unloading).

    Args:
        session: Database session.
        jobs: The driver's jobs, as the deliveries module built them.
        now: Current time, for the overdue flag.

    Returns:
        Order id to :class:`JobCash`, only for jobs that have one.
    """
    now = now or datetime.now(UTC)
    unloaded = [
        job
        for job in jobs
        if job.unloading_completed_at is not None and job.order.status is not OrderStatus.CANCELLED
    ]
    if not unloaded:
        return {}
    order_ids = {job.order.id for job in unloaded}
    snapshots = await _snapshots(session, order_ids)
    collections = list(
        await session.scalars(select(CashCollection).where(CashCollection.order_id.in_(order_ids)))
    )
    views = {view.order.id: view for view in await _views(session, collections, now)}
    result = {}
    for job in unloaded:
        snapshot = snapshots.get(job.order.id)
        if snapshot is None:
            continue
        view = views.get(job.order.id)
        result[job.order.id] = JobCash(
            amount_due_minor_units=snapshot.total_minor_units,
            manual=snapshot.is_manual,
            collection=view,
            record_allowed=view is None,
        )
    return result


async def record_cash(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    amount_minor_units: int,
    note: str | None,
    now: datetime | None = None,
) -> tuple[CollectionView, bool]:
    """Record the cash the driver received after unloading (K1). Commits.

    Args:
        session: Database session; the caller enforces the driver role and CSRF.
        driver: The signed-in driver.
        reference: Public order reference.
        amount_minor_units: Kobo received, whole naira, 0 or more (the schema
            checks the format).
        note: The driver's note; required when the amount differs from the
            amount due.
        now: Current time, for tests.

    Returns:
        The collection and True when it was created now; False for a repeat
        of the same amount and note (a lost response retried, NFR-011).

    Raises:
        APIError: 404 ``order_not_found`` (unknown, or not this driver's job);
            409 ``cash_already_recorded``; 409 ``transition_requirements_unmet``
            (``unloading_completed``, ``price_recorded``); 422 ``validation_error``
            (note missing).
    """
    now = now or datetime.now(UTC)
    staff = await orders_service.get_order_for_staff(session, reference=reference)
    order = await orders_service.lock_order(session, staff.order.id)
    job = await deliveries_service.drivers_job_on_order(
        session, order_id=order.id, driver_id=driver.id
    )
    if job is None:
        await session.rollback()
        raise _order_not_found()

    existing = await session.scalar(
        select(CashCollection).where(CashCollection.order_id == order.id)
    )
    if existing is not None:
        drivers_amount = (
            existing.original_amount_minor_units
            if existing.original_amount_minor_units is not None
            else existing.amount_minor_units
        )
        if (
            existing.driver_id == driver.id
            and drivers_amount == amount_minor_units
            and existing.note == note
        ):
            view = await _view(session, existing, now)
            # Nothing changed. Commit, not roll back, to release the order lock:
            # a rollback would expire the rows the view holds (LOG.md, 2026-10-22).
            await session.commit()
            return view, False
        # Read before the rollback, which expires every loaded object.
        recorded = existing.amount_minor_units
        await session.rollback()
        raise _already_recorded(recorded)

    if job.unloading_completed_at is None or order.status is OrderStatus.CANCELLED:
        await session.rollback()
        raise _requirements_unmet(Requirement.UNLOADING_COMPLETED)
    snapshot = (await _snapshots(session, [order.id])).get(order.id)
    if snapshot is None:
        await session.rollback()
        raise _requirements_unmet(Requirement.PRICE_RECORDED)
    if amount_minor_units != snapshot.total_minor_units and not note:
        await session.rollback()
        raise _validation_error(
            ["body", "note"], "Add a note: the amount is different from the amount due"
        )

    collection = CashCollection(
        order_id=order.id,
        driver_id=driver.id,
        assignment_id=job.assignment_id,
        amount_minor_units=amount_minor_units,
        note=note,
        status=CashCollectionStatus.COLLECTED,
        collected_at=now,
        remittance_due_at=remittance_due_at(now),
    )
    session.add(collection)
    await session.flush()
    _event(session, collection, kind=CashEventKind.CASH_RECORDED, actor=driver, now=now, note=note)
    _audit(session, driver, "cash_recorded", collection)
    await session.commit()
    return await _view(session, collection, now), True


# --- Driver: My cash and handover (K2) -------------------------------------------------


@dataclass(frozen=True)
class DriverCash:
    """Body of ``GET /driver/cash``.

    Attributes:
        on_hand_minor_units: Kobo the driver holds (collected and ready).
        ready_minor_units: The part listed for a handover.
        remittance_due_at: Earliest deadline of the cash on hand.
        overdue: True if any cash on hand is overdue.
        collections: Held cash, then cash received or reconciled in the last
            7 days; newest first.
    """

    on_hand_minor_units: int
    ready_minor_units: int
    remittance_due_at: datetime | None
    overdue: bool
    collections: list[CollectionView]


async def driver_cash(
    session: AsyncSession, *, driver_id: uuid.UUID, now: datetime | None = None
) -> DriverCash:
    """The driver's cash for K2.

    Args:
        session: Database session.
        driver_id: The signed-in driver.
        now: Current time, for tests.

    Returns:
        Totals and the collections.
    """
    now = now or datetime.now(UTC)
    since = now - HANDED_OVER_WINDOW
    collections = list(
        await session.scalars(
            select(CashCollection)
            .where(
                CashCollection.driver_id == driver_id,
                or_(
                    CashCollection.status.in_(HELD_STATUSES),
                    CashCollection.remitted_at >= since,
                    CashCollection.reconciled_at >= since,
                ),
            )
            .order_by(CashCollection.collected_at.desc(), CashCollection.id)
        )
    )
    held = [collection for collection in collections if collection.status in HELD_STATUSES]
    return DriverCash(
        on_hand_minor_units=sum(collection.amount_minor_units for collection in held),
        ready_minor_units=sum(
            collection.amount_minor_units
            for collection in held
            if collection.status is CashCollectionStatus.AWAITING_REMITTANCE
        ),
        remittance_due_at=min((collection.remittance_due_at for collection in held), default=None),
        overdue=any(is_overdue(collection, now) for collection in held),
        collections=await _views(session, collections, now),
    )


async def _lock_collections(
    session: AsyncSession, collection_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, CashCollection]:
    rows = await session.scalars(
        select(CashCollection)
        .where(CashCollection.id.in_(set(collection_ids)))
        .order_by(CashCollection.id)
        .with_for_update()
    )
    return {row.id: row for row in rows}


async def hand_over(
    session: AsyncSession,
    *,
    driver: User,
    collection_ids: Sequence[uuid.UUID],
    now: datetime | None = None,
) -> DriverCash:
    """List the driver's chosen records for a handover (decision 3). Commits.

    Each must be this driver's and ``collected``; otherwise nothing changes.
    No money moves and no SMS is sent.

    Args:
        session: Database session; the caller enforces the driver role and CSRF.
        driver: The signed-in driver.
        collection_ids: 1-50 distinct ids (the schema checks it).
        now: Current time, for tests.

    Returns:
        The driver's cash after the change.

    Raises:
        APIError: 409 ``cash_collection_changed`` with the ids that cannot move.
    """
    now = now or datetime.now(UTC)
    rows = await _lock_collections(session, collection_ids)
    bad = [
        collection_id
        for collection_id in collection_ids
        if (row := rows.get(collection_id)) is None
        or row.driver_id != driver.id
        or row.status is not CashCollectionStatus.COLLECTED
    ]
    if bad:
        await session.rollback()
        raise _collection_changed(bad)
    for collection_id in collection_ids:
        collection = rows[collection_id]
        collection.status = CashCollectionStatus.AWAITING_REMITTANCE
        collection.handed_over_at = now
        _event(session, collection, kind=CashEventKind.CASH_HANDED_OVER, actor=driver, now=now)
        _audit(session, driver, "cash_handed_over", collection)
    await session.commit()
    return await driver_cash(session, driver_id=driver.id, now=now)


# --- Admin: the cash page (K3) and a driver's cash (K4) -------------------------------


@dataclass(frozen=True)
class DriverCashRow:
    """One driver on the cash page."""

    driver: User
    vehicle: VehicleProfile | None
    held_minor_units: int
    ready_minor_units: int
    remittance_due_at: datetime | None
    overdue: bool
    last_received_at: datetime | None


@dataclass(frozen=True)
class CashDay:
    """Body of ``GET /admin/cash`` for one Lagos operating day."""

    day: date
    recorded_minor_units: int
    received_minor_units: int
    reconciled_minor_units: int
    with_drivers_minor_units: int
    differences: int
    drivers: list[DriverCashRow]
    awaiting_reconciliation: list[CollectionView]


def _within(moment: datetime | None, start: datetime, end: datetime) -> bool:
    return moment is not None and start <= moment < end


async def cash_day(
    session: AsyncSession, *, day: date | None = None, now: datetime | None = None
) -> CashDay:
    """The cash page for one Lagos day (K3).

    Totals by the day's ``collected_at``, ``remitted_at`` and
    ``reconciled_at``; "still with drivers" and the driver rows include cash
    on hand from any day; overdue drivers first, then by name.

    Args:
        session: Database session; the caller enforces the admin role.
        day: Lagos date (default: today).
        now: Current time, for tests.

    Returns:
        The day.
    """
    now = now or datetime.now(UTC)
    day = day or lagos_today()
    start = lagos_day_start_utc(day)
    end = lagos_day_start_utc(day + timedelta(days=1))
    collections = list(
        await session.scalars(
            select(CashCollection).where(
                or_(
                    CashCollection.status.in_(HELD_STATUSES),
                    CashCollection.status == CashCollectionStatus.REMITTED,
                    CashCollection.collected_at.between(start, end),
                    CashCollection.remitted_at.between(start, end),
                    CashCollection.reconciled_at.between(start, end),
                )
            )
        )
    )
    differences = len(
        list(
            await session.scalars(
                select(CashRemittance.id).where(
                    CashRemittance.remitted_at >= start,
                    CashRemittance.remitted_at < end,
                    CashRemittance.difference_minor_units != 0,
                )
            )
        )
    )
    driver_ids = {
        collection.driver_id
        for collection in collections
        if collection.status in HELD_STATUSES or _within(collection.collected_at, start, end)
    }
    drivers = await auth_service.get_users_by_ids(session, driver_ids)
    vehicles = await dispatch_service.vehicles_by_driver(session, driver_ids)
    last_received: dict[uuid.UUID, datetime] = {}
    for remitted_at, driver_id in (
        await session.execute(
            select(CashRemittance.remitted_at, CashRemittance.driver_id).where(
                CashRemittance.driver_id.in_(driver_ids)
            )
        )
    ).all():
        if driver_id not in last_received or remitted_at > last_received[driver_id]:
            last_received[driver_id] = remitted_at

    rows = []
    for driver_id in driver_ids:
        held = [
            collection
            for collection in collections
            if collection.driver_id == driver_id and collection.status in HELD_STATUSES
        ]
        driver = drivers.get(driver_id)
        if driver is None:
            continue
        rows.append(
            DriverCashRow(
                driver=driver,
                vehicle=vehicles.get(driver_id),
                held_minor_units=sum(collection.amount_minor_units for collection in held),
                ready_minor_units=sum(
                    collection.amount_minor_units
                    for collection in held
                    if collection.status is CashCollectionStatus.AWAITING_REMITTANCE
                ),
                remittance_due_at=min(
                    (collection.remittance_due_at for collection in held), default=None
                ),
                overdue=any(is_overdue(collection, now) for collection in held),
                last_received_at=last_received.get(driver_id),
            )
        )
    rows.sort(key=lambda row: (not row.overdue, row.driver.name.casefold(), str(row.driver.id)))
    to_reconcile = sorted(
        (c for c in collections if c.status is CashCollectionStatus.REMITTED),
        key=lambda collection: (collection.remitted_at, str(collection.id)),
    )
    return CashDay(
        day=day,
        recorded_minor_units=sum(
            c.amount_minor_units for c in collections if _within(c.collected_at, start, end)
        ),
        received_minor_units=sum(
            c.amount_minor_units for c in collections if _within(c.remitted_at, start, end)
        ),
        reconciled_minor_units=sum(
            c.amount_minor_units for c in collections if _within(c.reconciled_at, start, end)
        ),
        with_drivers_minor_units=sum(
            c.amount_minor_units for c in collections if c.status in HELD_STATUSES
        ),
        differences=differences,
        drivers=rows,
        awaiting_reconciliation=await _views(session, to_reconcile, now),
    )


async def _driver(session: AsyncSession, driver_id: uuid.UUID) -> User:
    driver = (await auth_service.get_users_by_ids(session, {driver_id})).get(driver_id)
    if driver is None or driver.role is not UserRole.DRIVER:
        raise _driver_not_found()
    return driver


async def cash_with_driver(
    session: AsyncSession, *, driver_id: uuid.UUID, now: datetime | None = None
) -> tuple[User, list[CollectionView]]:
    """A driver's cash on hand, for K4.

    Args:
        session: Database session; the caller enforces the admin role.
        driver_id: The driver (``users.id``).
        now: Current time, for tests.

    Returns:
        The driver and their ``collected`` and ``awaiting_remittance`` records,
        oldest first.

    Raises:
        APIError: 404 ``driver_not_found``.
    """
    now = now or datetime.now(UTC)
    driver = await _driver(session, driver_id)
    collections = list(
        await session.scalars(
            select(CashCollection)
            .where(CashCollection.driver_id == driver_id, CashCollection.status.in_(HELD_STATUSES))
            .order_by(CashCollection.collected_at, CashCollection.id)
        )
    )
    return driver, await _views(session, collections, now)


# --- Admin: correct, receive, reconcile (K4, K5) ---------------------------------------


async def correct_amount(
    session: AsyncSession,
    *,
    admin: User,
    collection_id: uuid.UUID,
    amount_minor_units: int,
    reason: str,
    now: datetime | None = None,
) -> CollectionView:
    """Correct a recorded amount before the cash is received (decision 6). Commits.

    The first correction keeps the driver's amount; the status and the
    driver's note do not change.

    Args:
        session: Database session; the caller enforces the admin role and CSRF.
        admin: The administrator.
        collection_id: The collection.
        amount_minor_units: The right amount in kobo (the schema checks the format).
        reason: Why (required by the schema).
        now: Current time, for tests.

    Returns:
        The corrected collection.

    Raises:
        APIError: 404 ``cash_collection_not_found``; 409
            ``cash_collection_changed`` once received; 422 ``validation_error``
            for the same amount as now.
    """
    now = now or datetime.now(UTC)
    collection = (await _lock_collections(session, [collection_id])).get(collection_id)
    if collection is None:
        await session.rollback()
        raise _collection_not_found()
    if collection.status not in HELD_STATUSES:
        await session.rollback()
        raise _collection_changed([collection_id])
    previous = collection.amount_minor_units
    if amount_minor_units == previous:
        await session.rollback()
        raise _validation_error(
            ["body", "amount_minor_units"], "This is already the recorded amount"
        )
    if collection.original_amount_minor_units is None:
        collection.original_amount_minor_units = previous
    collection.amount_minor_units = amount_minor_units
    collection.corrected_by = admin.id
    collection.corrected_at = now
    collection.correction_reason = reason
    _event(
        session,
        collection,
        kind=CashEventKind.CASH_CORRECTED,
        actor=admin,
        now=now,
        note=reason,
        previous_amount_minor_units=previous,
    )
    _audit(session, admin, "cash_corrected", collection, previous_amount_minor_units=previous)
    await session.commit()
    return await _view(session, collection, now)


@dataclass(frozen=True)
class ReceivedOrder:
    """One order in a remittance response."""

    reference: str
    payment_status: PaymentStatus
    outstanding_balance_minor_units: int
    overpaid_minor_units: int
    sms_status: PaymentSmsStatus | None


@dataclass(frozen=True)
class RemittanceResult:
    """Body of ``POST /admin/cash-remittances``."""

    remittance: CashRemittance
    driver: User
    received_by: User
    orders: list[ReceivedOrder]


async def receive_cash(
    session: AsyncSession,
    *,
    admin: User,
    driver_id: uuid.UUID,
    collection_ids: Sequence[uuid.UUID],
    counted_minor_units: int,
    note: str | None,
    sms: SmsProvider,
    now: datetime | None = None,
) -> RemittanceResult:
    """Receive cash from one driver (K4). Commits, then sends the payment SMS.

    In one transaction: each collection becomes ``remitted``; each order's
    payment status is set from its recorded amount (:func:`payment_outcome`);
    a ``cash_remittances`` row keeps the recorded and counted totals and the
    difference (decision 1). After the commit each customer whose recorded
    amount is above ₦0 is sent the payment acknowledgment; its outcome is
    stored and a refusal changes nothing (FR-050).

    Orders are locked first, then the collections (the lock order every
    module follows, ``orders_service.lock_order``).

    Args:
        session: Database session; the caller enforces the admin role and CSRF.
        admin: The administrator receiving the cash.
        driver_id: The driver handing it over.
        collection_ids: 1-50 distinct ids (the schema checks it).
        counted_minor_units: Kobo counted (the schema checks the format).
        note: Required when the counted amount differs from the recorded total.
        sms: Provider for the payment SMS.
        now: Current time, for tests.

    Returns:
        The remittance and each order's payment outcome and SMS status.

    Raises:
        APIError: 404 ``driver_not_found``; 409 ``cash_collection_changed``;
            422 ``validation_error`` (note missing).
    """
    now = now or datetime.now(UTC)
    driver = await _driver(session, driver_id)
    found = list(
        await session.scalars(
            select(CashCollection.order_id).where(CashCollection.id.in_(set(collection_ids)))
        )
    )
    orders = {
        order_id: await orders_service.lock_order(session, order_id)
        for order_id in sorted(set(found))
    }
    rows = await _lock_collections(session, collection_ids)
    bad = [
        collection_id
        for collection_id in collection_ids
        if (row := rows.get(collection_id)) is None
        or row.driver_id != driver.id
        or row.status not in HELD_STATUSES
    ]
    if bad:
        await session.rollback()
        raise _collection_changed(bad)
    collections = [rows[collection_id] for collection_id in collection_ids]
    recorded = sum(collection.amount_minor_units for collection in collections)
    difference = counted_minor_units - recorded
    if difference != 0 and not note:
        await session.rollback()
        raise _validation_error(
            ["body", "note"], "Add a note: the counted amount is different from the recorded total"
        )

    snapshots = await _snapshots(session, orders.keys())
    remittance = CashRemittance(
        driver_id=driver.id,
        recorded_minor_units=recorded,
        counted_minor_units=counted_minor_units,
        difference_minor_units=difference,
        note=note,
        received_by=admin.id,
        remitted_at=now,
    )
    session.add(remittance)
    await session.flush()
    outcomes: dict[uuid.UUID, PaymentOutcome] = {}
    for collection in collections:
        order = orders[collection.order_id]
        outcome = payment_outcome(
            collection.amount_minor_units, snapshots[order.id].total_minor_units
        )
        outcomes[collection.id] = outcome
        order.payment_method = order.payment_method or PaymentMethod.PAY_ON_DELIVERY
        order.payment_status = outcome.status
        order.outstanding_balance_minor_units = outcome.outstanding_balance_minor_units
        order.overpaid_minor_units = outcome.overpaid_minor_units
        collection.status = CashCollectionStatus.REMITTED
        collection.remittance_id = remittance.id
        collection.remitted_at = now
        collection.received_by = admin.id
        _event(
            session,
            collection,
            kind=CashEventKind.CASH_RECEIVED,
            actor=admin,
            now=now,
            note=note,
            payment=outcome,
        )
        _audit(
            session,
            admin,
            "cash_received",
            collection,
            remittance_id=str(remittance.id),
            payment_status=outcome.status.value,
        )
    audit_service.record(
        session,
        actor_id=admin.id,
        action="cash_remittance_recorded",
        target_type="cash_remittance",
        target_id=remittance.id,
        details={
            "driver_id": str(driver.id),
            "recorded_minor_units": recorded,
            "counted_minor_units": counted_minor_units,
            "difference_minor_units": difference,
        },
    )
    await session.commit()

    customers = await auth_service.get_users_by_ids(
        session, {order.customer_id for order in orders.values()}
    )
    for collection in collections:
        if collection.amount_minor_units == 0:
            continue  # Nothing was received, so there is nothing to acknowledge.
        order = orders[collection.order_id]
        customer = customers.get(order.customer_id)
        if customer is None:
            continue
        text = payment_message(
            reference=order.reference,
            amount_minor_units=collection.amount_minor_units,
            outstanding_minor_units=outcomes[collection.id].outstanding_balance_minor_units,
        )
        try:
            await sms.send(phone=customer.phone, text=text)
            collection.payment_sms_status = PaymentSmsStatus.ACCEPTED
        except SmsDeliveryError as error:
            logger.warning(
                "Payment SMS for %s to %s not accepted: %s",
                order.reference,
                mask_phone(customer.phone),
                error,
            )
            collection.payment_sms_status = PaymentSmsStatus.FAILED
        collection.payment_sms_attempted_at = now
    await session.commit()

    return RemittanceResult(
        remittance=remittance,
        driver=driver,
        received_by=admin,
        orders=[
            ReceivedOrder(
                reference=orders[collection.order_id].reference,
                payment_status=outcomes[collection.id].status,
                outstanding_balance_minor_units=outcomes[
                    collection.id
                ].outstanding_balance_minor_units,
                overpaid_minor_units=outcomes[collection.id].overpaid_minor_units,
                sms_status=collection.payment_sms_status,
            )
            for collection in collections
        ],
    )


async def reconcile(
    session: AsyncSession,
    *,
    admin: User,
    collection_ids: Sequence[uuid.UUID],
    note: str | None,
    now: datetime | None = None,
) -> list[CollectionView]:
    """Mark received collections reconciled (K5). Commits.

    The payment status was set at receipt and does not change here
    (decision 2). The same administrator may receive and reconcile
    (decision 7).

    Args:
        session: Database session; the caller enforces the admin role and CSRF.
        admin: The administrator.
        collection_ids: 1-50 distinct ids (the schema checks it).
        note: Optional reconciliation note.
        now: Current time, for tests.

    Returns:
        The reconciled collections, in the request's order.

    Raises:
        APIError: 409 ``cash_collection_changed`` for any id not ``remitted``.
    """
    now = now or datetime.now(UTC)
    rows = await _lock_collections(session, collection_ids)
    bad = [
        collection_id
        for collection_id in collection_ids
        if (row := rows.get(collection_id)) is None
        or row.status is not CashCollectionStatus.REMITTED
    ]
    if bad:
        await session.rollback()
        raise _collection_changed(bad)
    collections = [rows[collection_id] for collection_id in collection_ids]
    for collection in collections:
        collection.status = CashCollectionStatus.RECONCILED
        collection.reconciled_at = now
        collection.reconciled_by = admin.id
        collection.reconciliation_note = note
        _event(
            session, collection, kind=CashEventKind.CASH_RECONCILED, actor=admin, now=now, note=note
        )
        _audit(session, admin, "cash_reconciled", collection)
    await session.commit()
    return await _views(session, collections, now)


# --- Admin order detail and history (K6, H1) -------------------------------------------


@dataclass(frozen=True)
class PaymentView:
    """``AdminOrderDetail.payment``: null before the order is confirmed.

    Attributes:
        order: The order (method, status and balances are on it).
        collection: Its cash collection, once recorded.
        remittance: The handover that received it, when that handover had a
            counted difference (``remittance_difference``).
    """

    order: Order
    collection: CollectionView | None
    remittance: CashRemittance | None


async def payment_view(
    session: AsyncSession, order: Order, *, now: datetime | None = None
) -> PaymentView | None:
    """The payment card for the admin order detail (K6).

    Args:
        session: Database session.
        order: The order.
        now: Current time, for the overdue flag.

    Returns:
        None while the order has no payment status (not confirmed yet).
    """
    if order.payment_status is None:
        return None
    now = now or datetime.now(UTC)
    collection = await session.scalar(
        select(CashCollection).where(CashCollection.order_id == order.id)
    )
    remittance = None
    if collection is not None and collection.remittance_id is not None:
        found = await session.get(CashRemittance, collection.remittance_id)
        if found is not None and found.difference_minor_units != 0:
            remittance = found
    return PaymentView(
        order=order,
        collection=None if collection is None else await _view(session, collection, now),
        remittance=remittance,
    )


@dataclass(frozen=True)
class CashHistoryEntry:
    """A cash step in the order history (``include=holds``).

    Attributes:
        event: The step.
        actor: Who took it.
        sms_status: The payment SMS outcome, on ``cash_received`` only.
    """

    event: CashEvent
    actor: User | None
    sms_status: PaymentSmsStatus | None


async def cash_history(session: AsyncSession, order_id: uuid.UUID) -> list[CashHistoryEntry]:
    """The order's cash steps, newest first.

    Args:
        session: Database session.
        order_id: The order.

    Returns:
        The entries; empty when no cash was recorded.
    """
    events = list(
        await session.scalars(
            select(CashEvent)
            .where(CashEvent.order_id == order_id)
            .order_by(CashEvent.occurred_at.desc(), CashEvent.created_at.desc())
        )
    )
    if not events:
        return []
    users = await auth_service.get_users_by_ids(session, {event.actor_id for event in events})
    collection = await session.scalar(
        select(CashCollection).where(CashCollection.order_id == order_id)
    )
    sms_status = None if collection is None else collection.payment_sms_status
    return [
        CashHistoryEntry(
            event=event,
            actor=users.get(event.actor_id),
            sms_status=sms_status if event.kind is CashEventKind.CASH_RECEIVED else None,
        )
        for event in events
    ]
