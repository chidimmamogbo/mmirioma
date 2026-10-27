"""Driver job business logic (docs/api/deliveries.md, "Driver job endpoints").

A driver "job" is a ``dispatch`` :class:`Assignment`: one order offered to
one driver. The API names a job by its **order reference**. This module
answers the driver app's questions (which jobs, in which group, what may I
do now?) and performs the driver's actions: accept or decline an offer,
start the job, record a pickup, leave for the customer, arrive, record
contact attempts, start and complete unloading, prove delivery, record a
failed attempt, request a new delivery code and report an incident (part 1
and part 2, #51).

Rules implemented here:

- **Ownership (FR-001, T-07; technical lead, 2026-10-19):** a single job
  (``/driver/jobs/{reference}``) is open only to the driver on the order's
  **live** assignment. Anyone else, including a driver whose job was
  declined, withdrawn (reassigned), expired or completed, gets the same 404
  ``order_not_found`` as for a missing order, so references cannot be
  probed. The list still shows jobs completed today, summary only.
- **Groups (contract, "GET /driver/jobs"):** computed in Africa/Lagos so every
  client agrees. Offers; Today (accepted, delivery day today or earlier, so an
  overdue job stays visible); Upcoming (accepted, a later delivery day: the
  team's provision for later-day jobs); Done (ended today). A driver holds
  at most one live job (``uq_assignments_live_driver``, FR-031), so offers,
  today and upcoming together hold at most one job.
- **When a job ends:** the assignment is ``completed``, or it is still
  ``accepted`` while the order is ``delivered``, ``disputed``, ``failed`` or
  ``cancelled``. ``failed`` is not terminal for the *order* (state machine
  row 21 reschedules it), but it ends this driver's job: a rescheduled
  order is offered again as a new assignment.
- **Start on the delivery day (team decision, 2026-10-19):** ``start_job`` is
  offered only from the job's delivery day, and the start step enforces it.
- **Decline (FR-032, SRS §8):** delegated to
  :func:`app.modules.dispatch.service.decline_assignment` (row 10), which
  also stores the design's decline reason. The customer is told nothing.
- **Pickup (FR-034):** only from ``departed``, once per job. The order moves
  to ``collected`` (row 13) because the water was collected. A different
  source or a safety concern opens a ``source_review`` hold: the driver must
  not continue until staff resolve it. Less than the ordered volume opens a
  ``partial_pickup`` exception without a hold (SRS §8 partial delivery).
- **Start (row 12, FR-050):** only from the delivery day (409
  ``transition_requirements_unmet``, ``delivery_day_reached``). Starting
  texts the customer that the order is dispatched; an SMS failure never
  blocks or undoes the step.
- **Arrival (row 15, FR-038):** creates the job's ``delivery_attempts`` row
  with the server's arrival time, whether it was inside the confirmed
  window, and a GPS point only with the driver's prior consent (FR-035). No
  code is issued at arrival (#67).
- **Customer unreachable (row 19, FR-038, #55):** each contact attempt is
  recorded with the server's time. A failed attempt needs two attempts
  **and** the full 10 minutes since arrival, never earlier. It ends the job
  (assignment ``completed``) and opens a ``customer_unreachable`` exception
  (FR-036 records failed attempts as exceptions).
- **Unloading complete (#67):** a recorded step, not a status. It issues the
  delivery code and texts it to the receiver.
- **Proof (row 17, FR-035, BR-06, T-08):** with a code, the code must be
  usable (issued after unloading, not expired, replaced, used or out of its
  5 attempts) and match; a wrong code uses one attempt even though the
  request fails. Then the proof is recorded, the order is ``delivered`` and
  the job ends. With alternative proof, the proof is recorded and the job
  gets a ``proof_review`` hold for an administrator (row 18); the order
  stays ``unloading``. Less than ordered opens a ``partial_delivery``
  exception (FR-036). Payment plays no part (BR-12, T-24).
- **Repeats after the job ends (contract):** the same driver repeating the
  proof or the failed step that ended their job today gets the finished job
  back instead of 404, so a lost response never shows as "Reassigned". A
  live job for the same order takes precedence.
- **New delivery code (FR-035, 10 minutes, final):** only once unloading is
  recorded complete (#67), at most one per job per 60 seconds (team
  decision), and only when the current code is unusable or its SMS failed.
  The new code voids the old ones. If the SMS provider refuses the message,
  the code is still recorded with ``sms_status`` ``failed`` and nothing
  claims it was sent (FR-050); the driver can request another after the
  cooldown.
- **Incidents (FR-036):** recorded for the dispatcher; never change the order
  status or the customer's window. Unsafe access or transfer opens an
  ``unsafe_stop`` hold (SRS §8 "stop work"); a source concern is flagged for
  administrator review.
- **Holds:** while a job has an open hold, its next transition is refused
  with 409 ``job_on_hold``. An administrator decides and clears holds
  (:mod:`app.modules.deliveries.holds`, #93). After a rejected proof the job
  has no hold and is back at "unloading complete": the driver can send a new
  code and prove the delivery again.

Every order status change goes through the state machine
(``orders.service.transition_order``, rules in ``orders/transitions.py``),
which checks the transition, actor, reason and requirements and writes the
``order_events`` row (FR-033, NFR-004). Write functions lock the order row
first (``orders.service.lock_order``, as dispatch does) and then the
assignment, so concurrent requests cannot deadlock or both win.
"""

import logging
import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from http import HTTPStatus

from geoalchemy2 import WKTElement
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.auth.models import User
from app.modules.deliveries import codes
from app.modules.deliveries.models import (
    MAX_DELIVERY_CODE_ATTEMPTS,
    AcknowledgementMethod,
    AlternativeProofReason,
    ContactAttempt,
    DeliveryAttempt,
    DeliveryCode,
    DeliveryOutcome,
    DeliveryProof,
    ExceptionCategory,
    HoldKind,
    OrderException,
    OverrideStatus,
    PickupRecord,
    SmsStatus,
)
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import (
    LIVE_ASSIGNMENT_STATUSES,
    Assignment,
    AssignmentStatus,
    DeclineReason,
)
from app.modules.messaging.sms import SmsDeliveryError, SmsProvider
from app.modules.notifications import admin_messages
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderEvent, OrderStatus, TransitionReason
from app.modules.orders.transitions import Requirement
from app.modules.sources.models import WaterSource
from app.shared.lagos_time import LAGOS_TZ, lagos_day_start_utc
from app.shared.phone import format_phone_for_display

logger = logging.getLogger(__name__)

NEW_CODE_COOLDOWN = timedelta(seconds=60)
# FR-038: the full 10 minutes from arrival and two recorded contact attempts
# before the driver may record a failed attempt (#55: never earlier).
UNREACHABLE_WAIT = timedelta(minutes=10)
MIN_CONTACT_ATTEMPTS = 2
# Phones and servers disagree by a few seconds; a pickup time a little ahead
# of the server's clock is the driver's "now", not a future time. This is a
# technical tolerance, not a business rule.
CLOCK_SKEW_TOLERANCE = timedelta(minutes=2)
DELIVERY_AREA_MAX_LENGTH = 120

# Order statuses in which an accepted job is in progress (FR-033).
ACTIVE_ORDER_STATUSES = frozenset(
    {
        OrderStatus.ACCEPTED,
        OrderStatus.DEPARTED,
        OrderStatus.COLLECTED,
        OrderStatus.EN_ROUTE,
        OrderStatus.ARRIVED,
        OrderStatus.UNLOADING,
    }
)
# Order statuses that end the *driver's job* (see the module docstring:
# ``failed`` ends the job even though the order may be rescheduled).
JOB_ENDING_ORDER_STATUSES = frozenset(
    {OrderStatus.DELIVERED, OrderStatus.DISPUTED, OrderStatus.FAILED, OrderStatus.CANCELLED}
)
# Assignments a driver can see: live ones and finished ones. Declined,
# withdrawn and expired jobs are no longer theirs (404).
VISIBLE_ASSIGNMENT_STATUSES = (*LIVE_ASSIGNMENT_STATUSES, AssignmentStatus.COMPLETED)
UNSAFE_CATEGORIES = frozenset({ExceptionCategory.UNSAFE_ACCESS, ExceptionCategory.UNSAFE_TRANSFER})

