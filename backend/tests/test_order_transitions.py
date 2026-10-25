"""The order state machine table (FR-033, docs/api/deliveries.md). No database."""

import re
from collections import Counter
from pathlib import Path

import pytest

from app.core.errors import APIError
from app.modules.orders.models import OrderStatus, TransitionReason
from app.modules.orders.transitions import RULES, Actor, Requirement, check_transition

S = OrderStatus
R = TransitionReason
Q = Requirement
CONTRACT = Path(__file__).resolve().parents[2] / "docs" / "api" / "deliveries.md"

DELIVERY_PROOF = {Q.DELIVERED_QUANTITY_RECORDED, Q.UNLOADING_CONFIRMED}


def error_of(**kwargs: object) -> APIError:
    with pytest.raises(APIError) as raised:
        check_transition(**kwargs)  # type: ignore[arg-type]
    return raised.value


def test_rules_match_the_contract_rows() -> None:
    # Rows 2-26 of the contract's table are rules; row 1 is POST /orders.
    text = CONTRACT.read_text()
    section = text[text.index("## Transitions") : text.index("## Assignment statuses")]
    rows = {int(n) for n in re.findall(r"^\| (\d+) \|", section, flags=re.M)}
    assert rows == set(range(1, 27))
    assert {rule.number for rule in RULES} == rows - {1}


def test_each_status_pair_has_at_most_one_rule_per_actor() -> None:
    keys = Counter(
        (source, rule.target, actor)
        for rule in RULES
        for source in rule.sources
        for actor in rule.actors
    )
    assert [key for key, count in keys.items() if count > 1] == []


def test_every_status_is_reachable_and_only_cancelled_is_terminal() -> None:
    targets = {rule.target for rule in RULES}
    assert targets == set(OrderStatus) - {S.QUOTE_REQUESTED}
    sources = {source for rule in RULES for source in rule.sources}
    assert set(OrderStatus) - sources == {S.CANCELLED}


def test_ordinary_progression_is_allowed_for_the_driver() -> None:
    steps = [
        (S.ASSIGNED, S.ACCEPTED, set()),
        (S.ACCEPTED, S.DEPARTED, set()),
        (S.DEPARTED, S.COLLECTED, {Q.PICKUP_RECORDED}),
        (S.COLLECTED, S.EN_ROUTE, set()),
        (S.EN_ROUTE, S.ARRIVED, set()),
        (S.ARRIVED, S.UNLOADING, set()),
        (S.UNLOADING, S.DELIVERED, DELIVERY_PROOF | {Q.DELIVERY_CODE_VERIFIED}),
    ]
    for source, target, satisfied in steps:
        check_transition(source=source, target=target, actor=Actor.DRIVER, satisfied=satisfied)


def test_t08_delivered_needs_proof() -> None:
    error = error_of(source=S.UNLOADING, target=S.DELIVERED, actor=Actor.DRIVER)
    assert (error.status_code, error.code) == (409, "transition_requirements_unmet")
    assert error.details == {
        "missing": ["delivered_quantity_recorded", "delivery_code_verified", "unloading_confirmed"]
    }

    partial = error_of(
        source=S.UNLOADING, target=S.DELIVERED, actor=Actor.DRIVER, satisfied=DELIVERY_PROOF
    )
    assert partial.details == {"missing": ["delivery_code_verified"]}

    # An approved alternative proof works instead of the code (FR-035).
    check_transition(
        source=S.UNLOADING,
        target=S.DELIVERED,
        actor=Actor.DRIVER,
        satisfied=DELIVERY_PROOF | {Q.PROOF_OVERRIDE_APPROVED},
    )


def test_admin_completes_only_with_approved_alternative_proof() -> None:
    error = error_of(
        source=S.UNLOADING,
        target=S.DELIVERED,
        actor=Actor.ADMIN,
        satisfied=DELIVERY_PROOF | {Q.DELIVERY_CODE_VERIFIED},
    )
    assert error.details == {"missing": ["proof_override_approved"]}


def test_skipping_a_step_is_an_invalid_transition() -> None:
    error = error_of(source=S.EN_ROUTE, target=S.DELIVERED, actor=Actor.DRIVER)
    assert (error.status_code, error.code) == (409, "invalid_order_transition")
    assert error.details == {"from": "en_route", "to": "delivered"}


def test_cancelled_is_terminal() -> None:
    for target in OrderStatus:
        error = error_of(source=S.CANCELLED, target=target, actor=Actor.ADMIN)
        assert error.code == "invalid_order_transition"


@pytest.mark.parametrize(
    ("source", "target", "actor"),
    [
        (S.CONFIRMED, S.ASSIGNED, Actor.CUSTOMER),  # only dispatchers assign
        (S.ASSIGNED, S.ACCEPTED, Actor.ADMIN),  # only the driver accepts (FR-032)
        (S.CONFIRMED, S.CANCELLED, Actor.DRIVER),
        (S.UNLOADING, S.CANCELLED, Actor.CUSTOMER),  # unloading started: admin review (FR-044)
        (S.ACCEPTED, S.CONFIRMED, Actor.DRIVER),  # a driver cannot un-accept
    ],
)
def test_wrong_actor_is_forbidden(source: S, target: S, actor: Actor) -> None:
    error = error_of(source=source, target=target, actor=actor)
    assert (error.status_code, error.code) == (403, "forbidden")


