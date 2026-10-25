"""Admin hold review against a real, migrated database (docs/api/deliveries.md, #93).

Covers the three holds end to end through the services the endpoints call:
alternative proof approved (row 18, FR-035, BR-12) or rejected and proved
again with a code; the BR-13 refusal (T-23); source review, which never
continues with a free-text source (FR-012, decision 7) and closes both of a
pickup's exceptions as one hold; unsafe stop resumed, or withdrawn before
departure (row 11); failing (row 20) and cancelling with ``mmirioma_unable``
(row 23) with no charge; stale and racing decisions (``hold_not_open``);
the audit rows (NFR-004); the On hold list filter (R0); and the history,
which is unchanged unless hold entries are asked for (decision 8).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards.
"""

import asyncio
from collections.abc import Awaitable, Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.deliveries import holds, service
from app.modules.deliveries.admin_schemas import (
    AdminOrderEventWithHolds,
    HoldReviewRead,
    hold_read,
)
from app.modules.deliveries.models import (
    CustomerAcknowledgementMethod,
    DeliveryAttempt,
    DeliveryCode,
    DeliveryOutcome,
    DeliveryProof,
    ExceptionCategory,
    HoldKind,
    HoldResolution,
    OrderException,
    OverrideStatus,
)
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import Assignment, AssignmentStatus
from app.modules.messaging.sms import MockSmsProvider
from app.modules.orders.models import Order, OrderStatus, TransitionReason
from tests import test_deliveries_integration as part1
from tests.test_deliveries_integration import (
    TEST_DATABASE_URL,
    Created,
    Sessions,
    Setup,
    add_job,
    add_user,
    run,
    setup,
)
from tests.test_driver_job_steps_integration import (
    WINDOW_START,
    alternative_proof,
    code_issued,
    code_proof,
    sent_code,
    to_en_route,
)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

S = OrderStatus

# Same fixture as part 1: creates rows for one test and deletes them after.
created = part1.created


@pytest.fixture(autouse=True)
def delete_audit_rows(created: Created) -> Iterator[None]:
    """Delete the audit rows this module writes.

    They reference users (RESTRICT). This fixture depends on ``created``, so
    its teardown runs first, before part 1 deletes the users.
    """
    yield
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", (created.user_ids,))


async def expect_error(awaitable: Awaitable[object]) -> APIError:
    """The API error an awaitable raises; the test checks status and code."""
    with pytest.raises(APIError) as caught:
        await awaitable
    return caught.value


def acknowledgment() -> holds.CustomerAcknowledgment:
    return holds.CustomerAcknowledgment(
        method=CustomerAcknowledgementMethod.PHONE_CALL,
        confirmed_at=datetime.now(UTC),
        note=None,
    )


async def order_of(sessions: Sessions, reference: str) -> Order:
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
        assert order is not None
        return order


async def exceptions_of(sessions: Sessions, reference: str) -> list[OrderException]:
    order = await order_of(sessions, reference)
    async with sessions() as session:
        return list(
            await session.scalars(
                select(OrderException)
                .where(OrderException.order_id == order.id)
                .order_by(OrderException.created_at, OrderException.id)
            )
        )


async def audit_actions(sessions: Sessions, reference: str) -> list[str]:
    order = await order_of(sessions, reference)
    async with sessions() as session:
        return list(
            await session.scalars(
                select(AuditLog.action)
                .where(AuditLog.target_type == "order", AuditLog.target_id == order.id)
                .order_by(AuditLog.created_at)
            )
        )


