"""Cash request and response bodies (docs/api/payments.md, agreed G3 2026-10-22).

Money is integer kobo (``*_minor_units``, SRS §5), typed by people in whole
naira, so every amount on input is a multiple of 100. Times are UTC; the
clients show Africa/Lagos time.
"""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.modules.auth.models import User
from app.modules.orders.models import PaymentMethod, PaymentStatus
from app.modules.payments.models import (
    KOBO_PER_NAIRA,
    NOTE_MAX_LENGTH,
    CashCollectionStatus,
    PaymentSmsStatus,
)
from app.modules.payments.service import (
    CashDay,
    CashHistoryEntry,
    CollectionView,
    DriverCash,
    JobCash,
    PaymentView,
    RemittanceResult,
)

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=NOTE_MAX_LENGTH)]
Reason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NOTE_MAX_LENGTH)
]
#: Whole naira in kobo, ₦0 or more, no upper limit (contract field rules).
WholeNairaMinorUnits = Annotated[int, Field(strict=True, ge=0, multiple_of=KOBO_PER_NAIRA)]
#: Ids a driver hands over or an administrator receives or reconciles at once.
CollectionIds = Annotated[list[uuid.UUID], Field(min_length=1, max_length=50)]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _blank_to_none(note: str | None) -> str | None:
    return note or None


def _distinct(collection_ids: list[uuid.UUID]) -> None:
    if len(set(collection_ids)) != len(collection_ids):
        raise ValueError("Each cash record can be listed only once")


# --- Requests -------------------------------------------------------------------------


class CashCollectionRequest(_Request):
    """Body of ``POST /driver/jobs/{reference}/cash-collection`` (K1).

    Attributes:
        amount_minor_units: Cash received in kobo, whole naira, ₦0 or more.
        note: Required by the service when the amount differs from the
            amount due (it knows the amount due).
    """

    amount_minor_units: WholeNairaMinorUnits
    note: Note | None = None

    @model_validator(mode="after")
    def _normalise(self) -> Self:
        self.note = _blank_to_none(self.note)
        return self


class HandoverRequest(_Request):
    """Body of ``POST /driver/cash/handover`` (K2)."""

    collection_ids: CollectionIds

    @model_validator(mode="after")
    def _check(self) -> Self:
        _distinct(self.collection_ids)
        return self


class CorrectionRequest(_Request):
    """Body of ``POST /admin/cash-collections/{id}/correction`` (K4, decision 6)."""

    amount_minor_units: WholeNairaMinorUnits
    reason: Reason


class RemittanceRequest(_Request):
    """Body of ``POST /admin/cash-remittances`` (K4).

    Attributes:
        note: Required by the service when the counted amount differs from
            the recorded total.
    """

    driver_id: uuid.UUID
    collection_ids: CollectionIds
    counted_minor_units: WholeNairaMinorUnits
    note: Note | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        _distinct(self.collection_ids)
        self.note = _blank_to_none(self.note)
        return self


class ReconciliationRequest(_Request):
    """Body of ``POST /admin/cash-reconciliations`` (K5)."""

    collection_ids: CollectionIds
    note: Note | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        _distinct(self.collection_ids)
        self.note = _blank_to_none(self.note)
        return self


# --- Responses ------------------------------------------------------------------------


class PersonRead(BaseModel):
    """A driver or administrator: id and name only."""

    id: uuid.UUID
    name: str

    @classmethod
    def from_user(cls, user: User | None) -> PersonRead | None:
        return None if user is None else cls(id=user.id, name=user.name)


class CashCollectionRead(BaseModel):
    """``CashCollection`` as the driver sees it. Never the customer's details."""

    id: uuid.UUID
    order_reference: str
    amount_minor_units: int
    amount_due_minor_units: int
    original_amount_minor_units: int | None
    corrected_at: datetime | None
    note: str | None
    status: CashCollectionStatus
    collected_at: datetime
    remittance_due_at: datetime
    overdue: bool
    remitted_at: datetime | None
    received_by: PersonRead | None
    reconciled_at: datetime | None

    @classmethod
    def from_view(cls, view: CollectionView) -> CashCollectionRead:
        return cls(**_driver_fields(view))


def _driver_fields(view: CollectionView) -> dict[str, object]:
    collection = view.collection
    return {
        "id": collection.id,
        "order_reference": view.order.reference,
        "amount_minor_units": collection.amount_minor_units,
        "amount_due_minor_units": view.amount_due_minor_units,
        "original_amount_minor_units": collection.original_amount_minor_units,
        "corrected_at": collection.corrected_at,
        "note": collection.note,
        "status": collection.status,
        "collected_at": collection.collected_at,
        "remittance_due_at": collection.remittance_due_at,
        "overdue": view.overdue,
        "remitted_at": collection.remitted_at,
        "received_by": PersonRead.from_user(view.received_by),
        "reconciled_at": collection.reconciled_at,
    }


