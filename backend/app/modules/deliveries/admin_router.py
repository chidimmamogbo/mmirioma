"""Admin order views and hold review endpoints (docs/api/deliveries.md).

The hold review ("Admin hold review endpoints") was agreed in G3 (PR #91)
from the approved admin hold review design (#88). Every endpoint uses
``CurrentAdmin``, so customers and drivers get 403 ``forbidden`` (FR-001,
T-23); ``POST`` also needs the CSRF header, which the auth dependency
enforces. Handlers only translate between HTTP and
:mod:`app.modules.deliveries.holds`.

The admin order list, detail, withdraw and history live here, not in the
orders and dispatch routers: each shows or closes the job's hold, which this
module owns, and deliveries depends on orders and dispatch, not the other
way round (technical lead, 2026-10-21). Their paths and agreed shapes are
unchanged; the list and detail gain ``hold``, and the history adds hold
entries only with ``include=holds`` (contract decision 8).
"""

from http import HTTPStatus
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.confirmation import service as confirmation_service
from app.modules.confirmation.schemas import (
    ConfirmationOptions,
    ConfirmRequest,
    OrderConfirmationFields,
)
from app.modules.deliveries import holds
from app.modules.deliveries.admin_schemas import (
    AdminOrderEventWithHolds,
    AdminOrderHistoryWithHolds,
    AdminOrderListFilters,
    AdminTransitionRequest,
    CancellationOutcomeRead,
    HeldAdminOrderPage,
    HoldDecisionRequest,
    HoldReviewRead,
    ProofOverrideRequest,
    hold_read,
)
from app.modules.dispatch.models import AssignmentStatus
from app.modules.dispatch.schemas import (
    AdminOrderDetail,
    AdminOrderEvent,
    AdminOrderHistory,
    WithdrawRequest,
)
from app.modules.messaging.sms import SmsProvider, get_sms_provider
from app.modules.orders.models import OrderStatus, TransitionReason
from app.modules.orders.schemas import AdminOrderRead
from app.modules.payments import service as payments_service
from app.modules.payments.schemas import OrderPaymentRead

router = APIRouter(prefix="/admin/orders", tags=["admin orders and holds"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
Sms = Annotated[SmsProvider, Depends(get_sms_provider)]
# One path, two agreed bodies: `to` picks the shape (confirm, or fail and cancel).
TransitionBody = Annotated[AdminTransitionRequest | ConfirmRequest, Field(discriminator="to")]

_READ_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
}
_WRITE_ERRORS: dict[int | str, dict[str, object]] = {
    **_READ_ERRORS,
    HTTPStatus.CONFLICT: {"model": ErrorResponse},
}


def _detail(detail: holds.OrderDetail) -> AdminOrderDetail:
    # A decision closes the holds of its kind; another kind may still be
    # open, so the services return the order with its current hold.
    return AdminOrderDetail.from_dispatch(
        detail.dispatch,
        hold_read(detail.hold),
        OrderConfirmationFields.from_view(detail.dispatch.staff_order.order, detail.confirmation),
        OrderPaymentRead.from_view(detail.payment),
    )


@router.get("", responses={HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse}})
async def list_orders(
    filters: Annotated[AdminOrderListFilters, Query()], _admin: CurrentAdmin, db: DbSession
) -> HeldAdminOrderPage:
    """List all orders for the dispatcher, newest first, with filters and holds (FR-030, R0).

    ``on_hold=true`` lists only orders whose job has an open hold; ``total``
    is then the On hold count.
    """
    items, total = await holds.list_orders(
        db,
        statuses=filters.status,
        created_from=filters.created_from,
        created_to=filters.created_to,
        is_simulated=filters.is_simulated,
        on_hold=filters.on_hold,
        limit=filters.limit,
        offset=filters.offset,
    )
    return HeldAdminOrderPage(
        items=[
            AdminOrderRead.from_order(
                item.staff_order.order, item.staff_order.customer, hold_read(item.hold)
            )
            for item in items
        ],
        total=total,
        limit=filters.limit,
        offset=filters.offset,
    )