async def on_proof_review(
    sessions: Sessions, s: Setup, driver: User, *, litres: int = 1200
) -> tuple[str, MockSmsProvider, OrderException]:
    """A job that sent alternative proof; returns reference, SMS outbox and the hold."""
    reference, sms, _ = await code_issued(sessions, s, driver)
    proof = alternative_proof()
    async with sessions() as session:
        await service.submit_proof(
            session,
            driver=driver,
            reference=reference,
            proof=service.NewProof(
                delivered_litres=litres,
                delivery_code=None,
                alternative_reason=proof.alternative_reason,
                alternative_note=proof.alternative_note,
                location=None,
            ),
        )
    async with sessions() as session:
        detail = await holds.get_order_detail(session, reference=reference)
    assert detail.hold is not None and detail.hold.hold_kind is HoldKind.PROOF_REVIEW
    return reference, sms, detail.hold


# --- Proof review (R1) ---------------------------------------------------------------


def test_approving_proof_delivers_and_records_the_decision(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, _, hold = await on_proof_review(sessions, s, driver)

        # R0: the list shows the hold and the On hold filter finds it.
        async with sessions() as session:
            held, total = await holds.list_orders(
                session,
                statuses=[],
                created_from=None,
                created_to=None,
                is_simulated=None,
                on_hold=True,
                limit=100,
                offset=0,
            )
        mine = [item for item in held if item.staff_order.order.reference == reference]
        assert len(mine) == 1 and mine[0].hold is not None and mine[0].hold.id == hold.id
        assert total >= 1

        # R1: the evidence, never the code.
        async with sessions() as session:
            review = await holds.get_hold_review(session, reference=reference)
        assert review.proof is not None
        assert review.proof.delivered_litres == 1200
        assert review.proof.unloading_completed_at is not None
        assert review.proof.delivery_code is not None
        assert review.proof.location is None
        assert review.pickup is None and review.report is None
        assert review.withdraw_allowed is False
        body = HoldReviewRead.from_review(review).model_dump(mode="json")
        assert body["kind"] == "proof_review" and body["driver"]["id"] == str(driver.id)
        assert body["proof"]["delivery_code"]["attempts_limit"] == 5
        assert hold_read(mine[0].hold) is not None

        async with sessions() as session:
            detail = await holds.decide_proof(
                session,
                reference=reference,
                admin=s.admin,
                hold_id=hold.id,
                decision=holds.ProofDecision.APPROVE,
                acknowledgment=acknowledgment(),
                note="Customer confirmed 1,200 litres by phone.",
            )
        assert detail.dispatch.staff_order.order.status is S.DELIVERED
        assert detail.hold is None

        order = await order_of(sessions, reference)
        async with sessions() as session:
            proof = await session.scalar(
                select(DeliveryProof).where(DeliveryProof.order_id == order.id)
            )
            assignment = await session.scalar(
                select(Assignment).where(Assignment.order_id == order.id)
            )
            attempt = await session.scalar(
                select(DeliveryAttempt).where(DeliveryAttempt.order_id == order.id)
            )
            codes = list(
                await session.scalars(select(DeliveryCode).where(DeliveryCode.order_id == order.id))
            )
        assert proof is not None and proof.override_status is OverrideStatus.APPROVED
        assert proof.override_decided_by == s.admin.id
        assert proof.customer_ack_method is CustomerAcknowledgementMethod.PHONE_CALL
        assert assignment is not None and assignment.status is AssignmentStatus.COMPLETED
        assert attempt is not None and attempt.outcome is DeliveryOutcome.DELIVERED
        assert all(code.invalidated_at is not None for code in codes)
        closed = (await exceptions_of(sessions, reference))[0]
        assert (closed.resolution, closed.resolved_by) == (
            HoldResolution.PROOF_APPROVED,
            s.admin.id,
        )
        assert await audit_actions(sessions, reference) == ["proof_override_approved"]

        # The driver's job is done, with the approved litres.
        async with sessions() as session:
            jobs = await service.list_driver_jobs(session, driver_id=driver.id)
        done = [job for job in jobs.done if job.order.reference == reference]
        assert len(done) == 1 and done[0].delivered_litres == 1200

    run(scenario)


def test_t23_the_delivering_user_cannot_approve_but_can_reject(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, _, hold = await on_proof_review(sessions, s, driver)
        # The administrator recorded this proof themselves (BR-13).
        order = await order_of(sessions, reference)
        async with sessions() as session:
            proof = await session.scalar(
                select(DeliveryProof).where(DeliveryProof.order_id == order.id)
            )
            assert proof is not None
            proof.recorded_by = s.admin.id
            await session.commit()

        async with sessions() as session:
            error = await expect_error(
                holds.decide_proof(
                    session,
                    reference=reference,
                    admin=s.admin,
                    hold_id=hold.id,
                    decision=holds.ProofDecision.APPROVE,
                    acknowledgment=acknowledgment(),
                    note="Approving my own delivery.",
                )
            )
        assert (error.status_code, error.code) == (403, "own_delivery_override")
        assert (await order_of(sessions, reference)).status is S.UNLOADING
        assert await audit_actions(sessions, reference) == []

        async with sessions() as session:
            await holds.decide_proof(
                session,
                reference=reference,
                admin=s.admin,
                hold_id=hold.id,
                decision=holds.ProofDecision.REJECT,
                acknowledgment=None,
                note="Recorded by the wrong account.",
            )
        assert (await order_of(sessions, reference)).status is S.UNLOADING

    run(scenario)


def test_a_rejected_proof_lets_the_driver_prove_again_with_a_code(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, sms, hold = await on_proof_review(sessions, s, driver, litres=1000)
        async with sessions() as session:
            detail = await holds.decide_proof(
                session,
                reference=reference,
                admin=s.admin,
                hold_id=hold.id,
                decision=holds.ProofDecision.REJECT,
                acknowledgment=None,
                note="The person who answered is not the customer.",
            )
        assert detail.dispatch.staff_order.order.status is S.UNLOADING
        assert detail.hold is None
        rows = await exceptions_of(sessions, reference)
        # The hold and the partial delivery opened with that proof are closed.
        by_category = {row.category: row for row in rows}
        assert by_category[ExceptionCategory.ALTERNATIVE_PROOF].resolution is (
            HoldResolution.PROOF_REJECTED
        )
        assert by_category[ExceptionCategory.PARTIAL_DELIVERY].resolved_at is not None
        assert await audit_actions(sessions, reference) == ["proof_override_rejected"]

        # No hold. The first code has expired by now (10 minutes, FR-035), so
        # the driver sends a new one and the customer gives it.
        later = datetime.now(UTC) + timedelta(minutes=11)
        async with sessions() as session:
            job = await service.get_driver_job(session, driver_id=driver.id, reference=reference)
        assert job.hold is None
        async with sessions() as session:
            await service.issue_new_delivery_code(
                session, driver=driver, reference=reference, sms=sms, now=later
            )
        async with sessions() as session:
            _, delivered = await service.submit_proof(
                session,
                driver=driver,
                reference=reference,
                proof=code_proof(sent_code(sms)),
                now=later,
            )
        assert delivered is True
        assert (await order_of(sessions, reference)).status is S.DELIVERED

    run(scenario)


def test_stale_and_racing_decisions_are_refused(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        other_admin = await add_user(sessions, created, UserRole.ADMIN)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, _, hold = await on_proof_review(sessions, s, driver)

        # The right hold through the wrong endpoint.
        async with sessions() as session:
            error = await expect_error(
                holds.resume_unsafe(
                    session, reference=reference, admin=s.admin, hold_id=hold.id, note="x"
                )
            )
        assert (error.status_code, error.code) == (409, "hold_not_open")

        async def approve(admin: User) -> object:
            async with sessions() as session:
                try:
                    return await holds.decide_proof(
                        session,
                        reference=reference,
                        admin=admin,
                        hold_id=hold.id,
                        decision=holds.ProofDecision.APPROVE,
                        acknowledgment=acknowledgment(),
                        note="Confirmed by phone.",
                    )
                except Exception as error:  # noqa: BLE001 - the race outcome is checked below
                    return error

        results = await asyncio.gather(approve(s.admin), approve(other_admin))
        errors = [result for result in results if isinstance(result, Exception)]
        assert len(errors) == 1
        assert getattr(errors[0], "code", None) == "hold_not_open"
        assert await audit_actions(sessions, reference) == ["proof_override_approved"]

    run(scenario)


# --- Source review (R2) --------------------------------------------------------------


async def on_source_review(sessions: Sessions, s: Setup, driver: User) -> tuple[str, str]:
    """A job collected at another source with a safety concern (two exceptions)."""
    reference = await add_job(
        sessions, s, driver, order_status=S.ACCEPTED, window_start=WINDOW_START
    )
    async with sessions() as session:
        await service.take_step(
            session,
            driver=driver,
            reference=reference,
            step=service.DriverStep.DEPARTED,
            note=None,
            sms=MockSmsProvider(),
        )
    async with sessions() as session:
        await service.record_pickup(
            session,
            driver=driver,
            reference=reference,
            pickup=service.NewPickup(
                assigned_source=False,
                other_source_name="Sample Borehole B",
                source_reference="R-20481",
                volume_collected_litres=1200,
                picked_up_at=datetime.now(UTC),
                safety_concern=True,
                safety_note="The area around the tank was flooded.",
            ),
        )
    async with sessions() as session:
        detail = await holds.get_order_detail(session, reference=reference)
    assert detail.hold is not None and detail.hold.hold_kind is HoldKind.SOURCE_REVIEW
    return reference, str(detail.hold.id)


def test_source_review_never_continues_with_a_free_text_source(
    created: Created, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, hold_id = await on_source_review(sessions, s, driver)

        async with sessions() as session:
            review = await holds.get_hold_review(session, reference=reference)
        assert review.pickup is not None
        assert review.pickup.pickup.other_source_name == "Sample Borehole B"
        assert review.pickup.assigned_source is not None
        # A source named in free text is never in the records (decision 7).
        assert review.source_eligibility == holds.SourceEligibility(
            holds.EligibilityAnswer.NOT_ELIGIBLE, "This source is not in the source records."
        )
        body = HoldReviewRead.from_review(review).model_dump(mode="json")
        assert body["pickup"]["used_source"] == {"assigned": False, "name": "Sample Borehole B"}
        assert body["pickup"]["assigned_source"]["name"] == "Sample Borehole A"
        assert body["source_eligibility"]["answer"] == "not_eligible"

        async with sessions() as session:
            error = await expect_error(
                holds.continue_source(
                    session, reference=reference, admin=s.admin, hold_id=review.hold.id, note="Go."
                )
            )
        assert (error.status_code, error.code) == (409, "source_not_eligible")
        assert error.details == {"answer": "not_eligible"}

        # When the answer is "eligible" (a recorded source, #109; see
        # test_water_sources_integration.py), one decision closes both exceptions.
        async def eligible(*_args: object, **_kwargs: object) -> holds.SourceEligibility:
            return holds.SourceEligibility(holds.EligibilityAnswer.ELIGIBLE, "Eligible.")

        monkeypatch.setattr(holds, "source_eligibility", eligible)
        async with sessions() as session:
            detail = await holds.continue_source(
                session,
                reference=reference,
                admin=s.admin,
                hold_id=review.hold.id,
                note="Source records match the order category.",
            )
        assert detail.hold is None
        assert detail.dispatch.staff_order.order.status is S.COLLECTED
        source_holds = [
            row
            for row in await exceptions_of(sessions, reference)
            if row.hold_kind is HoldKind.SOURCE_REVIEW
        ]
        assert len(source_holds) == 2
        assert {row.resolution for row in source_holds} == {HoldResolution.SOURCE_CONTINUED}
        assert await audit_actions(sessions, reference) == ["source_review_continued"]
        assert hold_id == str(source_holds[0].id)

        async with sessions() as session:
            items = await holds.order_history(session, reference=reference, include_holds=True)
        hold_entries = [item for item in items if isinstance(item, holds.HoldEntry)]
        kinds = [entry.kind for entry in hold_entries]
        assert kinds.count(holds.HistoryKind.HOLD_OPENED) == 2
        assert kinds.count(holds.HistoryKind.HOLD_DECIDED) == 1
        rendered = [
            AdminOrderEventWithHolds.from_item(item, {}).model_dump(mode="json") for item in items
        ]
        assert len({entry["id"] for entry in rendered}) == len(rendered)
        assert {
            entry["hold"]["category"] for entry in rendered if entry["kind"] == "hold_opened"
        } == {
            "source_mismatch",
            "pickup_safety_concern",
        }

    run(scenario)


def test_failing_from_a_source_review_closes_its_holds(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, hold_id = await on_source_review(sessions, s, driver)
        async with sessions() as session:
            hold = (await holds.get_hold_review(session, reference=reference)).hold

        async with sessions() as session:
            stale = await expect_error(
                holds.transition_with_holds(
                    session,
                    reference=reference,
                    admin=s.admin,
                    target=S.FAILED,
                    expected_status=S.EN_ROUTE,
                    reason_code=TransitionReason.SOURCE_QUALITY_CONCERN,
                    note=None,
                    hold_id=hold.id,
                )
            )
        assert (stale.status_code, stale.code) == (409, "invalid_order_transition")

        async with sessions() as session:
            detail = await holds.transition_with_holds(
                session,
                reference=reference,
                admin=s.admin,
                target=S.FAILED,
                expected_status=S.COLLECTED,
                reason_code=TransitionReason.SOURCE_QUALITY_CONCERN,
                note="Source flooded. Driver cannot use it.",
                hold_id=hold.id,
            )
        assert detail.dispatch.staff_order.order.status is S.FAILED
        assert detail.hold is None
        assert detail.dispatch.assignment is not None
        assert detail.dispatch.assignment.assignment.status is AssignmentStatus.COMPLETED
        rows = [r for r in await exceptions_of(sessions, reference) if r.hold_kind is not None]
        assert {row.resolution for row in rows} == {HoldResolution.FAILED}
        assert str(rows[0].id) == hold_id

    run(scenario)


# --- Unsafe stop (R3), withdraw and cancel ---------------------------------------------


async def report_unsafe(sessions: Sessions, driver: User, reference: str) -> None:
    async with sessions() as session:
        await service.report_incident(
            session,
            driver=driver,
            reference=reference,
            incident=service.NewIncident(
                category=ExceptionCategory.UNSAFE_ACCESS,
                note="The tank is behind a locked gate and a dog is loose.",
                new_estimated_arrival_at=None,
            ),
        )


def test_an_unsafe_stop_resumes_with_a_safe_alternative(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await to_en_route(sessions, s, driver)
        await report_unsafe(sessions, driver, reference)

        async with sessions() as session:
            review = await holds.get_hold_review(session, reference=reference)
        assert review.report is not None
        assert review.report.kind is ExceptionCategory.UNSAFE_ACCESS
        assert review.report.order_status_then is S.EN_ROUTE
        assert review.withdraw_allowed is False
        body = HoldReviewRead.from_review(review).model_dump(mode="json")
        assert body["report"]["kind"] == "unsafe_access"
        assert body["incidents"] == []

        async with sessions() as session:
            detail = await holds.resume_unsafe(
                session,
                reference=reference,
                admin=s.admin,
                hold_id=review.hold.id,
                note="Customer moved the tank to the gate and tied the dog up.",
            )
        assert detail.hold is None
        assert detail.dispatch.staff_order.order.status is S.EN_ROUTE
        async with sessions() as session:
            job = await service.get_driver_job(session, driver_id=driver.id, reference=reference)
        assert job.hold is None
        assert await audit_actions(sessions, reference) == ["unsafe_stop_resumed"]

    run(scenario)


def test_withdrawing_before_departure_closes_the_unsafe_stop(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await add_job(
            sessions, s, driver, order_status=S.ACCEPTED, window_start=WINDOW_START
        )
        await report_unsafe(sessions, driver, reference)
        async with sessions() as session:
            review = await holds.get_hold_review(session, reference=reference)
        assert review.withdraw_allowed is True

        async with sessions() as session:
            detail = await holds.withdraw_job(
                session,
                reference=reference,
                admin=s.admin,
                expected_status=AssignmentStatus.ACCEPTED,
                note="Unsafe access; choosing another driver.",
            )
        assert detail.dispatch.staff_order.order.status is S.CONFIRMED
        assert detail.hold is None
        rows = [r for r in await exceptions_of(sessions, reference) if r.hold_kind is not None]
        assert [row.resolution for row in rows] == [HoldResolution.WITHDRAWN]

    run(scenario)


def test_cancelling_with_mmirioma_unable_is_free_and_ends_the_job(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await to_en_route(sessions, s, driver)
        await report_unsafe(sessions, driver, reference)

        async with sessions() as session:
            outcome = await holds.cancellation_outcome(
                session, reference=reference, reason_code=TransitionReason.MMIRIOMA_UNABLE
            )
        assert outcome.customer_charge_minor_units == 0
        assert outcome.message == "The customer is not charged for this cancellation."
        async with sessions() as session:
            unsupported = await expect_error(
                holds.cancellation_outcome(
                    session, reference=reference, reason_code=TransitionReason.CUSTOMER_REQUEST
                )
            )
        assert (unsupported.status_code, unsupported.code) == (422, "validation_error")

        async with sessions() as session:
            detail = await holds.transition_with_holds(
                session,
                reference=reference,
                admin=s.admin,
                target=S.CANCELLED,
                expected_status=S.EN_ROUTE,
                reason_code=TransitionReason.MMIRIOMA_UNABLE,
                note=None,
                hold_id=None,
            )
        assert detail.dispatch.staff_order.order.status is S.CANCELLED
        assert detail.dispatch.assignment is not None
        assert detail.dispatch.assignment.assignment.status is AssignmentStatus.WITHDRAWN
        rows = [r for r in await exceptions_of(sessions, reference) if r.hold_kind is not None]
        assert [row.resolution for row in rows] == [HoldResolution.CANCELLED]

        # Cancelled is terminal: no outcome to offer any more.
        async with sessions() as session:
            terminal = await expect_error(
                holds.cancellation_outcome(
                    session, reference=reference, reason_code=TransitionReason.MMIRIOMA_UNABLE
                )
            )
        assert (terminal.status_code, terminal.code) == (409, "invalid_order_transition")

    run(scenario)


# --- History (decision 8) ----------------------------------------------------------------


def test_history_without_include_is_unchanged(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, _, hold = await on_proof_review(sessions, s, driver)
        async with sessions() as session:
            await holds.decide_proof(
                session,
                reference=reference,
                admin=s.admin,
                hold_id=hold.id,
                decision=holds.ProofDecision.REJECT,
                acknowledgment=None,
                note="The person who answered is not the customer.",
            )
        async with sessions() as session:
            plain = await holds.order_history(session, reference=reference, include_holds=False)
            dispatch_only = await dispatch_service.order_history(session, reference=reference)
            with_holds = await holds.order_history(session, reference=reference, include_holds=True)
        assert [entry.event.id for entry in plain] == [entry.event.id for entry in dispatch_only]
        hold_entries = [item for item in with_holds if isinstance(item, holds.HoldEntry)]
        assert [entry.kind for entry in hold_entries] == [
            holds.HistoryKind.HOLD_DECIDED,
            holds.HistoryKind.HOLD_OPENED,
        ]
        decided, opened = hold_entries
        assert decided.decision is HoldResolution.PROOF_REJECTED
        assert decided.actor is not None and decided.actor.id == s.admin.id
        assert opened.actor is not None and opened.actor.id == driver.id
        assert opened.note == alternative_proof().alternative_note

    run(scenario)
