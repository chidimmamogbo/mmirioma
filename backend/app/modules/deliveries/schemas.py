"""Request and response models for the driver job endpoints (docs/api/deliveries.md).

Responses never contain a delivery code, the customer's account details,
order history or payment information (driver design rules). The receiver's
name and phone appear only after the driver accepts (FR-032).
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.modules.deliveries import service
from app.modules.deliveries.models import (
    ALTERNATIVE_PROOF_NOTE_MAX_LENGTH,
    INCIDENT_NOTE_MAX_LENGTH,
    MAX_DELIVERY_CODE_ATTEMPTS,
    OTHER_SOURCE_NAME_MAX_LENGTH,
    SAFETY_NOTE_MAX_LENGTH,
    SOURCE_REFERENCE_MAX_LENGTH,
    AlternativeProofReason,
    ExceptionCategory,
    HoldKind,
    SmsStatus,
)
from app.modules.dispatch.models import DECLINE_NOTE_MAX_LENGTH, DeclineReason
from app.modules.orders.models import EVENT_NOTE_MAX_LENGTH, OrderStatus
from app.modules.payments.schemas import DriverJobCashRead
from app.modules.payments.service import JobCash, with_record_cash

# Optional free text is trimmed; text left blank counts as "not given" and is
# turned into None by the model validators (_blank_to_none).
DeclineNote = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=DECLINE_NOTE_MAX_LENGTH)
]
SourceReference = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=SOURCE_REFERENCE_MAX_LENGTH)
]
SafetyNote = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=SAFETY_NOTE_MAX_LENGTH)
]
IncidentNote = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=INCIDENT_NOTE_MAX_LENGTH)
]


def _blank_to_none(value: str | None) -> str | None:
    return value or None


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Requests ----------------------------------------------------------------


class DeclineRequest(_Request):
    """Body of ``POST /driver/jobs/{id}/decline``.

    Attributes:
        reason: One of the five reasons in the driver design (J2-b).
        note: Up to 300 characters; required when ``reason`` is ``other``.
    """

    reason: DeclineReason
    note: DeclineNote | None = None

    @model_validator(mode="after")
    def _note_for_other(self) -> DeclineRequest:
        self.note = _blank_to_none(self.note)
        if self.reason is DeclineReason.OTHER and self.note is None:
            raise ValueError("A note is required when the reason is 'other'")
        return self


class AssignedSource(_Request):
    """The order's assigned source was used."""

    assigned: Literal[True]


class OtherSource(_Request):
    """Another source was used; its name is required."""

    assigned: Literal[False]
    name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=OTHER_SOURCE_NAME_MAX_LENGTH
        ),
    ]


class PickupRequest(_Request):
    """Body of ``POST /driver/jobs/{id}/pickup`` (FR-034).

    Attributes:
        source: The assigned source, or another one by name.
        source_reference: Optional receipt or batch number.
        volume_collected_litres: Whole litres, at least 1 (no strings or floats).
        picked_up_at: Aware timestamp; the service checks it is not in the
            future or before the job started.
        safety_concern: Whether the driver has a safety concern at the source.
        safety_note: Required when ``safety_concern`` is true.
    """

    source: AssignedSource | OtherSource = Field(discriminator="assigned")
    source_reference: SourceReference | None = None
    volume_collected_litres: Annotated[int, Field(strict=True, ge=1)]
    picked_up_at: AwareDatetime
    safety_concern: Annotated[bool, Field(strict=True)]
    safety_note: SafetyNote | None = None

    @model_validator(mode="after")
    def _note_for_concern(self) -> PickupRequest:
        self.source_reference = _blank_to_none(self.source_reference)
        self.safety_note = _blank_to_none(self.safety_note)
        if self.safety_concern and self.safety_note is None:
            raise ValueError("Describe the safety concern in safety_note")
        return self

    def to_new_pickup(self) -> service.NewPickup:
        """Convert to the service's input."""
        other = self.source if isinstance(self.source, OtherSource) else None
        return service.NewPickup(
            assigned_source=other is None,
            other_source_name=other.name if other else None,
            source_reference=self.source_reference,
            volume_collected_litres=self.volume_collected_litres,
            picked_up_at=self.picked_up_at,
            safety_concern=self.safety_concern,
            safety_note=self.safety_note if self.safety_concern else None,
        )