@router.get("/{reference}", responses=_READ_ERRORS)
async def get_order(reference: str, _admin: CurrentAdmin, db: DbSession) -> AdminOrderDetail:
    """Return any order with its customer, most recent assignment and open hold.

    Raises:
        APIError: 404 ``order_not_found``.
    """
    return _detail(await holds.get_order_detail(db, reference=reference))


@router.post("/{reference}/withdraw", responses=_WRITE_ERRORS)
async def withdraw(
    reference: str, body: WithdrawRequest, admin: CurrentAdmin, db: DbSession
) -> AdminOrderDetail:
    """Take back an offered or accepted job (rows 10, 11), closing any hold on it.

    Raises:
        APIError: 404 ``order_not_found`` or ``assignment_not_found``;
            409 ``invalid_order_transition`` (the assignment is not
            ``expected_status``, or the driver has departed).
    """
    detail = await holds.withdraw_job(
        db,
        reference=reference,
        admin=admin,
        expected_status=AssignmentStatus(body.expected_status),
        note=body.note,
    )
    return _detail(detail)


@router.get("/{reference}/history", responses=_READ_ERRORS)
async def history(
    reference: str,
    _admin: CurrentAdmin,
    db: DbSession,
    include: Annotated[Literal["holds"] | None, Query()] = None,
) -> AdminOrderHistory | AdminOrderHistoryWithHolds:
    """Return every event of the order, newest first, with names (H1, NFR-004).

    Without ``include`` the response is exactly the agreed H1 history. With
    ``include=holds`` each entry also has ``kind``, ``hold`` and ``cash``,
    and hold opened and decided entries and the cash steps
    (docs/api/payments.md) are added (their statuses are null).

    Raises:
        APIError: 404 ``order_not_found``.
    """
    include_holds = include == "holds"
    items = await holds.order_history(db, reference=reference, include_holds=include_holds)
    entries = [item for item in items if isinstance(item, holds.dispatch_service.HistoryEntry)]
    confirmations = await confirmation_service.confirmation_lines(
        db, {entry.event.id for entry in entries}
    )
    if include_holds:
        with_holds = [AdminOrderEventWithHolds.from_item(item, confirmations) for item in items]
        if entries:
            order_id = entries[0].event.order_id
            cash = await payments_service.cash_history(db, order_id)
            with_holds.extend(AdminOrderEventWithHolds.from_cash(entry) for entry in cash)
            # Newest first, as the rest of the history (cash steps never
            # change the order status, so they sit among it by time).
            with_holds.sort(key=lambda item: item.created_at, reverse=True)
        return AdminOrderHistoryWithHolds(items=with_holds)
    return AdminOrderHistory(
        items=[AdminOrderEvent.from_entry(entry, confirmations) for entry in entries]
    )


@router.get("/{reference}/confirmation-options", responses=_READ_ERRORS)
async def confirmation_options(
    reference: str, _admin: CurrentAdmin, db: DbSession
) -> ConfirmationOptions:
    """Every water category with every source and why it cannot be used (C1).

    Never returns a source's cost per litre.

    Raises:
        APIError: 404 ``order_not_found``.
    """
    options = await confirmation_service.confirmation_options(db, reference=reference)
    return ConfirmationOptions.from_options(options)


@router.get("/{reference}/hold", responses=_READ_ERRORS)
async def get_hold(reference: str, _admin: CurrentAdmin, db: DbSession) -> HoldReviewRead:
    """Return the evidence for the order's open hold (R1, R2, R3).

    Raises:
        APIError: 404 ``order_not_found`` or ``hold_not_found``.
    """
    return HoldReviewRead.from_review(await holds.get_hold_review(db, reference=reference))