HOLD_MESSAGES = {
    HoldKind.SOURCE_REVIEW: (
        "Waiting for dispatcher review. Do not continue until the dispatcher approves."
    ),
    HoldKind.UNSAFE_STOP: "Stop work. Do not continue. The dispatcher will arrange a safe "
    "alternative.",
    HoldKind.PROOF_REVIEW: (
        "An administrator is reviewing other proof. Do not leave until the dispatcher tells you."
    ),
}


class JobSection(StrEnum):
    """Group of the "My jobs" list (contract, ``section``)."""

    OFFER = "offer"
    TODAY = "today"
    UPCOMING = "upcoming"
    DONE = "done"


class JobStatus(StrEnum):
    """The API's ``job_status``: the visible assignment statuses.

    ``completed`` is also returned for an ``accepted`` assignment whose order
    has reached a job-ending status, so the app need not know both rules.
    """

    OFFERED = "offered"
    ACCEPTED = "accepted"
    COMPLETED = "completed"


class JobAction(StrEnum):
    """What the driver may do now (contract, ``allowed_actions``)."""

    ACCEPT = "accept"
    DECLINE = "decline"
    START_JOB = "start_job"
    RECORD_PICKUP = "record_pickup"
    LEAVE_FOR_CUSTOMER = "leave_for_customer"
    ARRIVE = "arrive"
    RECORD_CONTACT_ATTEMPT = "record_contact_attempt"
    RECORD_FAILED_ATTEMPT = "record_failed_attempt"
    START_UNLOADING = "start_unloading"
    COMPLETE_UNLOADING = "complete_unloading"
    SUBMIT_PROOF = "submit_proof"
    REQUEST_NEW_CODE = "request_new_code"
    REPORT_INCIDENT = "report_incident"
    # Added by the payments module, not by allowed_actions_for: cash may be
    # recorded after unloading, also on a delivered job or one on a proof
    # review hold (docs/api/payments.md).
    RECORD_CASH = "record_cash"


@dataclass(frozen=True)
class DriverJob:
    """Everything the driver app shows about one job.

    Attributes:
        assignment: The job's assignment row.
        order: Its order.
        source: The order's assigned water source, if set.
        job_status: API job status.
        section: Group in "My jobs", or None if the job is not listed.
        hold: Open hold on the job, if any.
        ended_at: When the job ended.
        end_reason: Reason code recorded when the order failed or was
            cancelled.
        pickup: The pickup record, if recorded.
        arrived_at: When the driver recorded arrival, if they did.
        delivery_code: The order's newest code, usable or not, if any.
        allowed_actions: Actions available now.
        unloading_completed_at: When unloading was recorded complete (#67).
        contact_attempts: Times of the contact attempts, oldest first (FR-038).
        delivered_litres: Litres delivered, once the job ended with a delivery.
    """

    assignment: Assignment
    order: Order
    source: WaterSource | None
    job_status: JobStatus
    section: JobSection | None
    hold: OrderException | None
    ended_at: datetime | None
    end_reason: str | None
    pickup: PickupRecord | None
    arrived_at: datetime | None
    delivery_code: DeliveryCode | None
    allowed_actions: list[JobAction]
    unloading_completed_at: datetime | None = None
    contact_attempts: tuple[datetime, ...] = ()
    delivered_litres: int | None = None

    @property
    def unreachable_allowed_at(self) -> datetime | None:
        """Earliest time a failed attempt may be recorded (arrival + 10 minutes)."""
        return None if self.arrived_at is None else self.arrived_at + UNREACHABLE_WAIT


@dataclass(frozen=True)
class DriverJobList:
    """The driver's listed jobs by group, each ordered as the contract says."""

    offers: list[DriverJob]
    today: list[DriverJob]
    upcoming: list[DriverJob]
    done: list[DriverJob]


@dataclass(frozen=True)
class NewPickup:
    """A validated pickup report (the router builds it from the request).

    Attributes:
        assigned_source: True if collected at the order's assigned source.
        other_source_name: Name of the other source when not assigned.
        source_reference: Optional receipt or batch number.
        volume_collected_litres: Whole litres, positive.
        picked_up_at: When it was collected (aware datetime).
        safety_concern: Whether the driver flagged a concern.
        safety_note: Description, present when ``safety_concern`` is true.
    """

    assigned_source: bool
    other_source_name: str | None
    source_reference: str | None
    volume_collected_litres: int
    picked_up_at: datetime
    safety_concern: bool
    safety_note: str | None


@dataclass(frozen=True)
class NewIncident:
    """A validated incident report.

    Attributes:
        category: One of the seven driver incident types.
        note: Optional note (required for ``other``; the schema checks it).
        new_estimated_arrival_at: Only for ``running_late``.
    """

    category: ExceptionCategory
    note: str | None
    new_estimated_arrival_at: datetime | None


@dataclass(frozen=True)
class NewLocation:
    """A GPS point the driver consented to share (FR-035).

    The request schema only builds one when ``location_consent`` is true.

    Attributes:
        latitude: WGS 84 latitude, -90 to 90.
        longitude: WGS 84 longitude, -180 to 180.
        accuracy_metres: The device's reported accuracy, if given.
    """

    latitude: float
    longitude: float
    accuracy_metres: float | None


class DriverStep(StrEnum):
    """Statuses the driver reaches with ``POST .../transition`` (contract)."""

    DEPARTED = "departed"
    EN_ROUTE = "en_route"
    UNLOADING = "unloading"
    FAILED = "failed"


@dataclass(frozen=True)
class NewProof:
    """A validated proof of delivery (FR-035).

    Exactly one of ``delivery_code`` and ``alternative_reason`` is set (the
    schema checks it).

    Attributes:
        delivered_litres: Litres actually delivered, positive.
        delivery_code: The 6 digits the customer gave the driver.
        alternative_reason: Why the code cannot be used.
        alternative_note: The driver's explanation (required for ``other``).
        location: Optional consented GPS point.
    """

    delivered_litres: int
    delivery_code: str | None
    alternative_reason: AlternativeProofReason | None
    alternative_note: str | None
    location: NewLocation | None


# --- Errors ------------------------------------------------------------------


def _order_not_found() -> APIError:
    # Same error as the state machine and dispatch (T-07).
    return APIError(HTTPStatus.NOT_FOUND, "order_not_found", "Order not found")


def _job_on_hold() -> APIError:
    return APIError(
        HTTPStatus.CONFLICT,
        "job_on_hold",
        "This job is on hold. Do not continue until the dispatcher approves.",
    )


def _invalid_transition(source: OrderStatus, target: OrderStatus | None) -> APIError:
    # Same code and details as the state machine's error (orders/transitions.py),
    # raised before calling it so the job checks (holds, pickup) run in order.
    # ``target`` is None for actions that change no status (a new code).
    details: dict[str, str] = {"from": source.value}
    if target is not None:
        details["to"] = target.value
    return APIError(
        HTTPStatus.CONFLICT,
        "invalid_order_transition",
        "This job is not at the step that allows this action.",
        details=details,
    )


def _requirements_unmet(*missing: Requirement) -> APIError:
    # Same code and details as the state machine's error (orders/transitions.py),
    # for conditions the driver job endpoints check themselves.
    return APIError(
        HTTPStatus.CONFLICT,
        "transition_requirements_unmet",
        "This step needs more information before it can be recorded.",
        details={"missing": sorted(requirement.value for requirement in missing)},
    )


def _validation_error(loc: list[str | int], msg: str) -> APIError:
    # Same shape as request validation errors (core/errors.py), for rules that
    # need the database or the current time.
    return APIError(
        HTTPStatus.UNPROCESSABLE_CONTENT,
        "validation_error",
        "Request validation failed",
        details=[{"loc": loc, "msg": msg, "type": "value_error"}],
    )


# --- Pure rules (unit tested without a database) -----------------------------


