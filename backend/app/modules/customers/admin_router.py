"""Admin support request endpoints (docs/api/admin-operations.md, "Support requests (admin)").

Every endpoint uses ``CurrentAdmin``, so customers and drivers get 403
``forbidden`` (FR-001); the resolve ``POST`` also needs the CSRF header,
which the auth dependency enforces. Handlers only translate between HTTP and
:mod:`app.modules.customers.requests`. A support request never changes the
order (customer-account.md decision 9).
"""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.customers import requests
from app.modules.customers.admin_schemas import (
    AdminSupportListParams,
    AdminSupportRequestDetail,
    AdminSupportRequestPage,
    AdminSupportRequestRead,
    SupportContactRead,
    SupportCustomerRead,
    SupportResolutionRead,
    SupportResolveRequest,
    SupportResolverRead,
)

router = APIRouter(prefix="/admin/support-requests", tags=["admin support"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}
_NOT_FOUND: dict[int | str, dict[str, object]] = {
    **_AUTH_ERRORS,
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
}


def admin_support_read(view: requests.AdminSupportView) -> AdminSupportRequestRead:
    """Build the admin support request object from the service's view.

    Args:
        view: The request, its order's reference and flag, and its people.

    Returns:
        The response body; ``resolution`` is null while the request is open.
    """
    request = view.request
    resolution = None
    if (
        view.resolver is not None
        and request.resolved_at is not None
        and request.resolution_note is not None
    ):
        resolution = SupportResolutionRead(
            note=request.resolution_note,
            resolved_by=SupportResolverRead(id=view.resolver.id, name=view.resolver.name),
            resolved_at=request.resolved_at,
        )
    return AdminSupportRequestRead(
        reference=request.reference,
        type=request.type,
        message=request.message,
        order_reference=view.order_reference,
        status=request.status,
        created_at=request.created_at,
        customer=SupportCustomerRead(
            id=view.customer.id, name=view.customer.name, phone=view.customer.phone
        ),
        resolution=resolution,
        is_simulated=view.is_simulated,
    )


@router.get("", responses=_AUTH_ERRORS)
async def list_support_requests(
    params: Annotated[AdminSupportListParams, Query()], admin: CurrentAdmin, db: DbSession
) -> AdminSupportRequestPage:
    """Every customer's support requests, open first, then newest first."""
    views, total = await requests.list_admin_support_requests(
        db, status=params.status, q=params.q, limit=params.limit, offset=params.offset
    )
    return AdminSupportRequestPage(
        items=[admin_support_read(view) for view in views],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.get("/{reference}", responses=_NOT_FOUND)
async def get_support_request(
    reference: str, admin: CurrentAdmin, db: DbSession
) -> AdminSupportRequestDetail:
    """One support request with the people staff may call.

    Raises:
        APIError: 404 ``support_request_not_found``.
    """
    view, contacts = await requests.get_admin_support_request(db, reference=reference)
    return AdminSupportRequestDetail(
        **admin_support_read(view).model_dump(),
        contacts=[
            SupportContactRead(name=contact.name, role=contact.role, phone=contact.phone)
            for contact in contacts
        ],
    )


@router.post(
    "/{reference}/resolve",
    responses={**_NOT_FOUND, HTTPStatus.CONFLICT: {"model": ErrorResponse}},
)
async def resolve_support_request(
    reference: str, body: SupportResolveRequest, admin: CurrentAdmin, db: DbSession
) -> AdminSupportRequestRead:
    """Resolve a support request with a note; final, and the order is unchanged.

    Raises:
        APIError: 404 ``support_request_not_found``; 409
            ``support_request_already_resolved``.
    """
    view = await requests.resolve_support_request(
        db, reference=reference, admin=admin, note=body.note
    )
    return admin_support_read(view)