class IncidentType(StrEnum):
    """Problems a driver can report (driver design A6). Customer unreachable
    is not one: it has its own flow (FR-038)."""

    RUNNING_LATE = "running_late"
    UNSAFE_ACCESS = "unsafe_access"
    UNSAFE_TRANSFER = "unsafe_transfer"
    VOLUME_ISSUE = "volume_issue"
    SOURCE_CONCERN = "source_concern"
    VEHICLE_PROBLEM = "vehicle_problem"
    OTHER = "other"


class IncidentRequest(_Request):
    """Body of ``POST /driver/jobs/{id}/incidents`` (FR-036).

    Attributes:
        type: The problem.
        note: Up to 500 characters; required for ``other``.
        new_estimated_arrival_at: Only for ``running_late``; the service
            checks it is not in the past.
    """

    type: IncidentType
    note: IncidentNote | None = None
    new_estimated_arrival_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def _check_fields(self) -> IncidentRequest:
        self.note = _blank_to_none(self.note)
        if self.type is IncidentType.OTHER and self.note is None:
            raise ValueError("A note is required when the type is 'other'")
        if self.new_estimated_arrival_at is not None and self.type is not (
            IncidentType.RUNNING_LATE
        ):
            raise ValueError("new_estimated_arrival_at is only for 'running_late'")
        return self

    def to_new_incident(self) -> service.NewIncident:
        """Convert to the service's input."""
        return service.NewIncident(
            category=ExceptionCategory(self.type.value),
            note=self.note,
            new_estimated_arrival_at=self.new_estimated_arrival_at,
        )


class LocationIn(_Request):
    """A GPS point in WGS 84 (SRID 4326), sent only with consent (FR-035).

    Attributes:
        latitude: -90 to 90.
        longitude: -180 to 180.
        accuracy_metres: The device's reported accuracy, 0 or more.
    """

    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    accuracy_metres: Annotated[float, Field(ge=0)] | None = None


class _WithLocation(_Request):
    """``location`` and ``location_consent`` (contract, arrive and proof)."""

    location: LocationIn | None = None
    location_consent: Annotated[bool, Field(strict=True)] = False

    @model_validator(mode="after")
    def _consent_first(self) -> _WithLocation:
        # FR-035: GPS only with consent obtained beforehand.
        if self.location is not None and not self.location_consent:
            raise ValueError("location needs location_consent: true")
        return self

    def to_new_location(self) -> service.NewLocation | None:
        """The consented point for the service, or None."""
        if self.location is None:
            return None
        return service.NewLocation(
            latitude=self.location.latitude,
            longitude=self.location.longitude,
            accuracy_metres=self.location.accuracy_metres,
        )


class ArriveRequest(_WithLocation):
    """Body of ``POST /driver/jobs/{reference}/arrive`` (row 15).

    Attributes:
        location: Optional GPS point.
        location_consent: Must be true when ``location`` is sent.
    """


class TransitionRequest(_Request):
    """Body of ``POST /driver/jobs/{reference}/transition`` (rows 12, 14, 16, 19).

    Attributes:
        to: ``departed``, ``en_route``, ``unloading`` or ``failed``. Other
            statuses have their own endpoints (pickup, arrive, proof) and are
            refused with 422.
        note: Optional, up to 500 characters; saved on the event.
    """

    to: service.DriverStep
    note: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=EVENT_NOTE_MAX_LENGTH)]
        | None
    ) = None

    @model_validator(mode="after")
    def _blank_note(self) -> TransitionRequest:
        self.note = _blank_to_none(self.note)
        return self


class AlternativeProofIn(_Request):
    """Why the delivery code cannot be used (design A5-j).

    Attributes:
        reason: ``customer_cannot_receive_code`` or ``other``.
        note: Up to 500 characters; required for ``other``.
    """

    reason: AlternativeProofReason
    note: (
        Annotated[
            str,
            StringConstraints(strip_whitespace=True, max_length=ALTERNATIVE_PROOF_NOTE_MAX_LENGTH),
        ]
        | None
    ) = None

    @model_validator(mode="after")
    def _note_for_other(self) -> AlternativeProofIn:
        self.note = _blank_to_none(self.note)
        if self.reason is AlternativeProofReason.OTHER and self.note is None:
            raise ValueError("A note is required when the reason is 'other'")
        return self


