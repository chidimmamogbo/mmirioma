"""Order business logic: idempotent creation, references and ownership.

Rules implemented here (docs/api/orders.md):

- **Verified phone first (FR-003, SRS v0.2):** a customer must verify their
  phone by SMS code before placing an order
  (:func:`ensure_customer_can_order`).
- **Creation (FR-020, FR-021, FR-027):** a customer's order request is stored
  in status ``quote_requested`` with no price, and an ``order_events`` row
  records the creation (NFR-004).
- **Idempotency (FR-026, NFR-011, T-06):** the client sends one idempotency key
  per checkout attempt. Repeating the key with the same details returns the
  existing order; repeating it with different details is rejected with 409
  ``idempotency_key_reused``. The unique constraint on
  ``(customer_id, idempotency_key)`` makes this hold under concurrent retries.
- **Ownership (FR-001, T-07):** customers read only their own orders. Another
  customer's reference raises the same 404 ``order_not_found`` as a reference
  that does not exist, so references cannot be probed. Staff (admins) read
  every order, with the ordering customer's account.

Callers pass already validated and normalized values (trimmed strings, E.164
phone). Validation belongs to the request schemas.
"""

import secrets
import uuid
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from http import HTTPStatus

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.modules.auth import service as auth_service
from app.modules.auth.models import User, UserRole
from app.modules.orders.models import Order, OrderEvent, OrderStatus, TransitionReason
from app.modules.orders.transitions import Actor, Requirement, check_transition
from app.shared.lagos_time import lagos_day_start_utc

# Crockford base32: digits and upper-case letters without I, L, O and U, so a
# reference read aloud or copied by hand is hard to get wrong.
REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
REFERENCE_PREFIX = "MO-"
REFERENCE_RANDOM_LENGTH = 10

# Inserts can fail on the unique reference (a 1-in-2^50 collision) or because a
# concurrent retry with the same idempotency key won. Both resolve on retry.
_MAX_CREATE_ATTEMPTS = 3


@dataclass(frozen=True)
class NewOrder:
    """Validated, normalized details of an order request (FR-020).

    Attributes:
        idempotency_key: Client-generated key for this checkout attempt.
        quantity_litres: Requested litres (the request schema enforces
            600-100000 and converts local gallons, FR-021).
        contact_name: Trimmed receiver name.
        contact_phone: Receiver's phone in E.164 form.
        delivery_address: Trimmed free-text address.
        landmark: Optional trimmed landmark.
        delivery_instructions: Optional trimmed instructions.
        preferred_delivery_date: Optional preferred date (Africa/Lagos).
    """

    idempotency_key: uuid.UUID
    quantity_litres: int
    contact_name: str
    contact_phone: str
    delivery_address: str
    landmark: str | None = None
    delivery_instructions: str | None = None
    preferred_delivery_date: date | None = None


def generate_order_reference() -> str:
    """Return a new random, public-safe order reference (FR-027).

    The reference is ``MO-`` plus 10 characters drawn from a cryptographic
    random source, about 50 bits. It is unrelated to the order ID and creation
    time, so it cannot be guessed from other references.

    Returns:
        A reference such as ``MO-7KQ2M9XH4T``.
    """
    random_part = "".join(
        secrets.choice(REFERENCE_ALPHABET) for _ in range(REFERENCE_RANDOM_LENGTH)
    )
    return REFERENCE_PREFIX + random_part


def ensure_customer_can_order(customer: User) -> None:
    """Refuse orders from customers whose phone is not verified (FR-003).

    SRS v0.2 requires SMS verification before the first order. Checking every
    order is equivalent: verification is kept, and a phone change verifies the
    new number before it takes effect (FR-004).

    Args:
        customer: The signed-in customer.

    Raises:
        APIError: 403 ``phone_not_verified``.
    """
    if customer.phone_verified_at is None:
        raise APIError(
            HTTPStatus.FORBIDDEN,
            "phone_not_verified",
            "Verify your phone number before placing your first order.",
        )


def _order_not_found() -> APIError:
    return APIError(HTTPStatus.NOT_FOUND, "order_not_found", "Order not found")


def _matches_request(order: Order, request: NewOrder) -> bool:
    """Whether a stored order was created from exactly these details."""
    return (
        order.quantity_litres == request.quantity_litres
        and order.contact_name == request.contact_name
        and order.contact_phone == request.contact_phone
        and order.delivery_address == request.delivery_address
        and order.landmark == request.landmark
        and order.delivery_instructions == request.delivery_instructions
        and order.preferred_delivery_date == request.preferred_delivery_date
    )


