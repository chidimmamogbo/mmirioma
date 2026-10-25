"""The order state machine: who may move an order from which status to which (FR-033).

This module is the code form of the transition table in
docs/api/deliveries.md; the ``number`` of each :class:`Rule` is its row
there. Keep the two in step: a change to one is a change to the other.

How a transition is checked (:func:`check_transition`), in this order:

1. **Prior status.** Some rule must lead from the order's status to the
   requested one, for any actor; otherwise 409 ``invalid_order_transition``.
2. **Actor.** A rule for that pair must allow the actor's kind (customer,
   admin, driver, system); otherwise 403 ``forbidden``. Whether a customer
   owns the order or a driver is its assigned driver is checked by the
   service before this (404 ``order_not_found``, T-07).
3. **Reason.** Rules listing reason codes require one of them; ``other``
   also needs a note. Rules without codes accept none. Otherwise 422
   ``validation_error``.
4. **Conditions.** Each rule lists one or more alternative sets of
   :class:`Requirement`. The calling feature checks its own records (a
   pickup record, a verified delivery code, two contact attempts…) and
   passes the requirements it has confirmed. At least one alternative must
   be fully met; otherwise 409 ``transition_requirements_unmet`` naming what
   is missing. This is how T-08 holds: ``delivered`` is unreachable without
   proof, whoever calls.

Rules whose evidence is recorded by a feature that does not exist yet can
never be satisfied, because nothing confirms their requirements.
"""

from collections.abc import Collection
from dataclasses import dataclass
from enum import StrEnum
from http import HTTPStatus

from app.core.errors import APIError
from app.modules.orders.models import EVENT_NOTE_MAX_LENGTH, OrderStatus, TransitionReason

S = OrderStatus
R = TransitionReason


class Actor(StrEnum):
    """Who asks for a transition (docs/api/deliveries.md, "Actors")."""

    CUSTOMER = "customer"
    ADMIN = "admin"
    # Only the order's assigned driver; the service checks which driver.
    DRIVER = "driver"
    # The server itself (payment verification, assignment timeout).
    SYSTEM = "system"


class Requirement(StrEnum):
    """Conditions a transition may need; names appear in error details."""

    QUOTE_ACCEPTED = "quote_accepted"
    PREPAID = "prepaid"
    PAY_ON_DELIVERY = "pay_on_delivery"
    DISPATCHER_CHECK_NEEDED = "dispatcher_check_needed"
    PHONE_VERIFIED = "phone_verified"
    SOURCE_ELIGIBLE = "source_eligible"
    SLOT_RESERVED = "slot_reserved"
    PAYMENT_VERIFIED = "payment_verified"
    DRIVER_ELIGIBLE = "driver_eligible"
    PICKUP_RECORDED = "pickup_recorded"
    DELIVERED_QUANTITY_RECORDED = "delivered_quantity_recorded"
    UNLOADING_CONFIRMED = "unloading_confirmed"
    DELIVERY_CODE_VERIFIED = "delivery_code_verified"
    PROOF_OVERRIDE_APPROVED = "proof_override_approved"
    CONTACT_ATTEMPTS_RECORDED = "contact_attempts_recorded"
    UNREACHABLE_WAIT_ELAPSED = "unreachable_wait_elapsed"
    RESCHEDULE_ACKNOWLEDGED = "reschedule_acknowledged"
    CANCELLATION_OUTCOME_RECORDED = "cancellation_outcome_recorded"
    # Row 7 in the pilot: the dispatcher typed the confirmed window agreed
    # with the customer (fallback F3); ``slot_reserved`` stays for slots.
    DELIVERY_WINDOW_SET = "delivery_window_set"
    # Checked by the driver job endpoints, not by a row of this table: a
    # driver starts a job (row 12) only from its delivery day (driver job
    # decision 3). Listed here so every condition name has one home.
    DELIVERY_DAY_REACHED = "delivery_day_reached"
    # Checked by the cash collection endpoint (docs/api/payments.md), not by a
    # row: cash is recorded only after unloading (BR-15), on an order with a
    # price snapshot to compare the cash against.
    UNLOADING_COMPLETED = "unloading_completed"
    PRICE_RECORDED = "price_recorded"