class ProofRequest(_WithLocation):
    """Body of ``POST /driver/jobs/{reference}/proof`` (rows 17-18, FR-035).

    Attributes:
        delivered_litres: Whole litres actually delivered, at least 1. No
            upper bound: it is an open question in the contract.
        unloading_confirmed: Must be true (the driver unloaded the water).
        delivery_code: The 6 digits the customer gave; exactly one of this
            and ``alternative_proof``.
        alternative_proof: Asks an administrator to approve other proof.
        location: Optional GPS point.
        location_consent: Must be true when ``location`` is sent.
    """

    delivered_litres: Annotated[int, Field(strict=True, ge=1)]
    unloading_confirmed: Literal[True]
    delivery_code: Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")] | None = None
    alternative_proof: AlternativeProofIn | None = None

    @model_validator(mode="after")
    def _one_acknowledgement(self) -> ProofRequest:
        if (self.delivery_code is None) == (self.alternative_proof is None):
            raise ValueError("Send exactly one of delivery_code and alternative_proof")
        return self

    def to_new_proof(self) -> service.NewProof:
        """Convert to the service's input."""
        return service.NewProof(
            delivered_litres=self.delivered_litres,
            delivery_code=self.delivery_code,
            alternative_reason=self.alternative_proof.reason if self.alternative_proof else None,
            alternative_note=self.alternative_proof.note if self.alternative_proof else None,
            location=self.to_new_location(),
        )


# --- Responses ---------------------------------------------------------------


class HoldRead(BaseModel):
    """An open hold on a job."""

    kind: HoldKind
    since: datetime
    message: str


class ReceiverRead(BaseModel):
    """Receiver as the driver sees them: first name and last initial, and the
    phone for the call button."""

    display_name: str
    phone: str


class SourceRead(BaseModel):
    """The order's assigned water source."""

    id: uuid.UUID
    name: str
    approximate_location: str


class PickupRead(BaseModel):
    """A recorded pickup."""

    source_id: uuid.UUID | None
    other_source_name: str | None
    source_reference: str | None
    volume_collected_litres: int
    picked_up_at: datetime
    safety_concern: bool


class ContactAttemptRead(BaseModel):
    """One recorded contact attempt (FR-038)."""

    attempted_at: datetime


class DeliveryCodeRead(BaseModel):
    """State of the newest delivery code. Never contains the code."""

    issued_at: datetime
    expires_at: datetime
    attempts_left: int
    sms_status: SmsStatus


class DriverJobSummary(BaseModel):
    """A job in the "My jobs" list (contract, ``DriverJobSummary``).

    ``order_reference`` identifies the job in every driver job path.
    """

    order_reference: str
    section: service.JobSection | None
    job_status: service.JobStatus
    order_status: OrderStatus
    delivery_window_start_at: datetime | None
    delivery_window_end_at: datetime | None
    delivery_area: str | None
    quantity_litres: int
    source_name: str | None
    offered_at: datetime
    hold: HoldRead | None
    delivered_litres: int | None
    ended_at: datetime | None
    end_reason: str | None
    is_simulated: bool
    cash: DriverJobCashRead | None

    @classmethod
    def from_job(cls, job: service.DriverJob, cash: JobCash | None = None) -> DriverJobSummary:
        """Build from a service job and its Cash card (payments module), if any."""
        return cls(**_summary_fields(job, cash))