def receiver_display_name(contact_name: str) -> str:
    """Return first name and last initial, e.g. "Ngozi Adeyemi" -> "Ngozi A.".

    Drivers see no more of the customer's name than this (driver design rule).

    Args:
        contact_name: The order's receiver name.

    Returns:
        The short form; a single name is returned as it is.
    """
    parts = contact_name.split()
    if len(parts) < 2:
        return contact_name.strip()
    return f"{parts[0]} {parts[-1][0].upper()}."


def delivery_area(address: str) -> str:
    """Return the address's first line, at most 120 characters, for one-line display."""
    first_line = address.strip().splitlines()[0].strip() if address.strip() else ""
    if len(first_line) <= DELIVERY_AREA_MAX_LENGTH:
        return first_line
    return first_line[: DELIVERY_AREA_MAX_LENGTH - 1].rstrip() + "…"


def delivery_day(order: Order) -> date | None:
    """Return the Lagos calendar date of the delivery window start, if confirmed."""
    if order.delivery_window_start_at is None:
        return None
    return order.delivery_window_start_at.astimezone(LAGOS_TZ).date()


def job_status_for(assignment: Assignment, order: Order) -> JobStatus:
    """Return the API job status for a visible assignment.

    Raises:
        ValueError: For declined, withdrawn or expired assignments, which are
            never shown to the driver.
    """
    if assignment.status is AssignmentStatus.COMPLETED:
        return JobStatus.COMPLETED
    if assignment.status is AssignmentStatus.ACCEPTED:
        if order.status in JOB_ENDING_ORDER_STATUSES:
            return JobStatus.COMPLETED
        return JobStatus.ACCEPTED
    if assignment.status is AssignmentStatus.OFFERED:
        return JobStatus.OFFERED
    raise ValueError(f"assignment {assignment.status} is not visible to the driver")


def section_for(
    job_status: JobStatus,
    order: Order,
    ended_at: datetime | None,
    today: date,
) -> JobSection | None:
    """Return the job's group in "My jobs", or None if it is not listed.

    Args:
        job_status: API job status.
        order: The job's order.
        ended_at: When the job ended, for completed jobs.
        today: Today's date in Lagos.

    Returns:
        ``offer`` for an open offer; ``today`` for an accepted job due today
        or earlier, or with no confirmed window; ``upcoming`` for a later
        delivery day; ``done`` for a job that ended today; None otherwise.
    """
    if job_status is JobStatus.OFFERED:
        return JobSection.OFFER if order.status is OrderStatus.ASSIGNED else None
    if job_status is JobStatus.COMPLETED:
        if ended_at is not None and ended_at >= lagos_day_start_utc(today):
            return JobSection.DONE
        return None
    day = delivery_day(order)
    if day is not None and day > today:
        return JobSection.UPCOMING
    return JobSection.TODAY


def allowed_actions_for(
    job_status: JobStatus,
    order: Order,
    *,
    hold: OrderException | None,
    delivery_code: DeliveryCode | None,
    today: date,
    now: datetime,
    unloading_completed_at: datetime | None = None,
    contact_attempt_count: int = 0,
    unreachable_allowed_at: datetime | None = None,
) -> list[JobAction]:
    """Return what the driver may do now (contract, ``allowed_actions``).

    One primary action per step (driver design A1), plus a problem report on
    every active job. While a hold is open only a report is possible. The
    server still validates every request; this list only guides the app.

    Two actions depend on the clock, so the app fetches the job again when
    ``unreachable_allowed_at`` or the code's ``expires_at`` passes (contract,
    "allowed_actions timing"):

    - ``record_failed_attempt`` only after two contact attempts **and** the
      full 10 minutes since arrival (FR-038, #55).
    - ``request_new_code`` only once unloading is recorded complete (the
      code is issued then, #67) and a new code would be accepted.

    Args:
        job_status: API job status.
        order: The job's order.
        hold: Open hold, if any.
        delivery_code: Newest delivery code for the order, if any.
        today: Today's date in Lagos.
        now: Current time.
        unloading_completed_at: When unloading was recorded complete.
        contact_attempt_count: Contact attempts recorded since arrival.
        unreachable_allowed_at: Arrival plus 10 minutes, once arrived.

    Returns:
        Allowed actions in display order.
    """
    if job_status is JobStatus.OFFERED:
        if order.status is OrderStatus.ASSIGNED:
            return [JobAction.ACCEPT, JobAction.DECLINE]
        return []
    if job_status is not JobStatus.ACCEPTED or order.status not in ACTIVE_ORDER_STATUSES:
        return []
    if hold is not None:
        return [JobAction.REPORT_INCIDENT]

    actions: list[JobAction] = []
    status = order.status
    if status is OrderStatus.ACCEPTED:
        day = delivery_day(order)
        # Start only on the delivery day (team decision, 2026-10-19).
        if day is None or day <= today:
            actions.append(JobAction.START_JOB)
    elif status is OrderStatus.DEPARTED:
        actions.append(JobAction.RECORD_PICKUP)
    elif status is OrderStatus.COLLECTED:
        actions.append(JobAction.LEAVE_FOR_CUSTOMER)
    elif status is OrderStatus.EN_ROUTE:
        actions.append(JobAction.ARRIVE)
    elif status is OrderStatus.ARRIVED:
        actions.extend([JobAction.START_UNLOADING, JobAction.RECORD_CONTACT_ATTEMPT])
        if (
            contact_attempt_count >= MIN_CONTACT_ATTEMPTS
            and unreachable_allowed_at is not None
            and now >= unreachable_allowed_at
        ):
            actions.append(JobAction.RECORD_FAILED_ATTEMPT)
    elif status is OrderStatus.UNLOADING:
        if unloading_completed_at is None:
            actions.append(JobAction.COMPLETE_UNLOADING)
        else:
            actions.append(JobAction.SUBMIT_PROOF)
            if codes.new_code_allowed(delivery_code, now):
                actions.append(JobAction.REQUEST_NEW_CODE)
    actions.append(JobAction.REPORT_INCIDENT)
    return actions


# --- Loading -----------------------------------------------------------------


async def _latest_events(
    session: AsyncSession, order_ids: Sequence[uuid.UUID], statuses: frozenset[OrderStatus]
) -> dict[uuid.UUID, OrderEvent]:
    """Return each order's newest event that moved it into one of ``statuses``."""
    if not order_ids:
        return {}
    events = await session.scalars(
        select(OrderEvent)
        .where(OrderEvent.order_id.in_(order_ids), OrderEvent.to_status.in_(statuses))
        .order_by(OrderEvent.created_at)
    )
    # Ordered oldest first, so later events overwrite earlier ones.
    return {event.order_id: event for event in events}