Q = Requirement


@dataclass(frozen=True)
class Rule:
    """One row (or one actor's part of a row) of the transition table.

    Attributes:
        number: Row number in docs/api/deliveries.md.
        sources: Statuses the order may be in.
        target: Status it moves to.
        actors: Who may make it.
        requires: Alternative sets of requirements; one set must be fully
            met. ``(frozenset(),)`` means no conditions.
        reasons: Allowed reason codes. Non-empty: one is required. Empty: a
            reason code is not accepted.
    """

    number: int
    sources: frozenset[OrderStatus]
    target: OrderStatus
    actors: frozenset[Actor]
    requires: tuple[frozenset[Requirement], ...] = (frozenset(),)
    reasons: frozenset[TransitionReason] = frozenset()


def _rule(
    number: int,
    sources: Collection[OrderStatus],
    target: OrderStatus,
    actors: Collection[Actor],
    *requires: Collection[Requirement],
    reasons: Collection[TransitionReason] = (),
) -> Rule:
    return Rule(
        number=number,
        sources=frozenset(sources),
        target=target,
        actors=frozenset(actors),
        requires=tuple(frozenset(alternative) for alternative in requires) or (frozenset(),),
        reasons=frozenset(reasons),
    )


A = Actor
# The driver's steps, which a dispatcher may record for an offline driver (SRS §8).
_DRIVER_STEPS = (
    (12, S.ACCEPTED, S.DEPARTED, ()),
    (13, S.DEPARTED, S.COLLECTED, (Q.PICKUP_RECORDED,)),
    (14, S.COLLECTED, S.EN_ROUTE, ()),
    (15, S.EN_ROUTE, S.ARRIVED, ()),
    (16, S.ARRIVED, S.UNLOADING, ()),
)
_FAILABLE = (
    S.ASSIGNED,
    S.ACCEPTED,
    S.DEPARTED,
    S.COLLECTED,
    S.EN_ROUTE,
    S.ARRIVED,
    S.UNLOADING,
)
_CUSTOMER_CANCELLABLE = (
    S.QUOTE_REQUESTED,
    S.AWAITING_PAYMENT,
    S.AWAITING_CONFIRMATION,
    S.CONFIRMED,
    S.ASSIGNED,
    S.ACCEPTED,
    S.DEPARTED,
    S.COLLECTED,
    S.EN_ROUTE,
    S.ARRIVED,
)
_ADMIN_CANCELLABLE = tuple(
    status for status in OrderStatus if status not in {S.CANCELLED, S.DELIVERED, S.DISPUTED}
)

