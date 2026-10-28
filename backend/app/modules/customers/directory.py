"""The admin customer directory: list, detail and saved addresses for staff.

Source: docs/api/admin-directory.md, "Customers" (agreed, G3, #43; SRS FR-001,
FR-002, FR-003, FR-020, NFR-003, NFR-004, BR-09). Staff see names, phones and
addresses; every endpoint is admin only (the router uses ``CurrentAdmin``).

Staff do not create customer accounts (decided 2026-10-26): customers
register themselves, so there is no create here. Staff can add a saved
address to an existing customer, which writes the same ``customer_addresses``
table as the customer's own ``/me/addresses`` (customer-account.md).

Order figures come from :mod:`app.modules.orders.service`, which owns the
orders; this module never reads the orders table itself.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from http import HTTPStatus

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.modules.audit import service as audit_service
from app.modules.auth.models import User, UserRole
from app.modules.customers.models import CustomerAddress
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order
from app.modules.pricing import service as pricing_service
from app.modules.pricing.models import ServiceZone

#: The window of "ordered in the last 7 days" (open question 4, decided: 7 x 24 hours).
ORDERED_WINDOW = timedelta(days=7)
#: How many of the newest orders the detail lists.
RECENT_ORDERS = 5
#: Digits needed before ``q`` is also matched against phones.
PHONE_SEARCH_MIN_DIGITS = 4
AUDIT_TARGET_TYPE = "customer_address"
#: ``+234`` is replaced by ``0`` to give the local form of a Nigerian number.
_E164_PREFIX_LENGTH = len("+234")


@dataclass(frozen=True)
class CustomerRow:
    """A customer account with the number of orders they placed.

    Attributes:
        user: The customer's account.
        orders_count: Every order of the customer, any status.
    """

    user: User
    orders_count: int


@dataclass(frozen=True)
class CustomerPage:
    """One page of the customer list.

    Attributes:
        rows: The customers on this page, newest first.
        total: Customers matching the search, across all pages.
        ordered_last_7_days: Customers with a real order in the last 7 days,
            not only the matches.
    """

    rows: list[CustomerRow]
    total: int
    ordered_last_7_days: int


@dataclass(frozen=True)
class AddressWithZone:
    """A saved address with its zone, whose ``is_active`` is read live."""

    address: CustomerAddress
    zone: ServiceZone


@dataclass(frozen=True)
class CustomerDetail:
    """A customer with everything the detail shows.

    Attributes:
        row: The account and its order count.
        paid_total_minor_units: Price snapshot totals of the paid orders, kobo.
        addresses: Saved addresses, default first, then newest first.
        recent_orders: The newest orders, newest first.
    """

    row: CustomerRow
    paid_total_minor_units: int
    addresses: list[AddressWithZone]
    recent_orders: list[Order]


def _customer_not_found() -> APIError:
    return APIError(HTTPStatus.NOT_FOUND, "customer_not_found", "Customer not found")


def _search_filter(q: str) -> ColumnElement[bool]:
    """Match a part of the name, or, with enough digits, a part of the phone.

    The phone is matched in its stored E.164 form and in the local ``0...``
    form staff type, so ``0800...`` and ``+234800...`` both find the account.
    ``autoescape`` keeps ``%`` and ``_`` in ``q`` literal.
    """
    conditions: list[ColumnElement[bool]] = [User.name.icontains(q, autoescape=True)]
    digits = re.sub(r"\D", "", q)
    if len(digits) >= PHONE_SEARCH_MIN_DIGITS:
        local_phone = func.concat("0", func.substr(User.phone, _E164_PREFIX_LENGTH + 1))
        conditions += [User.phone.contains(digits), local_phone.contains(digits)]
    return or_(*conditions)


async def _get_customer(session: AsyncSession, customer_id: uuid.UUID) -> User:
    # An id that is not a customer account is 404, so staff pages cannot read
    # drivers or admins through this directory.
    user = await session.scalar(
        select(User).where(User.id == customer_id, User.role == UserRole.CUSTOMER)
    )
    if user is None:
        raise _customer_not_found()
    return user


async def list_customers(
    session: AsyncSession,
    *,
    q: str | None,
    limit: int,
    offset: int,
    now: datetime | None = None,
) -> CustomerPage:
    """List customers, newest first, with the header count.

    Args:
        session: Database session.
        q: Optional search text (already trimmed, 1-100 characters).
        limit: Page size.
        offset: Rows to skip.
        now: The clock, for tests; defaults to the current time.

    Returns:
        The page, the number of matches and the customers who ordered in the
        last 7 days.
    """
    now = now or datetime.now(UTC)
    matching = select(User).where(User.role == UserRole.CUSTOMER)
    if q is not None:
        matching = matching.where(_search_filter(q))
    total = await session.scalar(select(func.count()).select_from(matching.subquery())) or 0
    users = list(
        await session.scalars(
            matching.order_by(User.created_at.desc(), User.id.desc()).limit(limit).offset(offset)
        )
    )
    counts = await orders_service.count_orders_by_customer(session, [user.id for user in users])
    ordered = await orders_service.count_customers_ordered_since(session, now - ORDERED_WINDOW)
    rows = [CustomerRow(user, counts.get(user.id, 0)) for user in users]
    return CustomerPage(rows=rows, total=total, ordered_last_7_days=ordered)


async def get_customer(session: AsyncSession, customer_id: uuid.UUID) -> CustomerDetail:
    """Return one customer with money, addresses and recent orders.

    Args:
        session: Database session.
        customer_id: The customer's account id.

    Returns:
        The detail.

    Raises:
        APIError: 404 ``customer_not_found`` for an unknown id or an account
            that is not a customer.
    """
    user = await _get_customer(session, customer_id)
    orders_count = await orders_service.count_customer_orders(session, customer_id=user.id)
    paid_total = await orders_service.paid_total_of_customer(session, customer_id=user.id)
    recent = await orders_service.recent_orders_of_customer(
        session, customer_id=user.id, limit=RECENT_ORDERS
    )
    rows = await session.execute(
        select(CustomerAddress, ServiceZone)
        .join(ServiceZone, ServiceZone.id == CustomerAddress.zone_id)
        .where(CustomerAddress.customer_id == user.id)
        .order_by(
            CustomerAddress.is_default.desc(),
            CustomerAddress.created_at.desc(),
            CustomerAddress.id.desc(),
        )
    )
    addresses = [AddressWithZone(address, zone) for address, zone in rows]
    return CustomerDetail(
        row=CustomerRow(user, orders_count),
        paid_total_minor_units=paid_total,
        addresses=addresses,
        recent_orders=recent,
    )


async def add_address(
    session: AsyncSession,
    *,
    admin: User,
    customer_id: uuid.UUID,
    label: str,
    address: str,
    landmark: str | None,
    zone_id: uuid.UUID,
) -> CustomerDetail:
    """Save an address on an existing customer, as staff. Commits.

    The first address a customer has becomes the default; later ones never
    change it (contract rule, as the mock). An inactive zone is allowed: staff
    may record the address, and ordering checks the zone (FR-010). Unlike
    the customer's own ``POST /me/addresses``, the contract sets no limit on
    the number of addresses here.

    Args:
        session: Database session.
        admin: The signed-in administrator; the audit actor (NFR-004).
        customer_id: The customer's account id.
        label: Trimmed, 1-50 characters.
        address: Trimmed, 5-500 characters.
        landmark: Optional, up to 200 characters.
        zone_id: The service zone the address is in (FR-020).

    Returns:
        The whole customer, so the page redraws without a second request.

    Raises:
        APIError: 404 ``customer_not_found``; 404 ``service_zone_not_found``.
    """
    customer = await _get_customer(session, customer_id)
    # The same row lock the customer's own address writes take, so a staff
    # write and a customer write cannot both decide "first address" at once.
    await session.execute(select(User.id).where(User.id == customer.id).with_for_update())
    await pricing_service.ensure_zone_exists(session, zone_id)
    existing = await session.scalar(
        select(func.count())
        .select_from(CustomerAddress)
        .where(CustomerAddress.customer_id == customer.id)
    )
    saved = CustomerAddress(
        customer_id=customer.id,
        zone_id=zone_id,
        label=label,
        address=address,
        landmark=landmark,
        is_default=not existing,
    )
    session.add(saved)
    await session.flush()
    # Ids only: the address text stays on the address (NFR-004).
    audit_service.record(
        session,
        actor_id=admin.id,
        action="customer_address_added",
        target_type=AUDIT_TARGET_TYPE,
        target_id=saved.id,
        details={"customer_id": str(customer.id)},
    )
    await session.commit()
    return await get_customer(session, customer.id)
