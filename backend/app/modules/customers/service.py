"""Customer profile and saved addresses (docs/api/customer-account.md).

Rules implemented here (contract "Saved addresses" and its decisions):

- **Own records only** (FR-001). Another customer's address answers the same
  404 ``address_not_found`` as one that does not exist, so ids cannot be
  probed.
- **Zone required** (FR-020): an unknown zone is 404
  ``service_zone_not_found``; an inactive zone is accepted, and the quote
  refuses it later (FR-010).
- **Exactly one default** whenever the customer has any address. The first
  address is the default whatever ``make_default`` says; ``make_default``
  moves the default in the same transaction; ``make_default: false`` on the
  current default does not clear it.
- **The default cannot be removed while other addresses exist** (409
  ``default_address``); the last remaining address can (decision 5).
- **At most 20 addresses** per customer (409 ``address_limit_reached``,
  decision 6).
- Every change is audited (NFR-004) with ids and changed field names only,
  never the address text.

Each write locks the customer's ``users`` row first, so two requests from
the same customer (a double tap, two tabs) run one after the other: the
limit cannot be passed and the "first address is the default" rule cannot
be raced. The partial unique index on ``customer_addresses`` is the last
line of defence for "one default".
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from http import HTTPStatus

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.modules.audit import service as audit_service
from app.modules.auth.models import User
from app.modules.customers.models import CustomerAddress
from app.modules.orders import service as orders_service
from app.modules.pricing import service as pricing_service
from app.modules.pricing.models import ServiceZone

#: Decision 6 of the contract.
MAX_ADDRESSES_PER_CUSTOMER = 20
AUDIT_TARGET_TYPE = "customer_address"


@dataclass(frozen=True)
class CustomerProfile:
    """Everything ``CustomerProfileRead`` is built from.

    Attributes:
        user: The customer's account.
        order_count: Their orders, every status.
        address_count: Their saved addresses.
    """

    user: User
    order_count: int
    address_count: int


@dataclass(frozen=True)
class AddressView:
    """A saved address with its zone, as the endpoints return it."""

    address: CustomerAddress
    zone: ServiceZone


@dataclass(frozen=True)
class AddressData:
    """What the customer sends for an address (already validated).

    Attributes:
        label: Trimmed, 1-50 characters.
        address: Trimmed, 5-500 characters.
        landmark: Trimmed, or None.
        zone_id: The picked zone.
        make_default: Make this the default address.
    """

    label: str
    address: str
    landmark: str | None
    zone_id: uuid.UUID
    make_default: bool


def _address_not_found() -> APIError:
    return APIError(HTTPStatus.NOT_FOUND, "address_not_found", "Address not found")


async def get_profile(session: AsyncSession, customer: User) -> CustomerProfile:
    """Return the signed-in customer's profile and counts.

    Args:
        session: Database session.
        customer: The signed-in customer.

    Returns:
        The profile view.
    """
    order_count = await orders_service.count_customer_orders(session, customer_id=customer.id)
    return CustomerProfile(
        user=customer,
        order_count=order_count,
        address_count=await _count(session, customer.id),
    )


async def list_addresses(
    session: AsyncSession, customer: User, *, limit: int, offset: int
) -> tuple[list[AddressView], int]:
    """Return a page of the customer's addresses, default first, then newest.

    Args:
        session: Database session.
        customer: The signed-in customer.
        limit: Page size (the caller enforces 1-100).
        offset: Number of addresses to skip.

    Returns:
        ``(addresses, total)``.
    """
    rows = await session.execute(
        select(CustomerAddress, ServiceZone)
        .join(ServiceZone, ServiceZone.id == CustomerAddress.zone_id)
        .where(CustomerAddress.customer_id == customer.id)
        # id breaks ties, so pages never overlap or skip rows.
        .order_by(
            CustomerAddress.is_default.desc(),
            CustomerAddress.created_at.desc(),
            CustomerAddress.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    views = [AddressView(address=address, zone=zone) for address, zone in rows]
    return views, await _count(session, customer.id)


async def add_address(session: AsyncSession, customer: User, data: AddressData) -> AddressView:
    """Save a new address. Commits.

    Args:
        session: Database session.
        customer: The signed-in customer.
        data: The validated address.

    Returns:
        The new address.

    Raises:
        APIError: 404 ``service_zone_not_found``; 409
            ``address_limit_reached`` at 20 addresses.
    """
    await _lock_customer(session, customer.id)
    await pricing_service.ensure_zone_exists(session, data.zone_id)
    count = await _count(session, customer.id)
    if count >= MAX_ADDRESSES_PER_CUSTOMER:
        raise APIError(
            HTTPStatus.CONFLICT,
            "address_limit_reached",
            f"You can save up to {MAX_ADDRESSES_PER_CUSTOMER} addresses. Remove one first.",
        )
    # The first address is always the default (contract rule).
    make_default = data.make_default or count == 0
    if make_default:
        await _clear_default(session, customer.id)
    address = CustomerAddress(
        customer_id=customer.id,
        zone_id=data.zone_id,
        label=data.label,
        address=data.address,
        landmark=data.landmark,
        is_default=make_default,
    )
    session.add(address)
    await session.flush()
    _audit(session, customer, address, "customer_address_added")
    await session.commit()
    return await _view(session, address)


async def update_address(
    session: AsyncSession, customer: User, address_id: uuid.UUID, data: AddressData
) -> AddressView:
    """Replace an address's fields, and make it the default if asked. Commits.

    ``make_default: false`` never clears the current default: the default
    changes only by choosing another address.

    Args:
        session: Database session.
        customer: The signed-in customer.
        address_id: The address to change.
        data: The validated address.

    Returns:
        The changed address.

    Raises:
        APIError: 404 ``address_not_found`` or ``service_zone_not_found``.
    """
    await _lock_customer(session, customer.id)
    address = await _own_address(session, customer, address_id)
    await pricing_service.ensure_zone_exists(session, data.zone_id)
    changed = [
        name
        for name, value in (
            ("label", data.label),
            ("address", data.address),
            ("landmark", data.landmark),
            ("zone_id", data.zone_id),
        )
        if getattr(address, name) != value
    ]
    address.label = data.label
    address.address = data.address
    address.landmark = data.landmark
    address.zone_id = data.zone_id
    if data.make_default and not address.is_default:
        await _clear_default(session, customer.id)
        address.is_default = True
        changed.append("is_default")
    if changed:
        await session.flush()
        _audit(session, customer, address, "customer_address_updated", fields=changed)
    await session.commit()
    return await _view(session, address)


async def set_default_address(
    session: AsyncSession, customer: User, address_id: uuid.UUID
) -> AddressView:
    """Make an address the default; the old default stops being one. Commits.

    Setting the current default again changes nothing and writes no audit row.

    Args:
        session: Database session.
        customer: The signed-in customer.
        address_id: The new default.

    Returns:
        The address.

    Raises:
        APIError: 404 ``address_not_found``.
    """
    await _lock_customer(session, customer.id)
    address = await _own_address(session, customer, address_id)
    if not address.is_default:
        await _clear_default(session, customer.id)
        address.is_default = True
        await session.flush()
        _audit(session, customer, address, "customer_address_default_set")
    await session.commit()
    return await _view(session, address)


async def remove_address(session: AsyncSession, customer: User, address_id: uuid.UUID) -> None:
    """Remove an address. Commits.

    Orders keep their own copy of the address text (FR-024), so nothing else
    changes.

    Args:
        session: Database session.
        customer: The signed-in customer.
        address_id: The address to remove.

    Raises:
        APIError: 404 ``address_not_found``; 409 ``default_address`` when it
            is the default and other addresses exist (decision 5).
    """
    await _lock_customer(session, customer.id)
    address = await _own_address(session, customer, address_id)
    if address.is_default and await _count(session, customer.id) > 1:
        raise APIError(
            HTTPStatus.CONFLICT,
            "default_address",
            "Choose another default address before removing this one",
        )
    _audit(session, customer, address, "customer_address_removed")
    await session.delete(address)
    await session.commit()


# --- Helpers ----------------------------------------------------------------------------


async def _lock_customer(session: AsyncSession, customer_id: uuid.UUID) -> None:
    # Serializes one customer's address writes (module docstring).
    await session.execute(select(User.id).where(User.id == customer_id).with_for_update())


async def _own_address(
    session: AsyncSession, customer: User, address_id: uuid.UUID
) -> CustomerAddress:
    address = await session.scalar(
        select(CustomerAddress).where(
            CustomerAddress.id == address_id, CustomerAddress.customer_id == customer.id
        )
    )
    if address is None:
        raise _address_not_found()
    return address


async def _count(session: AsyncSession, customer_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(CustomerAddress)
        .where(CustomerAddress.customer_id == customer_id)
    )
    return count or 0


async def _clear_default(session: AsyncSession, customer_id: uuid.UUID) -> None:
    # A bulk UPDATE does not refresh updated_at by itself (backend.md).
    await session.execute(
        update(CustomerAddress)
        .where(CustomerAddress.customer_id == customer_id, CustomerAddress.is_default)
        .values(is_default=False, updated_at=func.now())
        .execution_options(synchronize_session="fetch")
    )
    # The partial unique index is checked per statement, so the old default
    # must be cleared in the database before the new one is written.
    await session.flush()


async def _view(session: AsyncSession, address: CustomerAddress) -> AddressView:
    # Reload so the database's created_at and updated_at are returned.
    await session.refresh(address)
    zone = await session.get(ServiceZone, address.zone_id)
    if zone is None:  # pragma: no cover - the foreign key prevents it
        raise _address_not_found()
    return AddressView(address=address, zone=zone)


def _audit(
    session: AsyncSession,
    customer: User,
    address: CustomerAddress,
    action: str,
    *,
    fields: Sequence[str] | None = None,
) -> None:
    # Ids and field names only; the address text stays on the address
    # (NFR-004, contract "Common rules").
    details: dict[str, object] = {"customer_id": str(customer.id)}
    if fields is not None:
        details["fields"] = list(fields)
    audit_service.record(
        session,
        actor_id=customer.id,
        action=action,
        target_type=AUDIT_TARGET_TYPE,
        target_id=address.id,
        details=details,
    )
