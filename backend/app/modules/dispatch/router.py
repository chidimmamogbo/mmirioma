"""Admin dispatch endpoints (docs/api/deliveries.md, "Admin dispatch endpoints").

Agreed in G3 (PR #59) from the approved admin dispatch design (D1-D5, H1).
Every endpoint uses ``CurrentAdmin``, so customers and drivers get 403
``forbidden`` (FR-001); ``POST`` also needs the CSRF header, which the auth
dependency enforces. Handlers only translate between HTTP and
:mod:`app.modules.dispatch.service`.

Only the driver list and the offer live here. The order detail, withdraw
and history moved to the deliveries admin router with the hold review
(#93): each now shows or closes the job's hold, which the deliveries module
owns, and deliveries depends on dispatch, not the other way round. Their
services stay in :mod:`app.modules.dispatch.service`.

An order being offered is ``confirmed`` and has no open hold (holds close
when a job ends), so the offer's ``AdminOrderDetail`` carries ``hold: null``.
"""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.confirmation import service as confirmation_service
from app.modules.confirmation.schemas import OrderConfirmationFields
from app.modules.dispatch import service
from app.modules.dispatch.schemas import (
    AdminOrderDetail,
    AssignRequest,
    DispatchDriver,
    DispatchDriverList,
)
from app.modules.payments import service as payments_service
from app.modules.payments.schemas import OrderPaymentRead

router = APIRouter(prefix="/admin/orders", tags=["admin dispatch"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_READ_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
}
_WRITE_ERRORS: dict[int | str, dict[str, object]] = {
    **_READ_ERRORS,
    HTTPStatus.CONFLICT: {"model": ErrorResponse},
}


@router.get("/{reference}/drivers", responses=_READ_ERRORS)
async def list_drivers(reference: str, _admin: CurrentAdmin, db: DbSession) -> DispatchDriverList:
    """List every driver with their eligibility for this order (D1, FR-031).

    Raises:
        APIError: 404 ``order_not_found``.
    """
    choices = await service.list_drivers_for_order(db, reference=reference)
    return DispatchDriverList(items=[DispatchDriver.from_choice(choice) for choice in choices])


@router.post(
    "/{reference}/assign",
    status_code=HTTPStatus.CREATED,
    responses={
        **_WRITE_ERRORS,
        HTTPStatus.OK: {"model": AdminOrderDetail, "description": "Repeated offer"},
    },
)
async def assign(
    reference: str, body: AssignRequest, admin: CurrentAdmin, db: DbSession, response: Response
) -> AdminOrderDetail:
    """Offer a confirmed order to one driver (row 8, FR-032).

    The order becomes ``assigned``; the driver has not accepted. Returns 201,
    or 200 when the same driver is already offered it.

    Raises:
        APIError: 404 ``order_not_found`` or ``driver_not_found``;
            409 ``driver_not_eligible`` (``details.reasons``) or
            ``invalid_order_transition``.
    """
    order, created = await service.offer_order(
        db, reference=reference, driver_user_id=body.driver_id, admin=admin
    )
    if not created:
        response.status_code = HTTPStatus.OK
    staff_order = order.staff_order.order
    view = await confirmation_service.confirmation_view(db, staff_order)
    payment = await payments_service.payment_view(db, staff_order)
    return AdminOrderDetail.from_dispatch(
        order,
        None,
        OrderConfirmationFields.from_view(staff_order, view),
        OrderPaymentRead.from_view(payment),
    )