async def _build_jobs(
    session: AsyncSession,
    rows: Sequence[tuple[Assignment, Order]],
    *,
    now: datetime,
) -> list[DriverJob]:
    """Load the related rows for many jobs in a few queries and build them."""
    if not rows:
        return []
    today = now.astimezone(LAGOS_TZ).date()
    assignment_ids = [assignment.id for assignment, _ in rows]
    order_ids = [order.id for _, order in rows]
    source_ids = {order.source_id for _, order in rows if order.source_id is not None}

    sources = {
        source.id: source
        for source in await session.scalars(
            select(WaterSource).where(WaterSource.id.in_(source_ids))
        )
    }
    holds: dict[uuid.UUID, OrderException] = {}
    for exception in await session.scalars(
        select(OrderException)
        .where(
            OrderException.assignment_id.in_(assignment_ids),
            OrderException.hold_kind.is_not(None),
            OrderException.resolved_at.is_(None),
        )
        .order_by(OrderException.created_at)
    ):
        if exception.assignment_id is not None:
            holds[exception.assignment_id] = exception
    pickups = {
        pickup.assignment_id: pickup
        for pickup in await session.scalars(
            select(PickupRecord).where(PickupRecord.assignment_id.in_(assignment_ids))
        )
    }
    latest_codes: dict[uuid.UUID, DeliveryCode] = {}
    for code in await session.scalars(
        select(DeliveryCode)
        .where(DeliveryCode.order_id.in_(order_ids))
        .order_by(DeliveryCode.issued_at)
    ):
        latest_codes[code.order_id] = code
    ending_events = await _latest_events(session, order_ids, JOB_ENDING_ORDER_STATUSES)
    arrived_events = await _latest_events(session, order_ids, frozenset({OrderStatus.ARRIVED}))
    attempts = {
        attempt.assignment_id: attempt
        for attempt in await session.scalars(
            select(DeliveryAttempt).where(DeliveryAttempt.assignment_id.in_(assignment_ids))
        )
    }
    contact_times: dict[uuid.UUID, list[datetime]] = {}
    if attempts:
        for contact in await session.scalars(
            select(ContactAttempt)
            .where(
                ContactAttempt.delivery_attempt_id.in_(
                    [attempt.id for attempt in attempts.values()]
                )
            )
            .order_by(ContactAttempt.attempted_at, ContactAttempt.id)
        ):
            contact_times.setdefault(contact.delivery_attempt_id, []).append(contact.attempted_at)
    # Only a code-verified proof, or alternative proof an administrator
    # approved (row 18), delivered the order. Pending or rejected alternative
    # proof does not count.
    delivered = {
        proof.assignment_id: proof.delivered_litres
        for proof in await session.scalars(
            select(DeliveryProof)
            .where(
                DeliveryProof.assignment_id.in_(assignment_ids),
                or_(
                    DeliveryProof.method == AcknowledgementMethod.DELIVERY_CODE,
                    DeliveryProof.override_status == OverrideStatus.APPROVED,
                ),
            )
            .order_by(DeliveryProof.created_at)
        )
    }

    jobs: list[DriverJob] = []
    for assignment, order in rows:
        job_status = job_status_for(assignment, order)
        ending_event = ending_events.get(order.id) if job_status is JobStatus.COMPLETED else None
        ended_at = assignment.ended_at or (ending_event.created_at if ending_event else None)
        hold = holds.get(assignment.id)
        code = latest_codes.get(order.id)
        attempt = attempts.get(assignment.id)
        arrived_at = _arrival_time(assignment, attempt, arrived_events.get(order.id))
        contacts = tuple(contact_times.get(attempt.id, [])) if attempt else ()
        unloading_completed_at = attempt.unloading_completed_at if attempt else None
        jobs.append(
            DriverJob(
                assignment=assignment,
                order=order,
                source=sources.get(order.source_id) if order.source_id else None,
                job_status=job_status,
                section=section_for(job_status, order, ended_at, today),
                hold=hold,
                ended_at=ended_at,
                end_reason=(
                    ending_event.reason_code.value
                    if ending_event is not None
                    and ending_event.reason_code is not None
                    and ending_event.to_status in {OrderStatus.FAILED, OrderStatus.CANCELLED}
                    else None
                ),
                pickup=pickups.get(assignment.id),
                arrived_at=arrived_at,
                delivery_code=code,
                allowed_actions=allowed_actions_for(
                    job_status,
                    order,
                    hold=hold,
                    delivery_code=code,
                    today=today,
                    now=now,
                    unloading_completed_at=unloading_completed_at,
                    contact_attempt_count=len(contacts),
                    unreachable_allowed_at=(
                        arrived_at + UNREACHABLE_WAIT if arrived_at is not None else None
                    ),
                ),
                unloading_completed_at=unloading_completed_at,
                contact_attempts=contacts,
                delivered_litres=(
                    delivered.get(assignment.id) if job_status is JobStatus.COMPLETED else None
                ),
            )
        )
    return jobs


def _arrival_time(
    assignment: Assignment, attempt: DeliveryAttempt | None, arrived_event: OrderEvent | None
) -> datetime | None:
    """When this job arrived: its delivery attempt, else an ``arrived`` event of this job.

    The event fallback covers an arrival a dispatcher recorded for the driver
    (row 15, ``recorded_for_driver``), which creates no delivery attempt. An
    event older than the assignment belongs to an earlier job on the same
    order (a reschedule) and is ignored.
    """
    if attempt is not None:
        return attempt.arrived_at
    if arrived_event is not None and arrived_event.created_at >= assignment.created_at:
        return arrived_event.created_at
    return None


def _window_sort_key(job: DriverJob) -> tuple[bool, datetime]:
    # Jobs without a confirmed window sort last within their group.
    start = job.order.delivery_window_start_at
    return (start is None, start or datetime.max.replace(tzinfo=UTC))


async def list_driver_jobs(
    session: AsyncSession, *, driver_id: uuid.UUID, now: datetime | None = None
) -> DriverJobList:
    """Return the driver's jobs grouped for "My jobs" (contract, GET /driver/jobs).

    Args:
        session: Database session.
        driver_id: The signed-in driver.
        now: Current time, for tests.

    Returns:
        Offers, today, upcoming (window start, earliest first) and done
        (ended time, newest first). Jobs that ended before today are not
        included.
    """
    now = now or datetime.now(UTC)
    today_start = lagos_day_start_utc(now.astimezone(LAGOS_TZ).date())
    rows = (
        await session.execute(
            select(Assignment, Order)
            .join(Order, Order.id == Assignment.order_id)
            .where(
                Assignment.driver_user_id == driver_id,
                Assignment.status.in_(VISIBLE_ASSIGNMENT_STATUSES),
                # Cheap pre-filter for finished work: a job that ended before
                # today was last changed before today. The exact rule is in
                # section_for.
                or_(
                    and_(
                        Assignment.status.in_(LIVE_ASSIGNMENT_STATUSES),
                        Order.status.not_in(JOB_ENDING_ORDER_STATUSES),
                    ),
                    Assignment.updated_at >= today_start,
                    Order.updated_at >= today_start,
                ),
            )
        )
    ).all()
    jobs = await _build_jobs(session, [(row[0], row[1]) for row in rows], now=now)

    def in_section(section: JobSection) -> list[DriverJob]:
        return [job for job in jobs if job.section is section]

    done = in_section(JobSection.DONE)
    done.sort(key=lambda job: job.ended_at or now, reverse=True)
    return DriverJobList(
        offers=sorted(in_section(JobSection.OFFER), key=_window_sort_key),
        today=sorted(in_section(JobSection.TODAY), key=_window_sort_key),
        upcoming=sorted(in_section(JobSection.UPCOMING), key=_window_sort_key),
        done=done,
    )


async def _order_by_reference(session: AsyncSession, reference: str) -> Order:
    order = await session.scalar(select(Order).where(Order.reference == reference))
    if order is None:
        raise _order_not_found()
    return order


async def _drivers_assignment(
    session: AsyncSession, *, order_id: uuid.UUID, driver_id: uuid.UUID, lock: bool
) -> Assignment:
    """The driver's live assignment for an order, or 404 (T-07; lead decision 2026-10-19)."""
    query = (
        select(Assignment)
        .where(
            Assignment.order_id == order_id,
            Assignment.driver_user_id == driver_id,
            Assignment.status.in_(LIVE_ASSIGNMENT_STATUSES),
        )
        .order_by(Assignment.created_at.desc())
        .limit(1)
    )
    assignment = await session.scalar(query.with_for_update() if lock else query)
    if assignment is None:
        raise _order_not_found()
    return assignment


async def get_driver_job(
    session: AsyncSession,
    *,
    driver_id: uuid.UUID,
    reference: str,
    now: datetime | None = None,
) -> DriverJob:
    """Return one of the driver's jobs (contract, GET /driver/jobs/{reference}).

    Args:
        session: Database session.
        driver_id: The signed-in driver.
        reference: Order reference.
        now: Current time, for tests.

    Returns:
        The job: an offer or an accepted job (possibly just ended, before
        dispatch marks it completed).

    Raises:
        APIError: 404 ``order_not_found`` for a missing order, another
            driver's, or any job this driver no longer holds live (declined,
            withdrawn, expired or completed).
    """
    now = now or datetime.now(UTC)
    order = await _order_by_reference(session, reference)
    assignment = await _drivers_assignment(
        session, order_id=order.id, driver_id=driver_id, lock=False
    )
    return (await _build_jobs(session, [(assignment, order)], now=now))[0]


@dataclass(frozen=True)
class DriversJobOnOrder:
    """A driver's newest visible job on an order, for the payments module.

    Attributes:
        assignment_id: The job's assignment.
        unloading_completed_at: When this job recorded unloading complete;
            None if it has not.
    """

    assignment_id: uuid.UUID
    unloading_completed_at: datetime | None


