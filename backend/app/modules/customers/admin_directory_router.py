"""Admin customer directory endpoints (docs/api/admin-directory.md, "Customers").

Every endpoint uses ``CurrentAdmin``, so customers and drivers get 403
``forbidden`` (FR-001); the address ``POST`` also needs the CSRF header, which
the auth dependency enforces. Handlers only translate between HTTP and
:mod:`app.modules.customers.directory`. There is no create endpoint: staff do
not create customer accounts (decided 2026-10-26).
"""

import uuid
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.customers import directory
from app.modules.customers.admin_directory_schemas import (
    AdminAddressCreate,
    AdminAddressRead,
    AdminAddressZoneRead,
    AdminCustomerListParams,
    AdminCustomerPageRead,
    AdminCustomerRead,
    AdminCustomerSummaryRead,
    AdminRecentOrderRead,
)

router = APIRouter(prefix="/admin/customers", tags=["admin customers"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}
_NOT_FOUND: dict[int | str, dict[str, object]] = {
    **_AUTH_ERRORS,
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
}


def _summary(row: directory.CustomerRow) -> AdminCustomerSummaryRead:
    user = row.user
    return AdminCustomerSummaryRead(
        id=user.id,
        name=user.name,
        phone=user.phone,
        phone_verified=user.phone_verified_at is not None,
        is_active=user.is_active,
        orders_count=row.orders_count,
        created_at=user.created_at,
    )


def customer_read(detail: directory.CustomerDetail) -> AdminCustomerRead:
    """Build the customer detail body from the service's view.

    Args:
        detail: The customer with money, addresses and recent orders.

    Returns:
        The response body.
    """
    return AdminCustomerRead(
        **_summary(detail.row).model_dump(),
        paid_total_minor_units=detail.paid_total_minor_units,
        addresses=[
            AdminAddressRead(
                id=item.address.id,
                label=item.address.label,
                address=item.address.address,
                landmark=item.address.landmark,
                zone=AdminAddressZoneRead(
                    id=item.zone.id, name=item.zone.name, is_active=item.zone.is_active
                ),
                is_default=item.address.is_default,
                created_at=item.address.created_at,
            )
            for item in detail.addresses
        ],
        recent_orders=[
            AdminRecentOrderRead(
                reference=order.reference,
                created_at=order.created_at,
                status=order.status,
                quantity_litres=order.quantity_litres,
                delivery_type=order.delivery_type,
            )
            for order in detail.recent_orders
        ],
    )


@router.get("", responses=_AUTH_ERRORS)
async def list_customers(
    params: Annotated[AdminCustomerListParams, Query()], admin: CurrentAdmin, db: DbSession
) -> AdminCustomerPageRead:
    """List customers, newest first, with the count who ordered in the last 7 days."""
    page = await directory.list_customers(db, q=params.q, limit=params.limit, offset=params.offset)
    return AdminCustomerPageRead(
        items=[_summary(row) for row in page.rows],
        total=page.total,
        limit=params.limit,
        offset=params.offset,
        ordered_last_7_days=page.ordered_last_7_days,
    )


@router.get("/{customer_id}", responses=_NOT_FOUND)
async def get_customer(
    customer_id: uuid.UUID, admin: CurrentAdmin, db: DbSession
) -> AdminCustomerRead:
    """Return one customer. 404 ``customer_not_found`` for an id that is not a customer."""
    return customer_read(await directory.get_customer(db, customer_id))


@router.post("/{customer_id}/addresses", status_code=HTTPStatus.CREATED, responses=_NOT_FOUND)
async def add_customer_address(
    customer_id: uuid.UUID, body: AdminAddressCreate, admin: CurrentAdmin, db: DbSession
) -> AdminCustomerRead:
    """Save an address on an existing customer, and return the whole customer."""
    detail = await directory.add_address(
        db,
        admin=admin,
        customer_id=customer_id,
        label=body.label,
        address=body.address,
        landmark=body.landmark,
        zone_id=body.zone_id,
    )
    return customer_read(detail)