RULES: tuple[Rule, ...] = (
    # Row 1 (creation) is POST /orders in service.create_order, not a transition.
    _rule(2, [S.QUOTE_REQUESTED], S.AWAITING_PAYMENT, [A.CUSTOMER], [Q.QUOTE_ACCEPTED, Q.PREPAID]),
    _rule(
        3,
        [S.QUOTE_REQUESTED],
        S.AWAITING_CONFIRMATION,
        [A.CUSTOMER],
        [Q.QUOTE_ACCEPTED, Q.PAY_ON_DELIVERY, Q.DISPATCHER_CHECK_NEEDED],
    ),
    _rule(
        4,
        [S.QUOTE_REQUESTED],
        S.CONFIRMED,
        [A.CUSTOMER],
        [Q.QUOTE_ACCEPTED, Q.PAY_ON_DELIVERY, Q.PHONE_VERIFIED, Q.SOURCE_ELIGIBLE, Q.SLOT_RESERVED],
    ),
    _rule(
        5,
        [S.AWAITING_PAYMENT],
        S.CONFIRMED,
        [A.SYSTEM, A.ADMIN],
        [Q.PAYMENT_VERIFIED, Q.SOURCE_ELIGIBLE, Q.SLOT_RESERVED],
    ),
    _rule(
        6,
        [S.AWAITING_PAYMENT],
        S.AWAITING_CONFIRMATION,
        [A.SYSTEM, A.ADMIN],
        [Q.PAYMENT_VERIFIED, Q.DISPATCHER_CHECK_NEEDED],
    ),
    # Row 7: "payment verified if prepaid" is two alternatives. The pilot's
    # third: a window typed by the dispatcher instead of a reserved slot (F3,
    # order confirmation decision 5); pilot orders are pay on delivery (F4).
    _rule(
        7,
        [S.AWAITING_CONFIRMATION],
        S.CONFIRMED,
        [A.ADMIN],
        [Q.PHONE_VERIFIED, Q.SOURCE_ELIGIBLE, Q.SLOT_RESERVED, Q.PAY_ON_DELIVERY],
        [Q.PHONE_VERIFIED, Q.SOURCE_ELIGIBLE, Q.SLOT_RESERVED, Q.PAYMENT_VERIFIED],
        [Q.PHONE_VERIFIED, Q.SOURCE_ELIGIBLE, Q.DELIVERY_WINDOW_SET, Q.PAY_ON_DELIVERY],
    ),
    _rule(8, [S.CONFIRMED], S.ASSIGNED, [A.ADMIN], [Q.DRIVER_ELIGIBLE]),
    _rule(9, [S.ASSIGNED], S.ACCEPTED, [A.DRIVER]),
    # Row 10 has one reason per actor.
    _rule(10, [S.ASSIGNED], S.CONFIRMED, [A.DRIVER], reasons=[R.DRIVER_DECLINED]),
    _rule(10, [S.ASSIGNED], S.CONFIRMED, [A.ADMIN], reasons=[R.REASSIGNED]),
    _rule(10, [S.ASSIGNED], S.CONFIRMED, [A.SYSTEM], reasons=[R.ASSIGNMENT_EXPIRED]),
    _rule(11, [S.ACCEPTED], S.CONFIRMED, [A.ADMIN], reasons=[R.REASSIGNED]),
    *(
        rule
        for number, source, target, requires in _DRIVER_STEPS
        for rule in (
            _rule(number, [source], target, [A.DRIVER], requires),
            _rule(number, [source], target, [A.ADMIN], requires, reasons=[R.RECORDED_FOR_DRIVER]),
        )
    ),
    _rule(
        17,
        [S.UNLOADING],
        S.DELIVERED,
        [A.DRIVER],
        [Q.DELIVERED_QUANTITY_RECORDED, Q.UNLOADING_CONFIRMED, Q.DELIVERY_CODE_VERIFIED],
        [Q.DELIVERED_QUANTITY_RECORDED, Q.UNLOADING_CONFIRMED, Q.PROOF_OVERRIDE_APPROVED],
    ),
    _rule(
        18,
        [S.UNLOADING],
        S.DELIVERED,
        [A.ADMIN],
        [Q.DELIVERED_QUANTITY_RECORDED, Q.UNLOADING_CONFIRMED, Q.PROOF_OVERRIDE_APPROVED],
    ),
    _rule(
        19,
        [S.ARRIVED],
        S.FAILED,
        [A.DRIVER],
        [Q.CONTACT_ATTEMPTS_RECORDED, Q.UNREACHABLE_WAIT_ELAPSED],
        reasons=[R.CUSTOMER_UNREACHABLE],
    ),
    _rule(
        20,
        _FAILABLE,
        S.FAILED,
        [A.ADMIN],
        reasons=[
            R.CUSTOMER_UNREACHABLE,
            R.UNSAFE_ACCESS,
            R.VEHICLE_FAILURE,
            R.SOURCE_QUALITY_CONCERN,
            R.OTHER,
        ],
    ),
    _rule(
        21,
        [S.FAILED],
        S.CONFIRMED,
        [A.ADMIN],
        [Q.RESCHEDULE_ACKNOWLEDGED],
        reasons=[R.RESCHEDULED],
    ),
    _rule(
        22,
        _CUSTOMER_CANCELLABLE,
        S.CANCELLED,
        [A.CUSTOMER],
        [Q.CANCELLATION_OUTCOME_RECORDED],
        reasons=[R.CUSTOMER_REQUEST],
    ),
    _rule(
        23,
        _ADMIN_CANCELLABLE,
        S.CANCELLED,
        [A.ADMIN],
        reasons=[R.CUSTOMER_REQUEST, R.MMIRIOMA_UNABLE, R.OTHER],
    ),
    _rule(
        24,
        [S.DELIVERED],
        S.DISPUTED,
        [A.CUSTOMER, A.ADMIN],
        reasons=[R.MISSING_QUANTITY, R.WATER_QUALITY, R.HANDLING, R.OTHER],
    ),
    _rule(25, [S.DISPUTED], S.DELIVERED, [A.ADMIN], reasons=[R.DISPUTE_RESOLVED]),
    # Row 26 (order confirmation, #113). Its condition, a manual quote with
    # the customer's agreement written in the same transaction as row 7, is
    # enforced by the confirmation service, the only caller of this row: no
    # endpoint offers it on its own.
    _rule(26, [S.QUOTE_REQUESTED], S.AWAITING_CONFIRMATION, [A.ADMIN], reasons=[R.MANUAL_QUOTE]),
)