async def drivers_job_on_order(
    session: AsyncSession, *, order_id: uuid.UUID, driver_id: uuid.UUID
) -> DriversJobOnOrder | None:
    """The driver's newest live or finished job on the order, with its unloading time.

    Cash is recorded by the driver whose job unloaded the water (BR-15),
    also after the job ended with a delivery, when ``GET
    /driver/jobs/{reference}`` no longer returns it.

    Args:
        session: Database session.
        order_id: The order.
        driver_id: The driver (``users.id``).

    Returns:
        None when the driver holds no live or finished job on the order
        (declined, withdrawn and expired jobs are not theirs).
    """
    row = (
        await session.execute(
            select(Assignment.id, DeliveryAttempt.unloading_completed_at)
            .outerjoin(DeliveryAttempt, DeliveryAttempt.assignment_id == Assignment.id)
            .where(
                Assignment.order_id == order_id,
                Assignment.driver_user_id == driver_id,
                Assignment.status.in_(VISIBLE_ASSIGNMENT_STATUSES),
            )
            .order_by(Assignment.created_at.desc())
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    return DriversJobOnOrder(assignment_id=row[0], unloading_completed_at=row[1])


async def _lock_live_job(
    session: AsyncSession, *, driver_id: uuid.UUID, reference: str
) -> tuple[Assignment, Order]:
    """Lock the order (first, as dispatch does), then the driver's live assignment.

    Raises:
        APIError: 404 ``order_not_found`` unless the driver holds a live
            (offered or accepted) assignment for the order.
    """
    found = await _order_by_reference(session, reference)
    order = await orders_service.lock_order(session, found.id)
    assignment = await session.scalar(
        select(Assignment)
        .where(
            Assignment.order_id == order.id,
            Assignment.driver_user_id == driver_id,
            Assignment.status.in_(LIVE_ASSIGNMENT_STATUSES),
        )
        .with_for_update()
    )
    if assignment is None:
        raise _order_not_found()
    return assignment, order


async def _open_hold(session: AsyncSession, assignment_id: uuid.UUID) -> OrderException | None:
    return await session.scalar(
        select(OrderException)
        .where(
            OrderException.assignment_id == assignment_id,
            OrderException.hold_kind.is_not(None),
            OrderException.resolved_at.is_(None),
        )
        .order_by(OrderException.created_at.desc())
        .limit(1)
    )


# --- Actions -----------------------------------------------------------------


async def decline_offer(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    reason: DeclineReason,
    note: str | None,
) -> None:
    """Decline an open offer and return the order to the dispatcher. Commits.

    Delegates to :func:`app.modules.dispatch.service.decline_assignment`
    (row 10, reason code ``driver_declined``), which stores the reason and
    note on the assignment and in the event note.

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        reason: Why the driver declines.
        note: Optional note (required for ``other``; the schema checks it).

    Raises:
        APIError: 404 ``order_not_found`` if the order is not offered to this
            driver (including an offer already declined or withdrawn);
            403 ``forbidden`` if the driver already accepted (row 11 is the dispatcher's).
    """
    order = await _order_by_reference(session, reference)
    await dispatch_service.decline_assignment(
        session, order_id=order.id, driver=driver, note=note, reason=reason
    )


async def record_pickup(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    pickup: NewPickup,
    now: datetime | None = None,
) -> DriverJob:
    """Record the water collected and move the order to ``collected``. Commits.

    See the module docstring for the review hold and partial-pickup rules
    (FR-034, SRS §8).

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        pickup: Validated pickup details.
        now: Current time, for tests.

    Returns:
        The updated job.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``pickup_already_recorded``;
            409 ``job_on_hold``; 409 ``invalid_order_transition`` unless the
            job is accepted and the order is ``departed``;
            422 ``validation_error`` for a pickup time in the future or
            before the job started, or "assigned source" on an order with
            no assigned source.
    """
    now = now or datetime.now(UTC)
    assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    existing = await session.scalar(
        select(PickupRecord.id).where(PickupRecord.assignment_id == assignment.id)
    )
    if existing is not None:
        raise APIError(
            HTTPStatus.CONFLICT,
            "pickup_already_recorded",
            "A pickup is already recorded for this job. Ask the dispatcher to correct it.",
        )
    if assignment.status is not AssignmentStatus.ACCEPTED:
        raise _invalid_transition(order.status, OrderStatus.COLLECTED)
    if await _open_hold(session, assignment.id) is not None:
        raise _job_on_hold()
    if order.status is not OrderStatus.DEPARTED:
        raise _invalid_transition(order.status, OrderStatus.COLLECTED)

    if pickup.picked_up_at > now + CLOCK_SKEW_TOLERANCE:
        raise _validation_error(["body", "picked_up_at"], "Pickup time cannot be in the future")
    departed = (await _latest_events(session, [order.id], frozenset({OrderStatus.DEPARTED}))).get(
        order.id
    )
    if departed is not None and pickup.picked_up_at < departed.created_at:
        raise _validation_error(
            ["body", "picked_up_at"], "Pickup time cannot be before the job started"
        )
    if pickup.assigned_source and order.source_id is None:
        raise _validation_error(
            ["body", "source", "assigned"],
            "This job has no assigned source. Enter the name of the source you used.",
        )

    session.add(
        PickupRecord(
            assignment_id=assignment.id,
            order_id=order.id,
            source_id=order.source_id if pickup.assigned_source else None,
            other_source_name=None if pickup.assigned_source else pickup.other_source_name,
            source_reference=pickup.source_reference,
            volume_collected_litres=pickup.volume_collected_litres,
            picked_up_at=pickup.picked_up_at,
            safety_concern=pickup.safety_concern,
            safety_note=pickup.safety_note,
            recorded_by=driver.id,
        )
    )
    # Row 13: departed -> collected needs the pickup record added above, in
    # this transaction (commit=False).
    await orders_service.transition_order(
        session,
        order_id=order.id,
        target=OrderStatus.COLLECTED,
        actor=driver,
        satisfied={Requirement.PICKUP_RECORDED},
        assigned_driver_id=assignment.driver_user_id,
        commit=False,
    )

    def open_exception(
        category: ExceptionCategory, note: str | None, hold: HoldKind | None
    ) -> None:
        session.add(
            OrderException(
                order_id=order.id,
                assignment_id=assignment.id,
                category=category,
                note=note,
                hold_kind=hold,
                reported_by=driver.id,
            )
        )

    # FR-034: a source mismatch or a safety concern needs dispatcher review
    # before the driver continues.
    if not pickup.assigned_source:
        open_exception(
            ExceptionCategory.SOURCE_MISMATCH,
            f"Collected at another source: {pickup.other_source_name}",
            HoldKind.SOURCE_REVIEW,
        )
    if pickup.safety_concern:
        open_exception(
            ExceptionCategory.PICKUP_SAFETY_CONCERN, pickup.safety_note, HoldKind.SOURCE_REVIEW
        )
    # SRS §8 partial delivery: recorded for follow-up; the driver continues.
    if pickup.volume_collected_litres < order.quantity_litres:
        open_exception(
            ExceptionCategory.PARTIAL_PICKUP,
            f"Collected {pickup.volume_collected_litres} L of {order.quantity_litres} L ordered",
            None,
        )
    # One admin message for the pickup, even if it opened two holds.
    if not pickup.assigned_source or pickup.safety_concern:
        await admin_messages.hold_opened(session, order_id=order.id, reference=order.reference)
    await session.commit()
    return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)


async def issue_new_delivery_code(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    sms: SmsProvider,
    now: datetime | None = None,
) -> DriverJob:
    """Issue a replacement delivery code and send it to the receiver. Commits.

    See the module docstring for when a new code is allowed (FR-035; valid
    10 minutes). The code itself leaves the server only in the SMS.

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        sms: SMS provider.
        now: Current time, for tests.

    Returns:
        The updated job; ``delivery_code.sms_status`` tells whether the
        provider accepted the message.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            unless the job is accepted and the order is ``unloading``; 409
            ``transition_requirements_unmet`` (``unloading_confirmed``)
            before unloading is recorded complete (#67); 429
            ``rate_limited`` with ``retry_after_seconds`` within 60 seconds
            of the last code; 409 ``delivery_code_still_valid`` while the
            current code is usable and was sent.
    """
    now = now or datetime.now(UTC)
    assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    if (
        assignment.status is not AssignmentStatus.ACCEPTED
        or order.status is not OrderStatus.UNLOADING
    ):
        raise _invalid_transition(order.status, None)
    attempt = await _delivery_attempt(session, assignment.id)
    if attempt is None or attempt.unloading_completed_at is None:
        # The code is issued only after unloading (FR-035, #67).
        raise _requirements_unmet(Requirement.UNLOADING_CONFIRMED)

    current = await _newest_code(session, order.id)
    if current is not None and current.issued_at > now - NEW_CODE_COOLDOWN:
        seconds = max(1, math.ceil((current.issued_at + NEW_CODE_COOLDOWN - now).total_seconds()))
        raise APIError(
            HTTPStatus.TOO_MANY_REQUESTS,
            "rate_limited",
            "Please wait a moment before sending another code.",
            details={"retry_after_seconds": seconds},
            headers={"Retry-After": str(seconds)},
        )
    if not codes.new_code_allowed(current, now):
        raise APIError(
            HTTPStatus.CONFLICT,
            "delivery_code_still_valid",
            "The customer's current code still works. Ask them for it.",
        )

    await _issue_code(session, order=order, issued_by=driver, sms=sms, now=now)
    await session.commit()
    return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)