class CustomerRead(BaseModel):
    """The order's customer, as the order detail shows them to staff."""

    name: str
    phone: str


class AdminCashCollectionRead(CashCollectionRead):
    """``AdminCashCollection``: the driver view plus what staff need."""

    driver: PersonRead | None
    customer: CustomerRead | None
    payment_status: PaymentStatus | None
    outstanding_balance_minor_units: int
    overpaid_minor_units: int
    handed_over_at: datetime | None
    corrected_by: PersonRead | None
    correction_reason: str | None
    remittance_id: uuid.UUID | None
    reconciled_by: PersonRead | None
    payment_sms_status: PaymentSmsStatus | None

    @classmethod
    def from_view(cls, view: CollectionView) -> AdminCashCollectionRead:
        collection = view.collection
        order = view.order
        return cls(
            **_driver_fields(view),
            driver=PersonRead.from_user(view.driver),
            customer=None
            if view.customer is None
            else CustomerRead(name=view.customer.name, phone=view.customer.phone),
            payment_status=order.payment_status,
            outstanding_balance_minor_units=order.outstanding_balance_minor_units,
            overpaid_minor_units=order.overpaid_minor_units,
            handed_over_at=collection.handed_over_at,
            corrected_by=PersonRead.from_user(view.corrected_by),
            correction_reason=collection.correction_reason,
            remittance_id=collection.remittance_id,
            reconciled_by=PersonRead.from_user(view.reconciled_by),
            payment_sms_status=collection.payment_sms_status,
        )


class DriverJobCashRead(BaseModel):
    """The ``cash`` object on a driver job (K1).

    Attributes:
        amount_due_label: ``manual_quote`` in the pilot (the snapshot is manual).
        record_allowed: True while cash can be recorded; the job detail's
            ``allowed_actions`` then also lists ``record_cash``. On the job
            summary (delivered jobs, whose detail is 404) it is the only
            signal (contract amendment 2).
    """

    amount_due_minor_units: int
    amount_due_label: Literal["manual_quote", "quote"]
    collection: CashCollectionRead | None
    record_allowed: bool

    @classmethod
    def from_cash(cls, cash: JobCash | None) -> DriverJobCashRead | None:
        if cash is None:
            return None
        return cls(
            amount_due_minor_units=cash.amount_due_minor_units,
            amount_due_label="manual_quote" if cash.manual else "quote",
            collection=None
            if cash.collection is None
            else CashCollectionRead.from_view(cash.collection),
            record_allowed=cash.record_allowed,
        )


class DriverCashRead(BaseModel):
    """Body of ``GET /driver/cash`` and ``POST /driver/cash/handover`` (K2)."""

    on_hand_minor_units: int
    ready_minor_units: int
    remittance_due_at: datetime | None
    overdue: bool
    collections: list[CashCollectionRead]

    @classmethod
    def from_cash(cls, cash: DriverCash) -> DriverCashRead:
        return cls(
            on_hand_minor_units=cash.on_hand_minor_units,
            ready_minor_units=cash.ready_minor_units,
            remittance_due_at=cash.remittance_due_at,
            overdue=cash.overdue,
            collections=[CashCollectionRead.from_view(view) for view in cash.collections],
        )


class CashTotalsRead(BaseModel):
    """The K3 figures for one day."""

    recorded_minor_units: int
    received_minor_units: int
    reconciled_minor_units: int
    with_drivers_minor_units: int
    differences: int


class CashDriverRead(BaseModel):
    """A driver as the cash page names them."""

    id: uuid.UUID
    name: str
    vehicle: str | None


class DriverCashRowRead(BaseModel):
    """One driver row on the cash page."""

    driver: CashDriverRead
    held_minor_units: int
    ready_minor_units: int
    remittance_due_at: datetime | None
    overdue: bool
    last_received_at: datetime | None


class CashDayRead(BaseModel):
    """Body of ``GET /admin/cash`` (K3)."""

    date: date
    totals: CashTotalsRead
    drivers: list[DriverCashRowRead]
    awaiting_reconciliation: list[AdminCashCollectionRead]

    @classmethod
    def from_day(cls, day: CashDay) -> CashDayRead:
        return cls(
            date=day.day,
            totals=CashTotalsRead(
                recorded_minor_units=day.recorded_minor_units,
                received_minor_units=day.received_minor_units,
                reconciled_minor_units=day.reconciled_minor_units,
                with_drivers_minor_units=day.with_drivers_minor_units,
                differences=day.differences,
            ),
            drivers=[
                DriverCashRowRead(
                    driver=CashDriverRead(
                        id=row.driver.id,
                        name=row.driver.name,
                        vehicle=None if row.vehicle is None else row.vehicle.vehicle_type,
                    ),
                    held_minor_units=row.held_minor_units,
                    ready_minor_units=row.ready_minor_units,
                    remittance_due_at=row.remittance_due_at,
                    overdue=row.overdue,
                    last_received_at=row.last_received_at,
                )
                for row in day.drivers
            ],
            awaiting_reconciliation=[
                AdminCashCollectionRead.from_view(view) for view in day.awaiting_reconciliation
            ],
        )


