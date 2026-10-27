"""Customer account endpoints under ``/me`` (docs/api/customer-account.md).

Profile, saved addresses, support requests and the deletion request. Every
endpoint uses ``CurrentCustomer``, so staff and drivers get 403
``forbidden`` (FR-001); unsafe methods also need the CSRF header, which the
auth dependency enforces. Handlers only translate between HTTP and
:mod:`app.modules.customers.service` and :mod:`app.modules.customers.requests`.
"""

import uuid
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentCustomer
from app.modules.customers import requests, service
from app.modules.customers.models import DeletionRequest, SupportRequest
from app.modules.customers.schemas import (
    AddressInput,
    AddressPageRead,
    AddressRead,
    AddressZoneRead,
    CustomerProfileRead,
    DeletionRequestCreate,
    DeletionRequestRead,
    ProfileStatsRead,
    SupportRequestCreate,
    SupportRequestPageRead,
    SupportRequestRead,
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


def support_request_read(
    request: SupportRequest, order_reference: str | None
) -> SupportRequestRead:
    """Build ``SupportRequestRead`` from the stored request and its order's reference."""
    return SupportRequestRead(
        reference=request.reference,
        type=request.type,
        message=request.message,
        order_reference=order_reference,
        status=request.status,
        created_at=request.created_at,
        resolved_at=request.resolved_at,
    )


def deletion_request_read(request: DeletionRequest) -> DeletionRequestRead:
    """Build ``DeletionRequestRead``; ``created_at`` is the request time."""
    return DeletionRequestRead(
        reference=request.reference,
        status=request.status,
        requested_at=request.created_at,
        acknowledge_by=request.acknowledge_by,
    )


@router.get("/support-requests", responses=_AUTH_ERRORS)
async def list_support_requests(
    page: Annotated[PageParams, Query()], customer: CurrentCustomer, db: DbSession
) -> SupportRequestPageRead:
    """The customer's support requests, newest first."""
    rows, total = await requests.list_support_requests(
        db, customer, limit=page.limit, offset=page.offset
    )
    return SupportRequestPageRead(
        items=[support_request_read(request, reference) for request, reference in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "/support-requests",
    status_code=HTTPStatus.CREATED,
    responses={
        **_WRITE_ERRORS,
        HTTPStatus.OK: {"model": SupportRequestRead, "description": "Idempotent retry"},
    },
)
async def create_support_request(
    body: SupportRequestCreate, customer: CurrentCustomer, db: DbSession, response: Response
) -> SupportRequestRead:
    """Send a support request; a retry with the same key returns it with 200.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``idempotency_key_reused``.
    """
    request, order_reference, created = await requests.create_support_request(
        db,
        customer,
        type=body.type,
        message=body.message,
        order_reference=body.order_reference,
        idempotency_key=body.idempotency_key,
    )
    response.status_code = HTTPStatus.CREATED if created else HTTPStatus.OK
    return support_request_read(request, order_reference)


@router.post(
    "/deletion-request",
    status_code=HTTPStatus.ACCEPTED,
    responses={
        **_AUTH_ERRORS,
        HTTPStatus.OK: {"model": DeletionRequestRead, "description": "The open request"},
    },
)
async def request_deletion(
    customer: CurrentCustomer,
    db: DbSession,
    response: Response,
    body: Annotated[DeletionRequestCreate | None, Body()] = None,
) -> DeletionRequestRead:
    """Ask for the account to be deleted (privacy notice §9). Deletes nothing.

    202 for a new request; 200 with the open request when one exists.
    """
    request, created = await requests.request_deletion(
        db, customer, reason=body.reason if body is not None else None
    )
    response.status_code = HTTPStatus.ACCEPTED if created else HTTPStatus.OK
    return deletion_request_read(request)


@router.get(
    "/deletion-request",
    responses={**_AUTH_ERRORS, HTTPStatus.NOT_FOUND: {"model": ErrorResponse}},
)
async def get_deletion_request(customer: CurrentCustomer, db: DbSession) -> DeletionRequestRead:
    """The customer's open deletion request.

    Raises:
        APIError: 404 ``deletion_request_not_found``.
    """
    return deletion_request_read(await requests.get_open_deletion_request(db, customer))
