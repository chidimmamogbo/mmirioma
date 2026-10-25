"""Driver job endpoints (docs/api/deliveries.md, "Driver job endpoints", parts 1 and 2).

Part 1 was agreed 2026-10-19 (PR #50); part 2 (accept, steps, arrival,
contact attempts, unloading complete, proof) on 2026-10-20 (PR #74, #75).

Jobs are named by their order reference. Every endpoint uses
``CurrentDriver``, so customers and admins get 403 ``forbidden`` (FR-001).
``POST`` requests also need the CSRF header, which the auth dependency
enforces. Handlers only translate between HTTP and
:mod:`app.modules.deliveries.service`; each job also carries its Cash card
from :mod:`app.modules.payments.service` (docs/api/payments.md).
"""

from datetime import UTC, datetime
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentDriver
from app.modules.deliveries import service
from app.modules.deliveries.schemas import (
    ArriveRequest,
    DeclineRequest,
    DriverJobDetail,
    DriverJobList,
    DriverJobSummary,
    HoldRead,
    IncidentRead,
    IncidentRequest,
    IncidentType,
    PickupRequest,
    ProofRequest,
    TransitionRequest,
)
from app.modules.messaging.sms import SmsProvider, get_sms_provider
from app.modules.payments import service as payments_service

router = APIRouter(prefix="/driver/jobs", tags=["driver jobs"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
Sms = Annotated[SmsProvider, Depends(get_sms_provider)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}
_JOB_ERRORS: dict[int | str, dict[str, object]] = {
    **_AUTH_ERRORS,
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
    HTTPStatus.CONFLICT: {"model": ErrorResponse},
}


async def _detail(db: AsyncSession, job: service.DriverJob) -> DriverJobDetail:
    # Every job response carries the Cash card (docs/api/payments.md), so the
    # app never replaces a job that has one with one that does not.
    cash = await payments_service.cash_for_jobs(db, [job])
    return DriverJobDetail.from_job(job, cash.get(job.order.id))


async def _summary(db: AsyncSession, job: service.DriverJob) -> DriverJobSummary:
    cash = await payments_service.cash_for_jobs(db, [job])
    return DriverJobSummary.from_job(job, cash.get(job.order.id))


@router.get("", responses=_AUTH_ERRORS)
async def list_jobs(driver: CurrentDriver, db: DbSession) -> DriverJobList:
    """List the signed-in driver's jobs as offers, today, upcoming and done.

    Groups are computed in Africa/Lagos; upcoming holds accepted jobs for a
    later day (contract, "GET /driver/jobs").
    """
    now = datetime.now(UTC)
    jobs = await service.list_driver_jobs(db, driver_id=driver.id, now=now)
    cash = await payments_service.cash_for_jobs(
        db, [*jobs.offers, *jobs.today, *jobs.upcoming, *jobs.done], now=now
    )

    def summaries(group: list[service.DriverJob]) -> list[DriverJobSummary]:
        return [DriverJobSummary.from_job(job, cash.get(job.order.id)) for job in group]

    return DriverJobList(
        offers=summaries(jobs.offers),
        today=summaries(jobs.today),
        upcoming=summaries(jobs.upcoming),
        done=summaries(jobs.done),
        generated_at=now,
    )


@router.get("/{reference}", responses=_JOB_ERRORS)
async def get_job(reference: str, driver: CurrentDriver, db: DbSession) -> DriverJobDetail:
    """Return one of the driver's jobs.

    Raises:
        APIError: 404 ``order_not_found``, also for another driver's job or
            one this driver no longer holds (T-07).
    """
    job = await service.get_driver_job(db, driver_id=driver.id, reference=reference)
    return await _detail(db, job)


@router.post("/{reference}/decline", status_code=HTTPStatus.NO_CONTENT, responses=_JOB_ERRORS)
async def decline_job(
    reference: str, body: DeclineRequest, driver: CurrentDriver, db: DbSession
) -> Response:
    """Decline an offer; the order returns to the dispatcher (FR-032, row 10).

    Raises:
        APIError: 404 ``order_not_found``; 403 ``forbidden`` (already accepted).
    """
    await service.decline_offer(
        db, driver=driver, reference=reference, reason=body.reason, note=body.note
    )
    return Response(status_code=HTTPStatus.NO_CONTENT)


@router.post("/{reference}/accept", responses=_JOB_ERRORS)
async def accept_job(reference: str, driver: CurrentDriver, db: DbSession) -> DriverJobDetail:
    """Accept an offer (FR-032, row 9). Accepting twice changes nothing.

    Raises:
        APIError: 404 ``order_not_found`` when the offer is gone (J2-f).
    """
    job = await service.accept_offer(db, driver=driver, reference=reference)
    return await _detail(db, job)


@router.post("/{reference}/transition", responses=_JOB_ERRORS)
async def take_step(
    reference: str, body: TransitionRequest, driver: CurrentDriver, db: DbSession, sms: Sms
) -> DriverJobDetail | DriverJobSummary:
    """Start the job, leave for the customer, start unloading, or record a failed attempt.

    ``departed`` texts the customer that the order is dispatched (FR-050).
    ``failed`` (customer unreachable, FR-038) ends the job, so it returns
    the finished job as a ``done`` summary.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``,
            ``job_on_hold`` or ``transition_requirements_unmet``; 422
            ``validation_error``.
    """
    job = await service.take_step(
        db, driver=driver, reference=reference, step=body.to, note=body.note, sms=sms
    )
    if body.to is service.DriverStep.FAILED:
        return await _summary(db, job)
    return await _detail(db, job)


@router.post("/{reference}/arrive", responses=_JOB_ERRORS)
async def arrive(
    reference: str, body: ArriveRequest, driver: CurrentDriver, db: DbSession
) -> DriverJobDetail:
    """Record arrival at the customer (row 15, FR-038). No code is issued (#67).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            or ``job_on_hold``; 422 ``validation_error``.
    """
    job = await service.arrive(
        db, driver=driver, reference=reference, location=body.to_new_location()
    )
    return await _detail(db, job)


@router.post("/{reference}/contact-attempts", status_code=HTTPStatus.CREATED, responses=_JOB_ERRORS)
async def record_contact_attempt(
    reference: str, driver: CurrentDriver, db: DbSession
) -> DriverJobDetail:
    """Record one attempt to reach the customer, at the server's time (FR-038).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``.
    """
    job = await service.record_contact_attempt(db, driver=driver, reference=reference)
    return await _detail(db, job)


@router.post(
    "/{reference}/unloading-complete", status_code=HTTPStatus.CREATED, responses=_JOB_ERRORS
)
async def complete_unloading(
    reference: str, response: Response, driver: CurrentDriver, db: DbSession, sms: Sms
) -> DriverJobDetail:
    """Record unloading complete; the delivery code is issued and texted (#67).

    Returns 201, or 200 for a repeat (no second code). The response never
    contains the code.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            or ``job_on_hold``.
    """
    job, recorded = await service.complete_unloading(
        db, driver=driver, reference=reference, sms=sms
    )
    if not recorded:
        response.status_code = HTTPStatus.OK
    return await _detail(db, job)


@router.post(
    "/{reference}/proof",
    responses={**_JOB_ERRORS, HTTPStatus.BAD_REQUEST: {"model": ErrorResponse}},
)
async def submit_proof(
    reference: str, body: ProofRequest, response: Response, driver: CurrentDriver, db: DbSession
) -> DriverJobDetail | DriverJobSummary:
    """Complete the delivery with the customer's code, or ask for alternative proof.

    With a verified code: 200 and the finished job (``done`` summary). With
    ``alternative_proof``: 202 and the job on a ``proof_review`` hold.

    Raises:
        APIError: 404 ``order_not_found``; 400 ``delivery_code_invalid`` or
            ``delivery_code_expired``; 409 ``transition_requirements_unmet``,
            ``job_on_hold`` or ``invalid_order_transition``; 422
            ``validation_error``.
    """
    job, delivered = await service.submit_proof(
        db, driver=driver, reference=reference, proof=body.to_new_proof()
    )
    if delivered:
        return await _summary(db, job)
    response.status_code = HTTPStatus.ACCEPTED
    return await _detail(db, job)


@router.post("/{reference}/pickup", status_code=HTTPStatus.CREATED, responses=_JOB_ERRORS)
async def record_pickup(
    reference: str, body: PickupRequest, driver: CurrentDriver, db: DbSession
) -> DriverJobDetail:
    """Record the water collected at the source (FR-034, row 13).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``pickup_already_recorded``,
            ``job_on_hold`` or ``invalid_order_transition``; 422
            ``validation_error``.
    """
    job = await service.record_pickup(
        db, driver=driver, reference=reference, pickup=body.to_new_pickup()
    )
    return await _detail(db, job)


@router.post(
    "/{reference}/delivery-code",
    status_code=HTTPStatus.CREATED,
    responses={**_JOB_ERRORS, HTTPStatus.TOO_MANY_REQUESTS: {"model": ErrorResponse}},
)
async def request_new_delivery_code(
    reference: str, driver: CurrentDriver, db: DbSession, sms: Sms
) -> DriverJobDetail:
    """Send the customer a new delivery code, voiding the old one (FR-035).

    The response never contains the code. ``delivery_code.sms_status`` is
    ``failed`` when the SMS provider refused the message (FR-050).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            or ``delivery_code_still_valid``; 429 ``rate_limited``.
    """
    job = await service.issue_new_delivery_code(db, driver=driver, reference=reference, sms=sms)
    return await _detail(db, job)


@router.post("/{reference}/incidents", status_code=HTTPStatus.CREATED, responses=_JOB_ERRORS)
async def report_incident(
    reference: str, body: IncidentRequest, driver: CurrentDriver, db: DbSession
) -> IncidentRead:
    """Report a problem to the dispatcher (FR-036). Never changes the order status.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``job_not_active``; 422
            ``validation_error``.
    """
    exception, hold = await service.report_incident(
        db, driver=driver, reference=reference, incident=body.to_new_incident()
    )
    return IncidentRead(
        id=exception.id,
        order_reference=reference,
        type=IncidentType(exception.category.value),
        note=exception.note,
        new_estimated_arrival_at=exception.new_estimated_arrival_at,
        created_at=exception.created_at,
        hold=(
            HoldRead(
                kind=hold.hold_kind,
                since=hold.created_at,
                message=service.HOLD_MESSAGES[hold.hold_kind],
            )
            if hold and hold.hold_kind
            else None
        ),
    )