class DriverCashForAdminRead(BaseModel):
    """Body of ``GET /admin/cash/drivers/{driver_id}`` (K4)."""

    driver: PersonRead
    collections: list[AdminCashCollectionRead]

    @classmethod
    def from_views(cls, driver: User, views: list[CollectionView]) -> DriverCashForAdminRead:
        return cls(
            driver=PersonRead(id=driver.id, name=driver.name),
            collections=[AdminCashCollectionRead.from_view(view) for view in views],
        )


class ReceivedOrderRead(BaseModel):
    """One order's outcome in a remittance."""

    reference: str
    payment_status: PaymentStatus
    outstanding_balance_minor_units: int
    overpaid_minor_units: int
    sms_status: PaymentSmsStatus | None


class RemittanceRead(BaseModel):
    """Body of ``POST /admin/cash-remittances`` (K4).

    ``difference_minor_units`` is counted minus recorded; negative is short.
    """

    id: uuid.UUID
    driver: PersonRead
    recorded_minor_units: int
    counted_minor_units: int
    difference_minor_units: int
    note: str | None
    received_by: PersonRead
    remitted_at: datetime
    orders: list[ReceivedOrderRead]

    @classmethod
    def from_result(cls, result: RemittanceResult) -> RemittanceRead:
        remittance = result.remittance
        return cls(
            id=remittance.id,
            driver=PersonRead(id=result.driver.id, name=result.driver.name),
            recorded_minor_units=remittance.recorded_minor_units,
            counted_minor_units=remittance.counted_minor_units,
            difference_minor_units=remittance.difference_minor_units,
            note=remittance.note,
            received_by=PersonRead(id=result.received_by.id, name=result.received_by.name),
            remitted_at=remittance.remitted_at,
            orders=[
                ReceivedOrderRead(
                    reference=order.reference,
                    payment_status=order.payment_status,
                    outstanding_balance_minor_units=order.outstanding_balance_minor_units,
                    overpaid_minor_units=order.overpaid_minor_units,
                    sms_status=order.sms_status,
                )
                for order in result.orders
            ],
        )


class ReconciliationRead(BaseModel):
    """Body of ``POST /admin/cash-reconciliations`` (K5)."""

    collections: list[AdminCashCollectionRead]


class RemittanceDifferenceRead(BaseModel):
    """The counted difference of the handover that took this order's cash."""

    remittance_id: uuid.UUID
    difference_minor_units: int
    note: str | None


class OrderPaymentRead(BaseModel):
    """``AdminOrderDetail.payment`` (K6); null before confirmation.

    Attributes:
        sms_status: The payment SMS outcome; null before receipt or for ₦0.
    """

    method: PaymentMethod | None
    status: PaymentStatus
    outstanding_balance_minor_units: int
    overpaid_minor_units: int
    cash_collection: AdminCashCollectionRead | None
    remittance_difference: RemittanceDifferenceRead | None
    sms_status: PaymentSmsStatus | None

    @classmethod
    def from_view(cls, view: PaymentView | None) -> OrderPaymentRead | None:
        if view is None or view.order.payment_status is None:
            return None
        order = view.order
        collection = view.collection
        remittance = view.remittance
        return cls(
            method=order.payment_method,
            status=order.payment_status,
            outstanding_balance_minor_units=order.outstanding_balance_minor_units,
            overpaid_minor_units=order.overpaid_minor_units,
            cash_collection=None
            if collection is None
            else AdminCashCollectionRead.from_view(collection),
            remittance_difference=None
            if remittance is None
            else RemittanceDifferenceRead(
                remittance_id=remittance.id,
                difference_minor_units=remittance.difference_minor_units,
                note=remittance.note,
            ),
            sms_status=None if collection is None else collection.collection.payment_sms_status,
        )


class CashEventRead(BaseModel):
    """The ``cash`` object on a cash history entry (contract amendment 1).

    Only the keys a step sets are non-null: ``previous_amount_minor_units``
    on ``cash_corrected``; ``payment_status``, ``outstanding_balance_minor_units``
    and ``sms_status`` on ``cash_received``. The note or correction reason is
    the entry's ``note``.
    """

    collection_id: uuid.UUID
    amount_minor_units: int
    previous_amount_minor_units: int | None
    payment_status: PaymentStatus | None
    outstanding_balance_minor_units: int | None
    sms_status: PaymentSmsStatus | None

    @classmethod
    def from_entry(cls, entry: CashHistoryEntry) -> CashEventRead:
        event = entry.event
        return cls(
            collection_id=event.collection_id,
            amount_minor_units=event.amount_minor_units,
            previous_amount_minor_units=event.previous_amount_minor_units,
            payment_status=event.payment_status,
            outstanding_balance_minor_units=event.outstanding_balance_minor_units,
            sms_status=entry.sms_status,
        )