def _invalid(source: OrderStatus, target: OrderStatus) -> APIError:
    return APIError(
        HTTPStatus.CONFLICT,
        "invalid_order_transition",
        f"This order cannot move from {source} to {target}.",
        details={"from": source.value, "to": target.value},
    )


def _invalid_reason(message: str, field: str = "reason_code") -> APIError:
    # Same envelope as request validation, so clients handle one 422 shape.
    return APIError(
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "validation_error",
        "Request validation failed",
        details=[{"loc": ["body", field], "msg": message, "type": "value_error"}],
    )


def check_transition(
    *,
    source: OrderStatus,
    target: OrderStatus,
    actor: Actor,
    satisfied: Collection[Requirement] = (),
    reason_code: TransitionReason | None = None,
    note: str | None = None,
) -> Rule:
    """Check that ``actor`` may move an order from ``source`` to ``target``.

    Ownership (the customer's own order, the assigned driver) is checked by
    the caller first; see the module docstring for the order of checks.

    Args:
        source: The order's current status.
        target: The requested status.
        actor: Who asks.
        satisfied: Requirements the calling feature has confirmed from its
            own records.
        reason_code: Reason, where the rule requires one.
        note: Optional free text; required with ``other``.

    Returns:
        The matching rule.

    Raises:
        APIError: 409 ``invalid_order_transition``; 403 ``forbidden``;
            422 ``validation_error`` (reason or note); 409
            ``transition_requirements_unmet`` with ``details.missing``.
    """
    candidates = [rule for rule in RULES if source in rule.sources and rule.target is target]
    if not candidates:
        raise _invalid(source, target)
    rule = next((rule for rule in candidates if actor in rule.actors), None)
    if rule is None:
        raise APIError(HTTPStatus.FORBIDDEN, "forbidden", "You do not have access to this resource")

    if rule.reasons:
        if reason_code is None or reason_code not in rule.reasons:
            allowed = ", ".join(sorted(reason.value for reason in rule.reasons))
            raise _invalid_reason(f"Give one of: {allowed}")
        if reason_code is TransitionReason.OTHER and not (note and note.strip()):
            raise _invalid_reason("A note is required with reason other", field="note")
    elif reason_code is not None:
        raise _invalid_reason("This step takes no reason code")
    if note is not None and len(note) > EVENT_NOTE_MAX_LENGTH:
        raise _invalid_reason(f"Use {EVENT_NOTE_MAX_LENGTH} characters or fewer", field="note")

    met = frozenset(satisfied)
    if not any(alternative <= met for alternative in rule.requires):
        # Report the alternative closest to being met (fewest missing).
        closest = min(rule.requires, key=lambda alternative: len(alternative - met))
        raise APIError(
            HTTPStatus.CONFLICT,
            "transition_requirements_unmet",
            "This step needs more information before it can be recorded.",
            details={"missing": sorted(requirement.value for requirement in closest - met)},
        )
    return rule