async def _find_by_idempotency_key(
    session: AsyncSession, customer_id: uuid.UUID, idempotency_key: uuid.UUID
) -> Order | None:
    return await session.scalar(
        select(Order).where(
            Order.customer_id == customer_id, Order.idempotency_key == idempotency_key
        )
    )


# Shown when an earlier send from the same request form was stored
# (docs/design/customer-ordering.md, Decision 9): the client keeps one key per
# form, so a 409 means the request already exists, not that it failed.
IDEMPOTENCY_KEY_REUSED_MESSAGE = (
    "This request was already received. Check your orders before sending it again."
)


def _replay(existing: Order, request: NewOrder) -> tuple[Order, bool]:
    """Resolve a repeated idempotency key (FR-026).

    Raises:
        APIError: 409 ``idempotency_key_reused`` if the details differ.
    """
    if not _matches_request(existing, request):
        raise APIError(
            HTTPStatus.CONFLICT,
            "idempotency_key_reused",
            IDEMPOTENCY_KEY_REUSED_MESSAGE,
        )
    return existing, False


async def create_order(
    session: AsyncSession,
    *,
    customer_id: uuid.UUID,
    request: NewOrder,
    is_simulated: bool = False,
) -> tuple[Order, bool]:
    """Create a customer's order request, or return the one already created.

    The order starts in ``quote_requested`` with no price (FR-021, FR-022:
    there are no agreed prices in Sprint 1). Its creation is recorded as an
    ``order_events`` row with the customer as actor (NFR-004). Commits.

    Idempotency (FR-026): the existing order for ``(customer_id,
    idempotency_key)`` is looked up first. If two requests with the same key
    race past that lookup, the database's unique constraint rejects the second
    insert, and the retry loop then finds and returns the winner's order.

    Args:
        session: Database session; committed or rolled back here.
        customer_id: The signed-in customer placing the order.
        request: Validated order details.
        is_simulated: Flag the order as demo data (BR-09). Set by the demo
            seed, and by ``POST /orders`` when a demo account places the
            order; never taken from the client.

    Returns:
        ``(order, created)``: ``created`` is False when an earlier submission
        with the same key and details is returned instead.

    Raises:
        APIError: 409 ``idempotency_key_reused`` if the key was already used
            with different details.
        IntegrityError: If inserting still fails after retries (for example the
            customer does not exist).
    """
    for attempt in range(_MAX_CREATE_ATTEMPTS):
        existing = await _find_by_idempotency_key(session, customer_id, request.idempotency_key)
        if existing is not None:
            return _replay(existing, request)

        order = Order(
            id=uuid.uuid4(),
            reference=generate_order_reference(),
            customer_id=customer_id,
            idempotency_key=request.idempotency_key,
            status=OrderStatus.QUOTE_REQUESTED,
            quantity_litres=request.quantity_litres,
            contact_name=request.contact_name,
            contact_phone=request.contact_phone,
            delivery_address=request.delivery_address,
            landmark=request.landmark,
            delivery_instructions=request.delivery_instructions,
            preferred_delivery_date=request.preferred_delivery_date,
            is_simulated=is_simulated,
        )
        event = OrderEvent(
            order_id=order.id,
            actor_id=customer_id,
            from_status=None,
            to_status=OrderStatus.QUOTE_REQUESTED,
        )
        session.add(order)
        # Flush the order before adding the event so the event's foreign key
        # is satisfied; the two are not linked by an ORM relationship.
        try:
            await session.flush()
            session.add(event)
            await session.commit()
        except IntegrityError:
            await session.rollback()
            if attempt == _MAX_CREATE_ATTEMPTS - 1:
                raise
            continue
        # Load server-generated columns (created_at, updated_at) now, because
        # lazy loading is not available on an AsyncSession.
        await session.refresh(order)
        return order, True
    raise AssertionError("unreachable")  # pragma: no cover


async def get_customer_order(
    session: AsyncSession, *, customer_id: uuid.UUID, reference: str
) -> Order:
    """Return one of the customer's own orders by reference (FR-001).

    Args:
        session: Database session.
        customer_id: The signed-in customer.
        reference: Public order reference.

    Returns:
        The order.

    Raises:
        APIError: 404 ``order_not_found`` if no such order exists **or** it
            belongs to another customer (T-07). The two cases are deliberately
            indistinguishable.
    """
    order = await session.scalar(
        select(Order).where(Order.reference == reference, Order.customer_id == customer_id)
    )
    if order is None:
        raise _order_not_found()
    return order