def test_each_actor_gives_its_own_reason_when_an_offer_returns() -> None:
    for actor, reason in [
        (Actor.DRIVER, R.DRIVER_DECLINED),
        (Actor.ADMIN, R.REASSIGNED),
        (Actor.SYSTEM, R.ASSIGNMENT_EXPIRED),
    ]:
        check_transition(source=S.ASSIGNED, target=S.CONFIRMED, actor=actor, reason_code=reason)
    error = error_of(
        source=S.ASSIGNED, target=S.CONFIRMED, actor=Actor.ADMIN, reason_code=R.DRIVER_DECLINED
    )
    assert (error.status_code, error.code) == (422, "validation_error")
    assert error.details[0]["loc"] == ["body", "reason_code"]  # type: ignore[index]


def test_reason_rules() -> None:
    missing = error_of(source=S.CONFIRMED, target=S.CANCELLED, actor=Actor.ADMIN)
    assert missing.code == "validation_error"

    other_without_note = error_of(
        source=S.CONFIRMED, target=S.CANCELLED, actor=Actor.ADMIN, reason_code=R.OTHER
    )
    assert other_without_note.details[0]["loc"] == ["body", "note"]  # type: ignore[index]
    check_transition(
        source=S.CONFIRMED,
        target=S.CANCELLED,
        actor=Actor.ADMIN,
        reason_code=R.OTHER,
        note="Duplicate of another request",
    )

    unexpected = error_of(
        source=S.EN_ROUTE, target=S.ARRIVED, actor=Actor.DRIVER, reason_code=R.OTHER
    )
    assert unexpected.code == "validation_error"

    too_long = error_of(source=S.EN_ROUTE, target=S.ARRIVED, actor=Actor.DRIVER, note="x" * 501)
    assert too_long.details[0]["loc"] == ["body", "note"]  # type: ignore[index]


def test_dispatcher_records_a_step_for_an_offline_driver_with_a_reason() -> None:
    error = error_of(source=S.EN_ROUTE, target=S.ARRIVED, actor=Actor.ADMIN)
    assert error.code == "validation_error"
    check_transition(
        source=S.EN_ROUTE,
        target=S.ARRIVED,
        actor=Actor.ADMIN,
        reason_code=R.RECORDED_FOR_DRIVER,
    )


def test_t25_customer_unreachable_needs_two_attempts_and_the_wait() -> None:
    error = error_of(
        source=S.ARRIVED,
        target=S.FAILED,
        actor=Actor.DRIVER,
        satisfied={Q.CONTACT_ATTEMPTS_RECORDED},
        reason_code=R.CUSTOMER_UNREACHABLE,
    )
    assert error.details == {"missing": ["unreachable_wait_elapsed"]}
    check_transition(
        source=S.ARRIVED,
        target=S.FAILED,
        actor=Actor.DRIVER,
        satisfied={Q.CONTACT_ATTEMPTS_RECORDED, Q.UNREACHABLE_WAIT_ELAPSED},
        reason_code=R.CUSTOMER_UNREACHABLE,
    )


def test_failed_can_be_rescheduled_and_disputes_resolve() -> None:
    check_transition(
        source=S.FAILED,
        target=S.CONFIRMED,
        actor=Actor.ADMIN,
        satisfied={Q.RESCHEDULE_ACKNOWLEDGED},
        reason_code=R.RESCHEDULED,
    )
    check_transition(
        source=S.DELIVERED, target=S.DISPUTED, actor=Actor.CUSTOMER, reason_code=R.MISSING_QUANTITY
    )
    check_transition(
        source=S.DISPUTED, target=S.DELIVERED, actor=Actor.ADMIN, reason_code=R.DISPUTE_RESOLVED
    )


def test_prepaid_and_pay_on_delivery_paths() -> None:
    check_transition(
        source=S.QUOTE_REQUESTED,
        target=S.AWAITING_PAYMENT,
        actor=Actor.CUSTOMER,
        satisfied={Q.QUOTE_ACCEPTED, Q.PREPAID},
    )
    # Pay on delivery never enters awaiting_payment.
    error = error_of(
        source=S.QUOTE_REQUESTED,
        target=S.AWAITING_PAYMENT,
        actor=Actor.CUSTOMER,
        satisfied={Q.QUOTE_ACCEPTED, Q.PAY_ON_DELIVERY},
    )
    assert error.details == {"missing": ["prepaid"]}
    check_transition(
        source=S.AWAITING_PAYMENT,
        target=S.CONFIRMED,
        actor=Actor.SYSTEM,
        satisfied={Q.PAYMENT_VERIFIED, Q.SOURCE_ELIGIBLE, Q.SLOT_RESERVED},
    )
    # A dispatcher confirms a prepaid order only once payment is verified.
    prepaid = error_of(
        source=S.AWAITING_CONFIRMATION,
        target=S.CONFIRMED,
        actor=Actor.ADMIN,
        satisfied={Q.PHONE_VERIFIED, Q.SOURCE_ELIGIBLE, Q.SLOT_RESERVED},
    )
    assert prepaid.code == "transition_requirements_unmet"
