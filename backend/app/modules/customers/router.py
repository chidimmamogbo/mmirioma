"""Customer account endpoints under ``/me`` (docs/api/customer-account.md).

Every endpoint uses ``CurrentCustomer``, so staff and drivers get 403
``forbidden`` (FR-001); unsafe methods also need the CSRF header, which the
auth dependency enforces. Handlers only translate between HTTP and
:mod:`app.modules.customers.service`.
"""

import uuid
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentCustomer
from app.modules.customers import service
from app.modules.customers.schemas import (
    AddressInput,
    AddressPageRead,
    AddressRead,
    AddressZoneRead,
    CustomerProfileRead,
    ProfileStatsRead,
)
from app.modules.orders.schemas import PageParams

router = APIRouter(prefix="/me", tags=["customer account"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}
_WRITE_ERRORS: dict[int | str, dict[str, object]] = {
    **_AUTH_ERRORS,
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
    HTTPStatus.CONFLICT: {"model": ErrorResponse},
}


def address_read(view: service.AddressView) -> AddressRead:
    """Build ``AddressRead`` from the service's view.

    Args:
        view: The address and its zone.

    Returns:
        The response body.
    """
    address, zone = view.address, view.zone
    return AddressRead(
        id=address.id,
        label=address.label,
        address=address.address,
        landmark=address.landmark,
        zone=AddressZoneRead(id=zone.id, name=zone.name, is_active=zone.is_active),
        is_default=address.is_default,
        created_at=address.created_at,
        updated_at=address.updated_at,
    )


def _data(body: AddressInput) -> service.AddressData:
    return service.AddressData(
        label=body.label,
        address=body.address,
        landmark=body.landmark,
        zone_id=body.zone_id,
        make_default=body.make_default,
    )


@router.get("/profile", responses=_AUTH_ERRORS)
async def get_profile(customer: CurrentCustomer, db: DbSession) -> CustomerProfileRead:
    """The signed-in customer's profile and counts."""
    profile = await service.get_profile(db, customer)
    return CustomerProfileRead(
        name=profile.user.name,
        phone=profile.user.phone,
        phone_verified=profile.user.phone_verified_at is not None,
        customer_since=profile.user.created_at,
        stats=ProfileStatsRead(orders=profile.order_count, addresses=profile.address_count),
    )


@router.get("/addresses", responses=_AUTH_ERRORS)
async def list_addresses(
    page: Annotated[PageParams, Query()], customer: CurrentCustomer, db: DbSession
) -> AddressPageRead:
    """The customer's saved addresses, default first, then newest."""
    views, total = await service.list_addresses(db, customer, limit=page.limit, offset=page.offset)
    return AddressPageRead(
        items=[address_read(view) for view in views],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post("/addresses", status_code=HTTPStatus.CREATED, responses=_WRITE_ERRORS)
async def add_address(body: AddressInput, customer: CurrentCustomer, db: DbSession) -> AddressRead:
    """Save a new address; the first one is always the default.

    Raises:
        APIError: 404 ``service_zone_not_found``; 409 ``address_limit_reached``.
    """
    return address_read(await service.add_address(db, customer, _data(body)))


@router.patch("/addresses/{address_id}", responses=_WRITE_ERRORS)
async def update_address(
    address_id: uuid.UUID, body: AddressInput, customer: CurrentCustomer, db: DbSession
) -> AddressRead:
    """Replace an address's fields.

    Raises:
        APIError: 404 ``address_not_found`` or ``service_zone_not_found``.
    """
    return address_read(await service.update_address(db, customer, address_id, _data(body)))


@router.post("/addresses/{address_id}/default", responses=_WRITE_ERRORS)
async def set_default_address(
    address_id: uuid.UUID, customer: CurrentCustomer, db: DbSession
) -> AddressRead:
    """Make an address the default.

    Raises:
        APIError: 404 ``address_not_found``.
    """
    return address_read(await service.set_default_address(db, customer, address_id))


@router.delete(
    "/addresses/{address_id}", status_code=HTTPStatus.NO_CONTENT, responses=_WRITE_ERRORS
)
async def remove_address(
    address_id: uuid.UUID, customer: CurrentCustomer, db: DbSession
) -> Response:
    """Remove an address.

    Raises:
        APIError: 404 ``address_not_found``; 409 ``default_address``.
    """
    await service.remove_address(db, customer, address_id)
    return Response(status_code=HTTPStatus.NO_CONTENT)