async def list_customer_orders(
    session: AsyncSession, *, customer_id: uuid.UUID, limit: int, offset: int
) -> tuple[list[Order], int]:
    """Return a page of the customer's own orders, newest first (FR-001).

    Args:
        session: Database session.
        customer_id: The signed-in customer.
        limit: Page size (the caller enforces 1-100).
        offset: Number of orders to skip.

    Returns:
        ``(orders, total)``: the page and the customer's total order count.
    """
    own_orders = Order.customer_id == customer_id
    total = await session.scalar(select(func.count()).select_from(Order).where(own_orders))
    orders = await session.scalars(
        select(Order)
        .where(own_orders)
        # id breaks ties between orders created in the same transaction time,
        # so pages never overlap or skip rows.
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(orders), total or 0


@dataclass(frozen=True)
class StaffOrder:
    """An order together with the account that placed it, for staff views.

    Attributes:
        order: The order.
        customer: The ordering customer's account.
    """

    order: Order
    customer: User


async def _with_customers(session: AsyncSession, orders: Sequence[Order]) -> list[StaffOrder]:
    # Accounts come from the auth module's service rather than a join on its
    # table, keeping modules independent (CLAUDE.md, "Architecture").
    customers = await auth_service.get_users_by_ids(
        session, {order.customer_id for order in orders}
    )
    # customer_id is a RESTRICT foreign key, so every customer exists.
    return [StaffOrder(order=order, customer=customers[order.customer_id]) for order in orders]


async def get_order_for_staff(session: AsyncSession, *, reference: str) -> StaffOrder:
    """Return any order by reference, with its customer (admin view).

    Staff may read every order; the caller enforces the admin role (FR-001).

    Args:
        session: Database session.
        reference: Public order reference.

    Returns:
        The order and its customer.

    Raises:
        APIError: 404 ``order_not_found`` if no order has this reference.
    """
    order = await session.scalar(select(Order).where(Order.reference == reference))
    if order is None:
        raise _order_not_found()
    return (await _with_customers(session, [order]))[0]


async def list_orders_for_staff(
    session: AsyncSession,
    *,
    statuses: Collection[OrderStatus],
    created_from: date | None,
    created_to: date | None,
    is_simulated: bool | None,
    limit: int,
    offset: int,
    extra_conditions: Sequence[ColumnElement[bool]] = (),
) -> tuple[list[StaffOrder], int]:
    """Return a filtered page of all orders, newest first (dispatcher queue, FR-030).

    Date filters are inclusive calendar dates in Africa/Lagos (docs/api/README.md):
    ``created_to`` includes the whole of that Lagos day, so the upper bound is
    the start of the next Lagos day, exclusive.

    Args:
        session: Database session.
        statuses: Statuses to include; empty for all.
        created_from: First Lagos creation date to include, or None.
        created_to: Last Lagos creation date to include, or None.
        is_simulated: True for demo records only, False for real orders only,
            None for both (BR-09).
        limit: Page size (the caller enforces 1-100).
        offset: Number of orders to skip.
        extra_conditions: More conditions on ``Order``, from a module that
            owns related records (the deliveries module's "on hold" filter).

    Returns:
        ``(orders, total)``: the page with customers, and the count of all
        orders matching the filters.
    """
    conditions: list[ColumnElement[bool]] = list(extra_conditions)
    if statuses:
        conditions.append(Order.status.in_(set(statuses)))
    if created_from is not None:
        conditions.append(Order.created_at >= lagos_day_start_utc(created_from))
    if created_to is not None:
        conditions.append(Order.created_at < lagos_day_start_utc(created_to + timedelta(days=1)))
    if is_simulated is not None:
        conditions.append(Order.is_simulated.is_(is_simulated))

    total = await session.scalar(select(func.count()).select_from(Order).where(*conditions))
    orders = await session.scalars(
        select(Order)
        .where(*conditions)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return await _with_customers(session, list(orders)), total or 0


async def lock_order(session: AsyncSession, order_id: uuid.UUID) -> Order:
    """Load an order and lock its row until the transaction ends.

    For other modules that must read an order and then change it in the same
    transaction (dispatch reads the quantity to check a driver's payload
    before assigning). Always lock the order before any other row, so
    concurrent requests take locks in the same order and cannot deadlock.

    Args:
        session: Database session; the caller commits or rolls back.
        order_id: The order.

    Returns:
        The locked order.

    Raises:
        APIError: 404 ``order_not_found``.
    """
    order = await session.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise _order_not_found()
    return order


_ACTOR_FOR_ROLE = {
    UserRole.CUSTOMER: Actor.CUSTOMER,
    UserRole.ADMIN: Actor.ADMIN,
    UserRole.DRIVER: Actor.DRIVER,
}


async def transition_order(
    session: AsyncSession,
    *,
    order_id: uuid.UUID,
    target: OrderStatus,
    actor: User | None,
    satisfied: Collection[Requirement] = (),
    reason_code: TransitionReason | None = None,
    note: str | None = None,
    assigned_driver_id: uuid.UUID | None = None,
    assignment_id: uuid.UUID | None = None,
    commit: bool = True,
    event_id: uuid.UUID | None = None,
    occurred_at: datetime | None = None,
) -> Order:
    """Move an order to ``target`` if the state machine allows it, and record it.

    The rules are in ``transitions.py`` (docs/api/deliveries.md). This
    function adds what the table cannot know:

    - **Ownership (FR-001, T-07).** A customer may act only on their own
      order and a driver only on an order assigned to them
      (``assigned_driver_id``, supplied by the assignments feature). Both
      otherwise get 404 ``order_not_found``, indistinguishable from a missing
      order.
    - **Serialization.** The order row is locked (``SELECT … FOR UPDATE``)
      while the transition is checked and applied, so concurrent requests
      (a driver accepting while the dispatcher withdraws) cannot both win.
    - **Harmless repeats.** If the order is already in ``target`` and its
      latest event is that same change by the same actor, the order is
      returned unchanged and no second event is written (a driver tapping
      "Arrived" twice on a slow connection).
    - **Audit (NFR-004).** Every applied transition writes an
      ``order_events`` row with actor, from and to status, reason code and
      note.

    ``satisfied`` must hold only requirements the calling feature has
    confirmed from its own records (for example a verified delivery code);
    the state machine trusts it, which is why no endpoint takes it from a
    client.

    Args:
        session: Database session; committed or rolled back here.
        order_id: The order.
        target: Requested status.
        actor: The signed-in user, or None for a system action.
        satisfied: Requirements already confirmed by the caller.
        reason_code: Reason, where the transition requires one.
        note: Optional free text; required with reason ``other``.
        assigned_driver_id: The order's assigned driver, when a driver acts.
        assignment_id: The assignment this change is about (dispatch rows
            8-11), stored on the event for the staff history. The row must
            already be flushed.
        commit: Commit here (default). Pass False when the caller writes its
            own rows in the same transaction (for example an assignment) and
            commits them together; the order row stays locked until then.
        event_id: Id for the new event, when the caller must reference it in
            its own rows (the confirmation's price snapshot). Default: new.
        occurred_at: The event's ``created_at``. Default: the database's
            transaction time. A caller writing two events in one transaction
            passes increasing times, so the history (newest first, ties by
            id) shows them in the order they happened.

    Returns:
        The order in its new (or unchanged, for a repeat) status.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``;
            403 ``forbidden``; 422 ``validation_error``; 409
            ``transition_requirements_unmet``.
    """
    order = await session.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise _order_not_found()
    kind = Actor.SYSTEM if actor is None else _ACTOR_FOR_ROLE[actor.role]
    if kind is Actor.CUSTOMER and actor is not None and order.customer_id != actor.id:
        raise _order_not_found()
    if kind is Actor.DRIVER and actor is not None and assigned_driver_id != actor.id:
        raise _order_not_found()

    actor_id = None if actor is None else actor.id
    if order.status is target:
        latest = await session.scalar(
            select(OrderEvent)
            .where(OrderEvent.order_id == order.id)
            .order_by(OrderEvent.created_at.desc(), OrderEvent.id.desc())
            .limit(1)
        )
        if latest is not None and latest.to_status is target and latest.actor_id == actor_id:
            if commit:
                await session.commit()  # release the row lock
            return order

    check_transition(
        source=order.status,
        target=target,
        actor=kind,
        satisfied=satisfied,
        reason_code=reason_code,
        note=note,
    )
    event = OrderEvent(
        order_id=order.id,
        actor_id=actor_id,
        from_status=order.status,
        to_status=target,
        reason_code=reason_code,
        note=note,
        assignment_id=assignment_id,
    )
    if event_id is not None:
        event.id = event_id
    if occurred_at is not None:
        event.created_at = occurred_at
    session.add(event)
    order.status = target
    if not commit:
        await session.flush()
        return order
    await session.commit()
    await session.refresh(order)
    return order


async def list_order_events(session: AsyncSession, order_id: uuid.UUID) -> list[OrderEvent]:
    """Return every event of an order, newest first (NFR-004; staff history H1).

    Events written in the same transaction share ``created_at`` (the
    database's transaction time), so ties are broken by ``id``; their
    relative order is then arbitrary. Each ``transition_order`` call writes
    one event, so only bulk writers such as the demo seed produce ties.

    Args:
        session: Database session.
        order_id: The order.

    Returns:
        The events, newest first; never empty for a stored order.
    """
    events = await session.scalars(
        select(OrderEvent)
        .where(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at.desc(), OrderEvent.id.desc())
    )
    return list(events)
