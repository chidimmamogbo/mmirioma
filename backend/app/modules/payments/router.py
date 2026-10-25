"""Cash endpoints for drivers and administrators (docs/api/payments.md).

Agreed G3 on 2026-10-22 from the approved cash remittance design (#98).
Driver endpoints use ``CurrentDriver`` and admin endpoints ``CurrentAdmin``,
so every other role gets 403 ``forbidden`` (FR-041: only authorized staff
receive and reconcile cash). ``POST`` also needs the CSRF header, which the
auth dependency enforces. Handlers only translate between HTTP and
:mod:`app.modules.payments.service`.
"""

import uuid
from datetime import date
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin, CurrentDriver
from app.modules.messaging.sms import SmsProvider, get_sms_provider
from app.modules.payments import service
from app.modules.payments.schemas import (
    AdminCashCollectionRead,
    CashCollectionRead,
    CashCollectionRequest,
    CashDayRead,
    CorrectionRequest,
    DriverCashForAdminRead,
    DriverCashRead,
    HandoverRequest,
    ReconciliationRead,
    ReconciliationRequest,
    RemittanceRead,
    RemittanceRequest,
)

router = APIRouter(tags=["cash"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
Sms = Annotated[SmsProvider, Depends(get_sms_provider)]

_READ_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}
_WRITE_ERRORS: dict[int | str, dict[str, object]] = {
    **_READ_ERRORS,
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
    HTTPStatus.CONFLICT: {"model": ErrorResponse},
}


# --- Driver ---------------------------------------------------------------------------


@router.post(
    "/driver/jobs/{reference}/cash-collection",
    status_code=HTTPStatus.CREATED,
    responses={**_WRITE_ERRORS, HTTPStatus.OK: {"description": "Repeat of the same record"}},
)
async def record_cash(
    reference: str,
    body: CashCollectionRequest,
    response: Response,
    driver: CurrentDriver,
    db: DbSession,
) -> CashCollectionRead:
    """Record the cash received after unloading (K1, BR-15).

    Returns 201, or 200 with the existing record for a repeat of the same
    amount and note.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``cash_already_recorded`` or
            ``transition_requirements_unmet``; 422 ``validation_error``.
    """
    view, created = await service.record_cash(
        db,
        driver=driver,
        reference=reference,
        amount_minor_units=body.amount_minor_units,
        note=body.note,
    )
    if not created:
        response.status_code = HTTPStatus.OK
    return CashCollectionRead.from_view(view)


@router.get("/driver/cash", responses=_READ_ERRORS)
async def my_cash(driver: CurrentDriver, db: DbSession) -> DriverCashRead:
    """The signed-in driver's cash on hand and recent handovers (K2)."""
    return DriverCashRead.from_cash(await service.driver_cash(db, driver_id=driver.id))


@router.post("/driver/cash/handover", responses=_WRITE_ERRORS)
async def hand_over(body: HandoverRequest, driver: CurrentDriver, db: DbSession) -> DriverCashRead:
    """List the chosen records as ready to hand over (K2, decision 3).

    Raises:
        APIError: 409 ``cash_collection_changed``; 422 ``validation_error``.
    """
    cash = await service.hand_over(db, driver=driver, collection_ids=body.collection_ids)
    return DriverCashRead.from_cash(cash)


# --- Admin ----------------------------------------------------------------------------


@router.get("/admin/cash", responses=_READ_ERRORS)
async def cash_page(
    _admin: CurrentAdmin,
    db: DbSession,
    day: Annotated[date | None, Query(alias="date")] = None,
) -> CashDayRead:
    """The cash page for one Lagos operating day, today by default (K3)."""
    return CashDayRead.from_day(await service.cash_day(db, day=day))


@router.get("/admin/cash/drivers/{driver_id}", responses=_WRITE_ERRORS)
async def driver_cash(
    driver_id: uuid.UUID, _admin: CurrentAdmin, db: DbSession
) -> DriverCashForAdminRead:
    """A driver's cash on hand, for receiving it (K4).

    Raises:
        APIError: 404 ``driver_not_found``.
    """
    driver, views = await service.cash_with_driver(db, driver_id=driver_id)
    return DriverCashForAdminRead.from_views(driver, views)


@router.post("/admin/cash-collections/{collection_id}/correction", responses=_WRITE_ERRORS)
async def correct_amount(
    collection_id: uuid.UUID, body: CorrectionRequest, admin: CurrentAdmin, db: DbSession
) -> AdminCashCollectionRead:
    """Correct a recorded amount before the cash is received (K4, decision 6).

    Raises:
        APIError: 404 ``cash_collection_not_found``; 409
            ``cash_collection_changed``; 422 ``validation_error``.
    """
    view = await service.correct_amount(
        db,
        admin=admin,
        collection_id=collection_id,
        amount_minor_units=body.amount_minor_units,
        reason=body.reason,
    )
    return AdminCashCollectionRead.from_view(view)


@router.post("/admin/cash-remittances", status_code=HTTPStatus.CREATED, responses=_WRITE_ERRORS)
async def receive_cash(
    body: RemittanceRequest, admin: CurrentAdmin, db: DbSession, sms: Sms
) -> RemittanceRead:
    """Receive cash from a driver; sets payment statuses and sends the payment SMS (K4).

    Raises:
        APIError: 404 ``driver_not_found``; 409 ``cash_collection_changed``;
            422 ``validation_error``.
    """
    result = await service.receive_cash(
        db,
        admin=admin,
        driver_id=body.driver_id,
        collection_ids=body.collection_ids,
        counted_minor_units=body.counted_minor_units,
        note=body.note,
        sms=sms,
    )
    return RemittanceRead.from_result(result)


@router.post("/admin/cash-reconciliations", responses=_WRITE_ERRORS)
async def reconcile(
    body: ReconciliationRequest, admin: CurrentAdmin, db: DbSession
) -> ReconciliationRead:
    """Reconcile received cash (K5). The payment status does not change.

    Raises:
        APIError: 409 ``cash_collection_changed``; 422 ``validation_error``.
    """
    views = await service.reconcile(
        db, admin=admin, collection_ids=body.collection_ids, note=body.note
    )
    return ReconciliationRead(
        collections=[AdminCashCollectionRead.from_view(view) for view in views]
    )