async def _newest_code(session: AsyncSession, order_id: uuid.UUID) -> DeliveryCode | None:
    return await session.scalar(
        select(DeliveryCode)
        .where(DeliveryCode.order_id == order_id)
        .order_by(DeliveryCode.issued_at.desc())
        .limit(1)
    )


async def _issue_code(
    session: AsyncSession, *, order: Order, issued_by: User, sms: SmsProvider, now: datetime
) -> DeliveryCode:
    """Void the order's codes, store a new one and text it to the receiver.

    Does not commit. The code itself leaves this function only in the SMS.

    Returns:
        The new code row; ``sms_status`` says whether the provider accepted
        the message (FR-050: nothing claims a failed message was sent).
    """
    # Only the newest code may work (FR-035).
    await session.execute(
        update(DeliveryCode)
        .where(DeliveryCode.order_id == order.id, DeliveryCode.invalidated_at.is_(None))
        .values(invalidated_at=now, updated_at=now)
    )
    code = codes.generate_code()
    code_id = uuid.uuid4()
    # Stored as "failed" and flushed before sending, so a database error can
    # never leave the customer holding a code that was not recorded.
    delivery_code = DeliveryCode(
        id=code_id,
        order_id=order.id,
        code_hash=codes.hash_code(code_id, code),
        issued_at=now,
        expires_at=now + codes.CODE_LIFETIME,
        attempts=0,
        sms_status=SmsStatus.FAILED,
        issued_by=issued_by.id,
    )
    session.add(delivery_code)
    await session.flush()
    try:
        await sms.send(phone=order.contact_phone, text=codes.code_message(code))
        delivery_code.sms_status = SmsStatus.ACCEPTED
    except SmsDeliveryError:
        # FR-050: nothing claims the code was sent. The driver sees the
        # failure and may request another code once the 60-second cooldown
        # has passed.
        pass
    return delivery_code


async def report_incident(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    incident: NewIncident,
    now: datetime | None = None,
) -> tuple[OrderException, OrderException | None]:
    """Record a driver's problem report for the dispatcher. Commits.

    See the module docstring for holds and review flags (FR-036, SRS §8).

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        incident: Validated report.
        now: Current time, for tests.

    Returns:
        The new exception and the job's open hold after the report.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``job_not_active`` unless the
            job is accepted and its order in progress; 422
            ``validation_error`` for a new arrival time in the past.
    """
    now = now or datetime.now(UTC)
    assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    if (
        assignment.status is not AssignmentStatus.ACCEPTED
        or order.status not in ACTIVE_ORDER_STATUSES
    ):
        raise APIError(
            HTTPStatus.CONFLICT,
            "job_not_active",
            "You can report a problem only on a job you accepted that has not ended",
        )
    if (
        incident.new_estimated_arrival_at is not None
        and incident.new_estimated_arrival_at < now - CLOCK_SKEW_TOLERANCE
    ):
        raise _validation_error(
            ["body", "new_estimated_arrival_at"], "The new arrival time cannot be in the past"
        )
    exception = OrderException(
        order_id=order.id,
        assignment_id=assignment.id,
        category=incident.category,
        note=incident.note,
        new_estimated_arrival_at=incident.new_estimated_arrival_at,
        hold_kind=HoldKind.UNSAFE_STOP if incident.category in UNSAFE_CATEGORIES else None,
        requires_admin_review=incident.category is ExceptionCategory.SOURCE_CONCERN,
        reported_by=driver.id,
        created_at=now,
        updated_at=now,
    )
    session.add(exception)
    if exception.hold_kind is not None:
        await admin_messages.hold_opened(session, order_id=order.id, reference=order.reference)
    await session.commit()
    return exception, await _open_hold(session, assignment.id)


# --- Part 2: accept, steps, arrival, unloading complete, proof (#51, #75) ------

# The status each driver step starts from (contract, "POST .../transition").
_STEP_SOURCES = {
    DriverStep.DEPARTED: OrderStatus.ACCEPTED,
    DriverStep.EN_ROUTE: OrderStatus.COLLECTED,
    DriverStep.UNLOADING: OrderStatus.ARRIVED,
    DriverStep.FAILED: OrderStatus.ARRIVED,
}


def dispatched_message(reference: str) -> str:
    """SMS text telling the customer their order is dispatched (FR-050, ``departed``).

    Templates carry the support number and promise nothing that is not
    verified: no arrival time, no water-quality claim.

    Args:
        reference: The order reference.

    Returns:
        One SMS (under 160 characters).
    """
    support = format_phone_for_display(get_settings().support_phone)
    return (
        f"MmiriOma: your order {reference} is dispatched. Your driver has started "
        f"the delivery. Help: {support}"
    )


def within_window(order: Order, at: datetime) -> bool | None:
    """Whether ``at`` falls inside the order's confirmed delivery window.

    Recorded at arrival because a redelivery fee may apply only when the
    driver arrived inside the window (FR-038, BR-14).

    Returns:
        None when the order has no confirmed window.
    """
    start, end = order.delivery_window_start_at, order.delivery_window_end_at
    if start is None or end is None:
        return None
    return start <= at <= end


def _point(location: NewLocation | None) -> WKTElement | None:
    # PostGIS writes points as longitude, then latitude.
    if location is None:
        return None
    return WKTElement(f"POINT({location.longitude} {location.latitude})", srid=4326)


async def _delivery_attempt(
    session: AsyncSession, assignment_id: uuid.UUID
) -> DeliveryAttempt | None:
    return await session.scalar(
        select(DeliveryAttempt).where(DeliveryAttempt.assignment_id == assignment_id)
    )


async def _attempt_or_create(
    session: AsyncSession, *, assignment: Assignment, order: Order, actor: User, now: datetime
) -> DeliveryAttempt:
    """The job's delivery attempt, created if a dispatcher recorded the arrival.

    A dispatcher recording the arrival for an offline driver (row 15,
    ``recorded_for_driver``) creates no attempt; the attempt then takes the
    time of that arrival event, so the 10-minute wait still counts from the
    real arrival.
    """
    attempt = await _delivery_attempt(session, assignment.id)
    if attempt is not None:
        return attempt
    event = (await _latest_events(session, [order.id], frozenset({OrderStatus.ARRIVED}))).get(
        order.id
    )
    arrived_at = _arrival_time(assignment, None, event) or now
    attempt = DeliveryAttempt(
        assignment_id=assignment.id,
        order_id=order.id,
        arrived_at=arrived_at,
        within_window=within_window(order, arrived_at),
        recorded_by=actor.id,
    )
    session.add(attempt)
    await session.flush()
    return attempt


async def _contact_attempt_count(session: AsyncSession, attempt: DeliveryAttempt) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(ContactAttempt)
        .where(ContactAttempt.delivery_attempt_id == attempt.id)
    )
    return count or 0


