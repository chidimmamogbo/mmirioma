"""Driver job rules that need no database (docs/api/deliveries.md).

Covers grouping into offers/today/upcoming/done (including later-day jobs),
allowed actions (start only on the delivery day, holds, the failed attempt
after two contact attempts and 10 minutes, unloading complete before proof),
the delivery code rules (10 minutes, issued after unloading, new-code
eligibility, constant-time matching), the arrival window flag, the
dispatched SMS and the receiver's short name.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.modules.deliveries import codes
from app.modules.deliveries.models import (
    DeliveryCode,
    HoldKind,
    OrderException,
    SmsStatus,
)
from app.modules.deliveries.service import (
    UNREACHABLE_WAIT,
    JobAction,
    JobSection,
    JobStatus,
    allowed_actions_for,
    delivery_area,
    delivery_day,
    dispatched_message,
    job_status_for,
    receiver_display_name,
    section_for,
    within_window,
)
from app.modules.dispatch.models import Assignment, AssignmentStatus
from app.modules.orders.models import Order, OrderStatus

# Mon 19 Oct 2026, 10:00 in Lagos (09:00 UTC).
NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)
TODAY = date(2026, 10, 19)


def make_order(status: OrderStatus, window_start: datetime | None = None) -> Order:
    return Order(
        id=uuid.uuid4(),
        reference="MO-7KQ2M9XH4T",
        status=status,
        quantity_litres=1200,
        contact_name="Ngozi Adeyemi",
        contact_phone="+2348000000001",
        delivery_address="12 Sample Close, Independence Layout, Enugu",
        delivery_window_start_at=window_start,
        delivery_window_end_at=window_start + timedelta(hours=3) if window_start else None,
        is_simulated=True,
    )


def make_code(**changes: object) -> DeliveryCode:
    fields: dict[str, object] = {
        "order_id": uuid.uuid4(),
        "code_hash": "x" * 64,
        "issued_at": NOW - timedelta(minutes=5),
        "expires_at": NOW - timedelta(minutes=5) + codes.CODE_LIFETIME,
        "attempts": 0,
        "used_at": None,
        "invalidated_at": None,
        "sms_status": SmsStatus.ACCEPTED,
        "issued_by": uuid.uuid4(),
    }
    fields.update(changes)
    return DeliveryCode(**fields)


def hold() -> OrderException:
    return OrderException(hold_kind=HoldKind.UNSAFE_STOP)


# --- Receiver and address ----------------------------------------------------


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Ngozi Adeyemi", "Ngozi A."),
        ("Ngozi Chidinma adeyemi", "Ngozi A."),
        ("Ngozi", "Ngozi"),
        ("  Ngozi  ", "Ngozi"),
    ],
)
def test_receiver_shows_first_name_and_last_initial_only(name: str, expected: str) -> None:
    assert receiver_display_name(name) == expected


def test_delivery_area_is_the_first_line_capped_at_120_characters() -> None:
    assert delivery_area("12 Sample Close\nIndependence Layout") == "12 Sample Close"
    long_line = "A" * 200
    area = delivery_area(long_line)
    assert len(area) == 120
    assert area.endswith("…")


# --- Job status and groups -----------------------------------------------------


@pytest.mark.parametrize(
    "status",
    [OrderStatus.DELIVERED, OrderStatus.DISPUTED, OrderStatus.FAILED, OrderStatus.CANCELLED],
)
def test_accepted_job_whose_order_ended_is_completed(status: OrderStatus) -> None:
    # failed is not terminal for the order (row 21 reschedules it) but it ends
    # this driver's job: a rescheduled order gets a new assignment.
    assignment = Assignment(status=AssignmentStatus.ACCEPTED)
    assert job_status_for(assignment, make_order(status)) is JobStatus.COMPLETED


def test_job_status_follows_the_assignment() -> None:
    order = make_order(OrderStatus.EN_ROUTE)
    for stored, expected in (
        (AssignmentStatus.OFFERED, JobStatus.OFFERED),
        (AssignmentStatus.ACCEPTED, JobStatus.ACCEPTED),
        (AssignmentStatus.COMPLETED, JobStatus.COMPLETED),
    ):
        assert job_status_for(Assignment(status=stored), order) is expected


@pytest.mark.parametrize(
    "status", [AssignmentStatus.DECLINED, AssignmentStatus.WITHDRAWN, AssignmentStatus.EXPIRED]
)
def test_jobs_the_driver_no_longer_holds_are_never_built(status: AssignmentStatus) -> None:
    with pytest.raises(ValueError, match="not visible"):
        job_status_for(Assignment(status=status), make_order(OrderStatus.CONFIRMED))


def test_open_offer_is_in_offers_whatever_its_day() -> None:
    later = NOW + timedelta(days=3)
    order = make_order(OrderStatus.ASSIGNED, later)
    assert section_for(JobStatus.OFFERED, order, None, TODAY) is JobSection.OFFER


def test_offer_whose_order_moved_on_is_not_listed() -> None:
    order = make_order(OrderStatus.CONFIRMED, NOW)
    assert section_for(JobStatus.OFFERED, order, None, TODAY) is None


def test_accepted_job_for_a_later_day_is_upcoming() -> None:
    # Thu 22 Oct 08:00 UTC = 09:00 Lagos.
    order = make_order(OrderStatus.ACCEPTED, datetime(2026, 10, 22, 8, 0, tzinfo=UTC))
    assert section_for(JobStatus.ACCEPTED, order, None, TODAY) is JobSection.UPCOMING


def test_job_moves_to_today_at_lagos_midnight_not_utc_midnight() -> None:
    # 23:30 UTC on 19 Oct is 00:30 on 20 Oct in Lagos: tomorrow's job.
    order = make_order(OrderStatus.ACCEPTED, datetime(2026, 10, 19, 23, 30, tzinfo=UTC))
    assert delivery_day(order) == date(2026, 10, 20)
    assert section_for(JobStatus.ACCEPTED, order, None, TODAY) is JobSection.UPCOMING
    assert section_for(JobStatus.ACCEPTED, order, None, date(2026, 10, 20)) is JobSection.TODAY


def test_overdue_and_unscheduled_accepted_jobs_stay_in_today() -> None:
    overdue = make_order(OrderStatus.EN_ROUTE, NOW - timedelta(days=1))
    unscheduled = make_order(OrderStatus.ACCEPTED, None)
    assert section_for(JobStatus.ACCEPTED, overdue, None, TODAY) is JobSection.TODAY
    assert section_for(JobStatus.ACCEPTED, unscheduled, None, TODAY) is JobSection.TODAY


def test_ended_job_is_done_today_and_gone_tomorrow() -> None:
    order = make_order(OrderStatus.DELIVERED, NOW)
    ended_at = NOW - timedelta(hours=1)
    assert section_for(JobStatus.COMPLETED, order, ended_at, TODAY) is JobSection.DONE
    assert section_for(JobStatus.COMPLETED, order, ended_at, TODAY + timedelta(days=1)) is None


# --- Allowed actions -----------------------------------------------------------


def actions(
    job_status: JobStatus,
    order: Order,
    *,
    open_hold: OrderException | None = None,
    code: DeliveryCode | None = None,
    unloading_completed_at: datetime | None = None,
    contacts: int = 0,
    arrived_at: datetime | None = None,
) -> list[JobAction]:
    return allowed_actions_for(
        job_status,
        order,
        hold=open_hold,
        delivery_code=code,
        today=TODAY,
        now=NOW,
        unloading_completed_at=unloading_completed_at,
        contact_attempt_count=contacts,
        unreachable_allowed_at=arrived_at + UNREACHABLE_WAIT if arrived_at else None,
    )


def test_offer_can_be_accepted_or_declined() -> None:
    order = make_order(OrderStatus.ASSIGNED, NOW)
    assert actions(JobStatus.OFFERED, order) == [JobAction.ACCEPT, JobAction.DECLINE]


def test_start_job_is_offered_only_from_the_delivery_day() -> None:
    later = make_order(OrderStatus.ACCEPTED, NOW + timedelta(days=2))
    today = make_order(OrderStatus.ACCEPTED, NOW + timedelta(hours=2))
    assert actions(JobStatus.ACCEPTED, later) == [JobAction.REPORT_INCIDENT]
    assert actions(JobStatus.ACCEPTED, today) == [JobAction.START_JOB, JobAction.REPORT_INCIDENT]


@pytest.mark.parametrize(
    ("status", "primary"),
    [
        (OrderStatus.DEPARTED, JobAction.RECORD_PICKUP),
        (OrderStatus.COLLECTED, JobAction.LEAVE_FOR_CUSTOMER),
        (OrderStatus.EN_ROUTE, JobAction.ARRIVE),
        # Unloading complete comes first: it issues the code (#67).
        (OrderStatus.UNLOADING, JobAction.COMPLETE_UNLOADING),
    ],
)
def test_each_step_has_one_primary_action(status: OrderStatus, primary: JobAction) -> None:
    result = actions(JobStatus.ACCEPTED, make_order(status, NOW), code=make_code())
    assert result == [primary, JobAction.REPORT_INCIDENT]


def test_a_hold_leaves_only_a_problem_report() -> None:
    order = make_order(OrderStatus.DEPARTED, NOW)
    assert actions(JobStatus.ACCEPTED, order, open_hold=hold()) == [JobAction.REPORT_INCIDENT]


def test_proof_is_offered_once_unloading_is_complete() -> None:
    order = make_order(OrderStatus.UNLOADING, NOW)
    done = NOW - timedelta(minutes=1)
    assert actions(JobStatus.ACCEPTED, order, code=make_code(), unloading_completed_at=done) == [
        JobAction.SUBMIT_PROOF,
        JobAction.REPORT_INCIDENT,
    ]


def test_new_code_is_offered_only_when_the_current_one_is_unusable() -> None:
    order = make_order(OrderStatus.UNLOADING, NOW)
    done = NOW - timedelta(minutes=12)
    usable = actions(JobStatus.ACCEPTED, order, code=make_code(), unloading_completed_at=done)
    expired = actions(
        JobStatus.ACCEPTED,
        order,
        code=make_code(expires_at=NOW - timedelta(seconds=1)),
        unloading_completed_at=done,
    )
    assert JobAction.REQUEST_NEW_CODE not in usable
    assert JobAction.REQUEST_NEW_CODE in expired


def test_no_new_code_before_unloading_is_complete() -> None:
    # #67: no code exists at arrival or while unloading, so none can be replaced.
    for status in (OrderStatus.ARRIVED, OrderStatus.UNLOADING):
        assert JobAction.REQUEST_NEW_CODE not in actions(
            JobStatus.ACCEPTED, make_order(status, NOW), arrived_at=NOW
        )


@pytest.mark.parametrize(
    ("contacts", "minutes_since_arrival", "offered"),
    [
        (2, 10, True),
        (3, 15, True),
        (1, 15, False),  # one attempt is not enough
        (2, 9, False),  # never before the full 10 minutes (#55)
        (0, 0, False),
    ],
)
def test_failed_attempt_needs_two_attempts_and_ten_minutes(
    contacts: int, minutes_since_arrival: int, offered: bool
) -> None:
    order = make_order(OrderStatus.ARRIVED, NOW)
    arrived_at = NOW - timedelta(minutes=minutes_since_arrival)
    result = actions(JobStatus.ACCEPTED, order, contacts=contacts, arrived_at=arrived_at)
    assert (JobAction.RECORD_FAILED_ATTEMPT in result) is offered
    assert result[:2] == [JobAction.START_UNLOADING, JobAction.RECORD_CONTACT_ATTEMPT]
    assert result[-1] is JobAction.REPORT_INCIDENT


def test_within_window_is_unknown_without_a_window() -> None:
    order = make_order(OrderStatus.EN_ROUTE, NOW)
    assert within_window(order, NOW) is True
    assert within_window(order, NOW + timedelta(hours=3)) is True
    assert within_window(order, NOW + timedelta(hours=3, seconds=1)) is False
    assert within_window(order, NOW - timedelta(seconds=1)) is False
    assert within_window(make_order(OrderStatus.EN_ROUTE), NOW) is None


def test_dispatched_message_is_one_sms_without_promises() -> None:
    text = dispatched_message("MO-7KQ2M9XH4T")
    assert len(text) <= 160
    assert "MO-7KQ2M9XH4T" in text and "dispatched" in text
    # FR-050: no promised arrival time or water-quality claim.
    for promise in ("safe", "clean", "pure", "minutes", "arrive at"):
        assert promise not in text.lower()


def test_completed_jobs_allow_nothing() -> None:
    assert actions(JobStatus.COMPLETED, make_order(OrderStatus.DELIVERED, NOW)) == []


# --- Delivery codes ------------------------------------------------------------


def test_delivery_code_lasts_10_minutes() -> None:
    # SRS v0.2 FR-035; validity is open decision 14 (technical lead, 2026-10-19).
    assert codes.CODE_LIFETIME == timedelta(minutes=10)


def test_matches_accepts_only_the_stored_code() -> None:
    code = make_code(id=uuid.uuid4())
    code.code_hash = codes.hash_code(code.id, "482913")
    assert codes.matches(code, "482913")
    assert not codes.matches(code, "482914")


def test_generated_codes_are_six_digits() -> None:
    for _ in range(200):
        code = codes.generate_code()
        assert len(code) == 6
        assert code.isdigit()


def test_code_hash_is_bound_to_the_row_and_hides_the_code() -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    assert codes.hash_code(first, "482913") != codes.hash_code(second, "482913")
    assert "482913" not in codes.hash_code(first, "482913")
    assert len(codes.hash_code(first, "482913")) == 64


def test_code_message_is_one_sms_and_mentions_unloading_and_lifetime() -> None:
    text = codes.code_message("482913")
    assert len(text) <= 160
    assert "482913" in text
    assert "unloaded" in text
    assert "10 minutes" in text


@pytest.mark.parametrize(
    ("code", "allowed"),
    [
        (None, True),
        (make_code(), False),
        (make_code(sms_status=SmsStatus.FAILED), True),
        (make_code(expires_at=NOW), True),
        (make_code(attempts=5), True),
        (make_code(attempts=4), False),
        (make_code(invalidated_at=NOW), True),
    ],
)
def test_new_code_allowed(code: DeliveryCode | None, allowed: bool) -> None:
    assert codes.new_code_allowed(code, NOW) is allowed