class DriverJobDetail(DriverJobSummary):
    """One job (contract, ``DriverJobDetail``)."""

    receiver: ReceiverRead | None
    delivery_address: str | None
    landmark: str | None
    delivery_instructions: str | None
    source: SourceRead | None
    pickup: PickupRead | None
    arrived_at: datetime | None
    contact_attempts: list[ContactAttemptRead]
    delivery_code: DeliveryCodeRead | None
    allowed_actions: list[service.JobAction]
    unloading_completed_at: datetime | None
    unreachable_allowed_at: datetime | None

    @classmethod
    def from_job(cls, job: service.DriverJob, cash: JobCash | None = None) -> DriverJobDetail:
        """Build from a service job and its Cash card (payments module), if any.

        The receiver's name and phone, and the delivery code state, are shown
        only while the job is accepted and in progress: not for an offer
        (FR-032) and not after the job ended. Jobs a driver no longer holds
        are never built (404 in the service). ``record_cash`` is added to
        ``allowed_actions`` while cash can be recorded (docs/api/payments.md).
        """
        order = job.order
        accepted = job.job_status is service.JobStatus.ACCEPTED
        code = job.delivery_code
        return cls(
            **_summary_fields(job, cash),
            receiver=(
                ReceiverRead(
                    display_name=service.receiver_display_name(order.contact_name),
                    phone=order.contact_phone,
                )
                if accepted
                else None
            ),
            delivery_address=order.delivery_address,
            landmark=order.landmark,
            delivery_instructions=order.delivery_instructions,
            source=(
                SourceRead(
                    id=job.source.id,
                    name=job.source.name,
                    approximate_location=job.source.approximate_location,
                )
                if job.source
                else None
            ),
            pickup=(
                PickupRead(
                    source_id=job.pickup.source_id,
                    other_source_name=job.pickup.other_source_name,
                    source_reference=job.pickup.source_reference,
                    volume_collected_litres=job.pickup.volume_collected_litres,
                    picked_up_at=job.pickup.picked_up_at,
                    safety_concern=job.pickup.safety_concern,
                )
                if job.pickup
                else None
            ),
            arrived_at=job.arrived_at,
            contact_attempts=[
                ContactAttemptRead(attempted_at=attempted_at)
                for attempted_at in job.contact_attempts
            ],
            delivery_code=(
                DeliveryCodeRead(
                    issued_at=code.issued_at,
                    expires_at=code.expires_at,
                    attempts_left=MAX_DELIVERY_CODE_ATTEMPTS - code.attempts,
                    sms_status=code.sms_status,
                )
                if code and accepted
                else None
            ),
            allowed_actions=with_record_cash(
                job.allowed_actions, cash is not None and cash.record_allowed
            ),
            unloading_completed_at=job.unloading_completed_at,
            unreachable_allowed_at=job.unreachable_allowed_at,
        )


def _summary_fields(job: service.DriverJob, cash: JobCash | None) -> dict[str, object]:
    order = job.order
    hold = job.hold
    return {
        "order_reference": order.reference,
        "section": job.section,
        "job_status": job.job_status,
        "order_status": order.status,
        "delivery_window_start_at": order.delivery_window_start_at,
        "delivery_window_end_at": order.delivery_window_end_at,
        "delivery_area": service.delivery_area(order.delivery_address),
        "quantity_litres": order.quantity_litres,
        "source_name": job.source.name if job.source else None,
        # The assignment row is created when the dispatcher makes the offer.
        "offered_at": job.assignment.created_at,
        "hold": (
            HoldRead(
                kind=hold.hold_kind,
                since=hold.created_at,
                message=service.HOLD_MESSAGES[hold.hold_kind],
            )
            if hold and hold.hold_kind
            else None
        ),
        # From the code-verified delivery proof, once the job ended with it.
        "delivered_litres": job.delivered_litres,
        "ended_at": job.ended_at,
        "end_reason": job.end_reason,
        "is_simulated": order.is_simulated,
        "cash": DriverJobCashRead.from_cash(cash),
    }


class DriverJobList(BaseModel):
    """Response of ``GET /driver/jobs``."""

    offers: list[DriverJobSummary]
    today: list[DriverJobSummary]
    upcoming: list[DriverJobSummary]
    done: list[DriverJobSummary]
    generated_at: datetime


class IncidentRead(BaseModel):
    """Response of ``POST /driver/jobs/{reference}/incidents``."""

    id: uuid.UUID
    order_reference: str
    type: IncidentType
    note: str | None
    new_estimated_arrival_at: datetime | None
    created_at: datetime
    hold: HoldRead | None