async def _finished_job(
    session: AsyncSession,
    *,
    driver_id: uuid.UUID,
    reference: str,
    outcome: DeliveryOutcome,
    now: datetime,
) -> DriverJob | None:
    """The job a repeated proof or failed step already ended, if it ended today.

    Called only when the driver holds no live job for the order, so a live
    job always takes precedence (contract, "Repeats after the job ends").

    Returns:
        The finished job (section ``done``), or None if this driver's job on
        the order did not end with ``outcome`` today.
    """
    # Release the order lock taken while looking for a live job.
    await session.rollback()
    order = await session.scalar(select(Order).where(Order.reference == reference))
    if order is None:
        return None
    assignment = await session.scalar(
        select(Assignment)
        .join(DeliveryAttempt, DeliveryAttempt.assignment_id == Assignment.id)
        .where(
            Assignment.order_id == order.id,
            Assignment.driver_user_id == driver_id,
            Assignment.status == AssignmentStatus.COMPLETED,
            DeliveryAttempt.outcome == outcome,
        )
        .order_by(Assignment.ended_at.desc())
        .limit(1)
    )
    if assignment is None:
        return None
    job = (await _build_jobs(session, [(assignment, order)], now=now))[0]
    return job if job.section is JobSection.DONE else None


def _end_job(
    assignment: Assignment, attempt: DeliveryAttempt, outcome: DeliveryOutcome, now: datetime
) -> None:
    assignment.status = AssignmentStatus.COMPLETED
    assignment.ended_at = now
    attempt.outcome = outcome


def _record_partial_delivery(
    session: AsyncSession, *, assignment: Assignment, order: Order, litres: int, driver: User
) -> None:
    # FR-035, FR-036: a partial delivery is recorded as an exception for the
    # dispatcher; it does not stop the delivery.
    if litres < order.quantity_litres:
        session.add(
            OrderException(
                order_id=order.id,
                assignment_id=assignment.id,
                category=ExceptionCategory.PARTIAL_DELIVERY,
                note=f"Delivered {litres} L of {order.quantity_litres} L ordered",
                reported_by=driver.id,
            )
        )


async def _send_dispatched(sms: SmsProvider, order: Order) -> None:
    try:
        await sms.send(phone=order.contact_phone, text=dispatched_message(order.reference))
    except SmsDeliveryError:
        # FR-050: a channel failure never changes the order. The reference is
        # not personal data; the phone number is never logged.
        logger.warning("Dispatched SMS for order %s was not accepted", order.reference)


async def accept_offer(
    session: AsyncSession, *, driver: User, reference: str, now: datetime | None = None
) -> DriverJob:
    """The offered driver accepts (row 9, FR-032). Commits.

    Delegates to :func:`app.modules.dispatch.service.accept_assignment`.
    Accepting twice returns the job unchanged with no second event.

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        now: Current time, for tests.

    Returns:
        The accepted job; ``receiver`` is shown from now on.

    Raises:
        APIError: 404 ``order_not_found`` if the offer is gone (declined,
            withdrawn) or was never this driver's (T-07).
    """
    now = now or datetime.now(UTC)
    order = await _order_by_reference(session, reference)
    await dispatch_service.accept_assignment(session, order_id=order.id, driver=driver)
    return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)


async def take_step(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    step: DriverStep,
    note: str | None,
    sms: SmsProvider,
    now: datetime | None = None,
) -> DriverJob:
    """Make one of the driver's plain steps (rows 12, 14, 16, 19). Commits.

    See the module docstring for the start rule (delivery day, dispatched
    SMS) and the customer-unreachable rule (FR-038). Repeating the step just
    made returns the job unchanged; repeating a failed attempt that already
    ended the job returns the finished job.

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        step: Target status.
        note: Optional note, saved on the event.
        sms: SMS provider, for the dispatched message.
        now: Current time, for tests.

    Returns:
        The job; for ``failed`` the finished job (section ``done``).

    Raises:
        APIError: 404 ``order_not_found``; 409 ``job_on_hold``; 409
            ``invalid_order_transition``; 409 ``transition_requirements_unmet``
            (``delivery_day_reached``, ``contact_attempts_recorded``,
            ``unreachable_wait_elapsed``); 422 ``validation_error`` (note).
    """
    now = now or datetime.now(UTC)
    target = OrderStatus(step.value)
    try:
        assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    except APIError as error:
        if step is DriverStep.FAILED and error.status_code == HTTPStatus.NOT_FOUND:
            finished = await _finished_job(
                session,
                driver_id=driver.id,
                reference=reference,
                outcome=DeliveryOutcome.FAILED,
                now=now,
            )
            if finished is not None:
                return finished
        raise
    if assignment.status is not AssignmentStatus.ACCEPTED:
        raise _invalid_transition(order.status, target)

    # A repeat of the step just made skips the checks; the state machine
    # returns the order unchanged if the latest event is this driver's.
    repeat = order.status is target
    if not repeat:
        if await _open_hold(session, assignment.id) is not None:
            raise _job_on_hold()
        if order.status is not _STEP_SOURCES[step]:
            raise _invalid_transition(order.status, target)
    if step is DriverStep.DEPARTED and not repeat:
        day = delivery_day(order)
        if day is not None and day > now.astimezone(LAGOS_TZ).date():
            raise _requirements_unmet(Requirement.DELIVERY_DAY_REACHED)

    satisfied: set[Requirement] = set()
    reason: TransitionReason | None = None
    attempt: DeliveryAttempt | None = None
    contacts = 0
    if step is DriverStep.FAILED:
        attempt = await _attempt_or_create(
            session, assignment=assignment, order=order, actor=driver, now=now
        )
        contacts = await _contact_attempt_count(session, attempt)
        if contacts >= MIN_CONTACT_ATTEMPTS:
            satisfied.add(Requirement.CONTACT_ATTEMPTS_RECORDED)
        if now >= attempt.arrived_at + UNREACHABLE_WAIT:
            satisfied.add(Requirement.UNREACHABLE_WAIT_ELAPSED)
        reason = TransitionReason.CUSTOMER_UNREACHABLE

    await orders_service.transition_order(
        session,
        order_id=order.id,
        target=target,
        actor=driver,
        satisfied=satisfied,
        reason_code=reason,
        note=note,
        assigned_driver_id=assignment.driver_user_id,
        commit=False,
    )
    if attempt is not None:
        _end_job(assignment, attempt, DeliveryOutcome.FAILED, now)
        session.add(
            OrderException(
                order_id=order.id,
                assignment_id=assignment.id,
                category=ExceptionCategory.CUSTOMER_UNREACHABLE,
                note=note or f"Customer unreachable after {contacts} contact attempts",
                reported_by=driver.id,
            )
        )
        await session.commit()
        return (await _build_jobs(session, [(assignment, order)], now=now))[0]

    await session.commit()
    if step is DriverStep.DEPARTED and not repeat:
        # After the commit: the step stands whatever the SMS provider does.
        await _send_dispatched(sms, order)
    return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)


async def arrive(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    location: NewLocation | None,
    now: datetime | None = None,
) -> DriverJob:
    """Record the driver's arrival (row 15, FR-038). Commits.

    Creates the job's delivery attempt with the server's time. No delivery
    code is issued (#67). Repeating returns the job unchanged.

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        location: Optional GPS point, only with the driver's consent (FR-035).
        now: Current time, for tests.

    Returns:
        The job, now ``arrived``.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``job_on_hold``; 409
            ``invalid_order_transition`` unless the order is ``en_route``.
    """
    now = now or datetime.now(UTC)
    assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    if assignment.status is not AssignmentStatus.ACCEPTED:
        raise _invalid_transition(order.status, OrderStatus.ARRIVED)
    if order.status is OrderStatus.ARRIVED and await _delivery_attempt(session, assignment.id):
        await session.commit()
        return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)
    if await _open_hold(session, assignment.id) is not None:
        raise _job_on_hold()
    if order.status is not OrderStatus.EN_ROUTE:
        raise _invalid_transition(order.status, OrderStatus.ARRIVED)

    await orders_service.transition_order(
        session,
        order_id=order.id,
        target=OrderStatus.ARRIVED,
        actor=driver,
        assigned_driver_id=assignment.driver_user_id,
        commit=False,
    )
    session.add(
        DeliveryAttempt(
            assignment_id=assignment.id,
            order_id=order.id,
            arrived_at=now,
            arrival_location=_point(location),
            arrival_accuracy_metres=location.accuracy_metres if location else None,
            within_window=within_window(order, now),
            recorded_by=driver.id,
        )
    )
    await session.commit()
    return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)


