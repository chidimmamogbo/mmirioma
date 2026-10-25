"""Cash rules that need no database (#123).

Contract: docs/api/payments.md (agreed G3, 2026-10-22). Covers the 6:00 PM
handover rule (FR-041, SRS §10), the payment status table (decisions 2, 4
and 9), the payment SMS wording (FR-050), where ``record_cash`` goes in a
job's actions, and the request bodies' field rules (integer kobo, whole
naira, never floats).
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.modules.deliveries.service import JobAction
from app.modules.orders.models import PaymentStatus
from app.modules.payments.models import CashCollection, CashCollectionStatus
from app.modules.payments.schemas import (
    CashCollectionRequest,
    CorrectionRequest,
    HandoverRequest,
    ReconciliationRequest,
    RemittanceRequest,
)
from app.modules.payments.service import (
    PaymentOutcome,
    is_overdue,
    payment_message,
    payment_outcome,
    remittance_due_at,
    with_record_cash,
)
from app.shared.lagos_time import LAGOS_TZ

# --- The 6:00 PM rule ------------------------------------------------------------------


def lagos(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=LAGOS_TZ)


@pytest.mark.parametrize(
    ("collected", "due"),
    [
        # Before 6:00 PM: due 6:00 PM the same day.
        (lagos(2026, 10, 27, 14, 15), lagos(2026, 10, 27, 18)),
        (lagos(2026, 10, 27, 0, 5), lagos(2026, 10, 27, 18)),
        (lagos(2026, 10, 27, 17, 59), lagos(2026, 10, 27, 18)),
        # At or after 6:00 PM: due 6:00 PM the next day.
        (lagos(2026, 10, 27, 18, 0), lagos(2026, 10, 28, 18)),
        (lagos(2026, 10, 27, 19, 5), lagos(2026, 10, 28, 18)),
        (lagos(2026, 10, 27, 23, 59), lagos(2026, 10, 28, 18)),
        # Every day is an operating day: Saturday cash is due Sunday.
        (lagos(2026, 10, 31, 20, 0), lagos(2026, 11, 1, 18)),
    ],
)
def test_handover_deadline(collected: datetime, due: datetime) -> None:
    result = remittance_due_at(collected.astimezone(UTC))
    assert result == due
    assert result.tzinfo is UTC


def test_the_deadline_uses_lagos_time_not_utc() -> None:
    # 17:30 UTC is 18:30 in Lagos (UTC+1): already after 6:00 PM there.
    assert remittance_due_at(datetime(2026, 10, 27, 17, 30, tzinfo=UTC)) == lagos(2026, 10, 28, 18)


def collection(status: CashCollectionStatus, due: datetime) -> CashCollection:
    return CashCollection(
        id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        driver_id=uuid.uuid4(),
        assignment_id=uuid.uuid4(),
        amount_minor_units=4_500_000,
        status=status,
        collected_at=due - timedelta(hours=4),
        remittance_due_at=due,
    )


@pytest.mark.parametrize(
    ("status", "minutes_after", "overdue"),
    [
        (CashCollectionStatus.COLLECTED, -1, False),
        (CashCollectionStatus.COLLECTED, 0, True),
        (CashCollectionStatus.AWAITING_REMITTANCE, 30, True),
        # Once an administrator has it, it is never overdue.
        (CashCollectionStatus.REMITTED, 30, False),
        (CashCollectionStatus.RECONCILED, 30, False),
    ],
)
def test_overdue_only_while_the_driver_holds_it(
    status: CashCollectionStatus, minutes_after: int, overdue: bool
) -> None:
    due = lagos(2026, 10, 27, 18).astimezone(UTC)
    assert is_overdue(collection(status, due), due + timedelta(minutes=minutes_after)) is overdue


# --- Payment status ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("amount", "total", "expected"),
    [
        (4_500_000, 4_500_000, PaymentOutcome(PaymentStatus.PAID, 0, 0)),
        (4_000_000, 4_500_000, PaymentOutcome(PaymentStatus.PARTIALLY_PAID, 500_000, 0)),
        # Decision 4: nothing paid is part paid with the whole total outstanding.
        (0, 4_500_000, PaymentOutcome(PaymentStatus.PARTIALLY_PAID, 4_500_000, 0)),
        # FR-041: an overpayment is paid, the excess flagged for review.
        (5_000_000, 4_500_000, PaymentOutcome(PaymentStatus.PAID, 0, 500_000)),
    ],
)
def test_payment_outcome(amount: int, total: int, expected: PaymentOutcome) -> None:
    outcome = payment_outcome(amount, total)
    assert outcome == expected
    assert all(
        isinstance(value, int)
        for value in (outcome.outstanding_balance_minor_units, outcome.overpaid_minor_units)
    )


# --- Payment SMS ---------------------------------------------------------------------


def test_payment_message_paid() -> None:
    text = payment_message(
        reference="MO-7KQ2M9XH4T", amount_minor_units=4_500_000, outstanding_minor_units=0
    )
    assert text.startswith("MmiriOma: we received N45,000.00 cash for order MO-7KQ2M9XH4T.")
    assert "outstanding" not in text
    assert "Help: +234" in text


def test_payment_message_states_the_outstanding_balance() -> None:
    text = payment_message(
        reference="MO-3HF8P2LQ6D", amount_minor_units=4_000_000, outstanding_minor_units=500_000
    )
    assert "we received N40,000.00 cash for order MO-3HF8P2LQ6D. N5,000.00 is outstanding." in text


def test_payment_message_has_no_quality_words_and_fits_gsm7() -> None:
    text = payment_message(
        reference="MO-7KQ2M9XH4T", amount_minor_units=4_500_000, outstanding_minor_units=0
    )
    for word in ("safe", "clean", "purified", "potable", "drinkable"):
        assert word not in text.lower()
    assert "₦" not in text


# --- record_cash in allowed_actions ---------------------------------------------------


def test_record_cash_goes_before_the_problem_report() -> None:
    actions = [JobAction.SUBMIT_PROOF, JobAction.REPORT_INCIDENT]
    assert with_record_cash(actions, True) == [
        JobAction.SUBMIT_PROOF,
        JobAction.RECORD_CASH,
        JobAction.REPORT_INCIDENT,
    ]
    # A delivered job has no other action.
    assert with_record_cash([], True) == [JobAction.RECORD_CASH]
    assert with_record_cash(actions, False) == actions


# --- Request bodies ---------------------------------------------------------------------


@pytest.mark.parametrize("amount", [0, 100, 4_500_000, 10**12])
def test_cash_amounts_are_whole_naira_in_kobo(amount: int) -> None:
    assert CashCollectionRequest(amount_minor_units=amount).amount_minor_units == amount


@pytest.mark.parametrize("amount", [-100, 50, 4_500_050, 45000.0, "4500000", True])
def test_cash_amounts_refuse_kobo_floats_and_strings(amount: object) -> None:
    with pytest.raises(ValidationError):
        CashCollectionRequest(amount_minor_units=amount)  # type: ignore[arg-type]


def test_a_blank_note_is_no_note_and_long_notes_are_refused() -> None:
    assert CashCollectionRequest(amount_minor_units=100, note="   ").note is None
    with pytest.raises(ValidationError):
        CashCollectionRequest(amount_minor_units=100, note="x" * 501)
    with pytest.raises(ValidationError):
        CashCollectionRequest(amount_minor_units=100, unexpected=True)  # type: ignore[call-arg]


def test_collection_id_lists() -> None:
    one = uuid.uuid4()
    with pytest.raises(ValidationError):
        HandoverRequest(collection_ids=[])
    with pytest.raises(ValidationError):
        HandoverRequest(collection_ids=[one, one])
    with pytest.raises(ValidationError):
        HandoverRequest(collection_ids=[uuid.uuid4() for _ in range(51)])
    assert (
        len(HandoverRequest(collection_ids=[uuid.uuid4() for _ in range(50)]).collection_ids) == 50
    )
    with pytest.raises(ValidationError):
        ReconciliationRequest(collection_ids=[one, one])


def test_remittance_and_correction_bodies() -> None:
    body = RemittanceRequest(
        driver_id=uuid.uuid4(), collection_ids=[uuid.uuid4()], counted_minor_units=0, note=""
    )
    assert body.note is None
    with pytest.raises(ValidationError):
        RemittanceRequest(
            driver_id=uuid.uuid4(), collection_ids=[uuid.uuid4()], counted_minor_units=150
        )
    with pytest.raises(ValidationError):
        CorrectionRequest(amount_minor_units=100, reason="   ")
    assert CorrectionRequest(amount_minor_units=100, reason=" typo ").reason == "typo"