@router.post("/{reference}/proof-overrides", responses=_WRITE_ERRORS)
async def decide_proof(
    reference: str, body: ProofOverrideRequest, admin: CurrentAdmin, db: DbSession
) -> AdminOrderDetail:
    """Approve (row 18) or reject alternative proof (R1, FR-035).

    Raises:
        APIError: 404 ``order_not_found``; 403 ``own_delivery_override``
            (BR-13); 409 ``hold_not_open`` or ``invalid_order_transition``;
            422 ``validation_error``.
    """
    ack = body.customer_acknowledgment
    detail = await holds.decide_proof(
        db,
        reference=reference,
        admin=admin,
        hold_id=body.hold_id,
        decision=holds.ProofDecision(body.decision),
        acknowledgment=None
        if ack is None
        else holds.CustomerAcknowledgment(
            method=ack.method, confirmed_at=ack.confirmed_at, note=ack.note
        ),
        note=body.note,
    )
    return _detail(detail)


@router.post("/{reference}/hold/continue", responses=_WRITE_ERRORS)
async def continue_source(
    reference: str, body: HoldDecisionRequest, admin: CurrentAdmin, db: DbSession
) -> AdminOrderDetail:
    """Let the driver continue after a source review (R2, FR-012).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``hold_not_open`` or
            ``source_not_eligible``.
    """
    detail = await holds.continue_source(
        db, reference=reference, admin=admin, hold_id=body.hold_id, note=body.note
    )
    return _detail(detail)


@router.post("/{reference}/hold/resume", responses=_WRITE_ERRORS)
async def resume_unsafe(
    reference: str, body: HoldDecisionRequest, admin: CurrentAdmin, db: DbSession
) -> AdminOrderDetail:
    """Resume a job after an unsafe stop, with a safe alternative (R3, SRS §8).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``hold_not_open``.
    """
    detail = await holds.resume_unsafe(
        db, reference=reference, admin=admin, hold_id=body.hold_id, note=body.note
    )
    return _detail(detail)


@router.get("/{reference}/cancellation-outcome", responses=_WRITE_ERRORS)
async def cancellation_outcome(
    reference: str,
    reason_code: Annotated[TransitionReason, Query()],
    _admin: CurrentAdmin,
    db: DbSession,
) -> CancellationOutcomeRead:
    """What cancelling with ``reason_code`` would cost the customer (FR-044).

    Raises:
        APIError: 404 ``order_not_found``; 422 ``validation_error`` for a
            reason other than ``mmirioma_unable``; 409
            ``invalid_order_transition``.
    """
    outcome = await holds.cancellation_outcome(db, reference=reference, reason_code=reason_code)
    return CancellationOutcomeRead.from_outcome(outcome)


@router.post("/{reference}/transition", responses=_WRITE_ERRORS)
async def transition(
    reference: str,
    body: TransitionBody,
    admin: CurrentAdmin,
    db: DbSession,
    sms: Sms,
) -> AdminOrderDetail:
    """Confirm an order (rows 26 and 7), fail a delivery (row 20) or cancel (row 23).

    The body's ``to`` picks the shape: ``confirmed`` is the order
    confirmation request (contract PR #111); ``failed`` and ``cancelled`` are
    the hold review's (PR #91).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``,
            ``hold_not_open`` or ``transition_requirements_unmet``; 422
            ``validation_error``.
    """
    if isinstance(body, ConfirmRequest):
        await confirmation_service.confirm_order(
            db, reference=reference, admin=admin, data=body.to_input(), sms=sms
        )
        return _detail(await holds.get_order_detail(db, reference=reference))
    detail = await holds.transition_with_holds(
        db,
        reference=reference,
        admin=admin,
        target=OrderStatus(body.to),
        expected_status=body.expected_status,
        reason_code=body.reason_code,
        note=body.note,
        hold_id=body.hold_id,
    )
    return _detail(detail)