async def record_contact_attempt(
    session: AsyncSession, *, driver: User, reference: str, now: datetime | None = None
) -> DriverJob:
    """Record one attempt to reach the customer, at the server's time (FR-038). Commits.

    Every attempt is recorded; whether to cap them is an open question in
    the contract, so no cap is invented here.

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        now: Current time, for tests.

    Returns:
        The job with its ``contact_attempts``.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            unless the order is ``arrived``.
    """
    now = now or datetime.now(UTC)
    assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    if (
        assignment.status is not AssignmentStatus.ACCEPTED
        or order.status is not OrderStatus.ARRIVED
    ):
        raise _invalid_transition(order.status, None)
    attempt = await _attempt_or_create(
        session, assignment=assignment, order=order, actor=driver, now=now
    )
    session.add(
        ContactAttempt(delivery_attempt_id=attempt.id, attempted_at=now, recorded_by=driver.id)
    )
    await session.commit()
    return await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)


async def complete_unloading(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    sms: SmsProvider,
    now: datetime | None = None,
) -> tuple[DriverJob, bool]:
    """Record unloading complete and issue the delivery code (FR-035, #67). Commits.

    Not a status change: the order stays ``unloading`` (FR-033 unchanged).

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        sms: SMS provider, for the code.
        now: Current time, for tests.

    Returns:
        ``(job, recorded)``: ``recorded`` is False for a repeat, which
        changes nothing and issues no second code.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            unless the order is ``unloading``; 409 ``job_on_hold``.
    """
    now = now or datetime.now(UTC)
    assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    if (
        assignment.status is not AssignmentStatus.ACCEPTED
        or order.status is not OrderStatus.UNLOADING
    ):
        raise _invalid_transition(order.status, None)
    attempt = await _attempt_or_create(
        session, assignment=assignment, order=order, actor=driver, now=now
    )
    if attempt.unloading_completed_at is not None:
        await session.commit()
        job = await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)
        return job, False
    if await _open_hold(session, assignment.id) is not None:
        raise _job_on_hold()
    attempt.unloading_completed_at = now
    await _issue_code(session, order=order, issued_by=driver, sms=sms, now=now)
    await session.commit()
    job = await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)
    return job, True


async def submit_proof(
    session: AsyncSession,
    *,
    driver: User,
    reference: str,
    proof: NewProof,
    now: datetime | None = None,
) -> tuple[DriverJob, bool]:
    """Complete the delivery with a code, or ask for alternative proof (rows 17-18). Commits.

    See the module docstring for the code checks (FR-035, T-08, T-22) and
    the alternative-proof hold. ``delivered`` is never reached without the
    delivered litres, the unloading confirmation and a verified code (BR-06).

    Args:
        session: Database session.
        driver: The signed-in driver.
        reference: Order reference.
        proof: Validated proof.
        now: Current time, for tests.

    Returns:
        ``(job, delivered)``: the finished job and True when the code was
        verified (or for a repeat of that proof); the job on its
        ``proof_review`` hold and False for alternative proof.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``invalid_order_transition``
            unless the order is ``unloading``; 409 ``job_on_hold``; 409
            ``transition_requirements_unmet`` (``unloading_confirmed``) before
            a code was issued; 400 ``delivery_code_expired``; 400
            ``delivery_code_invalid`` with ``attempts_remaining`` (the wrong
            attempt is saved).
    """
    now = now or datetime.now(UTC)
    try:
        assignment, order = await _lock_live_job(session, driver_id=driver.id, reference=reference)
    except APIError as error:
        if proof.delivery_code is not None and error.status_code == HTTPStatus.NOT_FOUND:
            finished = await _finished_job(
                session,
                driver_id=driver.id,
                reference=reference,
                outcome=DeliveryOutcome.DELIVERED,
                now=now,
            )
            if finished is not None:
                return finished, True
        raise
    if (
        assignment.status is not AssignmentStatus.ACCEPTED
        or order.status is not OrderStatus.UNLOADING
    ):
        raise _invalid_transition(order.status, OrderStatus.DELIVERED)
    if await _open_hold(session, assignment.id) is not None:
        raise _job_on_hold()
    attempt = await _attempt_or_create(
        session, assignment=assignment, order=order, actor=driver, now=now
    )

    def proof_row(code: DeliveryCode | None) -> DeliveryProof:
        return DeliveryProof(
            assignment_id=assignment.id,
            order_id=order.id,
            delivery_attempt_id=attempt.id,
            delivered_litres=proof.delivered_litres,
            unloading_confirmed=True,
            delivered_at=now,
            method=(
                AcknowledgementMethod.DELIVERY_CODE
                if code is not None
                else AcknowledgementMethod.ALTERNATIVE_PROOF
            ),
            delivery_code_id=code.id if code is not None else None,
            alternative_reason=proof.alternative_reason if code is None else None,
            alternative_note=proof.alternative_note if code is None else None,
            location=_point(proof.location),
            location_accuracy_metres=proof.location.accuracy_metres if proof.location else None,
            recorded_by=driver.id,
            # Alternative proof waits for an administrator (FR-035, row 18).
            override_status=OverrideStatus.PENDING if code is None else None,
        )

    if proof.delivery_code is None:
        # A5-j: only an authorized administrator may approve (FR-035, BR-13).
        session.add(proof_row(None))
        reason = proof.alternative_reason.value if proof.alternative_reason else "other"
        session.add(
            OrderException(
                order_id=order.id,
                assignment_id=assignment.id,
                category=ExceptionCategory.ALTERNATIVE_PROOF,
                note=f"{reason}: {proof.alternative_note}" if proof.alternative_note else reason,
                hold_kind=HoldKind.PROOF_REVIEW,
                requires_admin_review=True,
                reported_by=driver.id,
            )
        )
        _record_partial_delivery(
            session,
            assignment=assignment,
            order=order,
            litres=proof.delivered_litres,
            driver=driver,
        )
        await admin_messages.hold_opened(session, order_id=order.id, reference=order.reference)
        await session.commit()
        job = await get_driver_job(session, driver_id=driver.id, reference=reference, now=now)
        return job, False

    code = await _newest_code(session, order.id)
    if attempt.unloading_completed_at is None or code is None:
        raise _requirements_unmet(Requirement.UNLOADING_CONFIRMED)
    if not codes.is_usable(code, now):
        raise APIError(
            HTTPStatus.BAD_REQUEST,
            "delivery_code_expired",
            "This delivery code can no longer be used. Send a new code.",
        )
    if not codes.matches(code, proof.delivery_code):
        # The wrong attempt counts even though the request fails (FR-035:
        # at most 5 attempts), so it is committed before the error.
        code.attempts += 1
        remaining = MAX_DELIVERY_CODE_ATTEMPTS - code.attempts
        await session.commit()
        raise APIError(
            HTTPStatus.BAD_REQUEST,
            "delivery_code_invalid",
            "That delivery code is not correct.",
            details={"attempts_remaining": remaining},
        )

    code.used_at = now
    session.add(proof_row(code))
    await session.flush()
    await orders_service.transition_order(
        session,
        order_id=order.id,
        target=OrderStatus.DELIVERED,
        actor=driver,
        satisfied={
            Requirement.DELIVERED_QUANTITY_RECORDED,
            Requirement.UNLOADING_CONFIRMED,
            Requirement.DELIVERY_CODE_VERIFIED,
        },
        assigned_driver_id=assignment.driver_user_id,
        commit=False,
    )
    _end_job(assignment, attempt, DeliveryOutcome.DELIVERED, now)
    _record_partial_delivery(
        session, assignment=assignment, order=order, litres=proof.delivered_litres, driver=driver
    )
    await session.commit()
    return (await _build_jobs(session, [(assignment, order)], now=now))[0], True
