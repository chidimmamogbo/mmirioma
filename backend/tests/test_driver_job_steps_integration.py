"""Driver job part 2 against a real, migrated database (docs/api/deliveries.md).

Covers accept (row 9), the driver's steps (rows 12, 14, 16), arrival with
consented GPS (row 15), contact attempts and the failed attempt (row 19,
FR-038, T-25), unloading complete issuing the code (#67), proof with a code
(row 17, FR-035, T-08, T-22) or alternative proof (hold ``proof_review``),
delivery with payment outstanding (T-24), ownership (T-07), repeats after
the job ends, and a concurrent double proof.

The services take ``now``; events are stamped by the database clock, so the
scenarios run in real time (``T0`` is the current time) and only move ``now``
forward for the 10-minute rules.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text

from app.modules.auth.models import User, UserRole
from app.modules.deliveries import service
from app.modules.deliveries.models import (
    AcknowledgementMethod,
    DeliveryAttempt,
    DeliveryCode,
    DeliveryOutcome,
    DeliveryProof,
    ExceptionCategory,
    HoldKind,
    OrderException,
)
from app.modules.dispatch.models import Assignment, AssignmentStatus
from app.modules.messaging.sms import MockSmsProvider
from app.modules.orders.models import Order, OrderEvent, OrderStatus, TransitionReason
from tests import test_deliveries_integration as part1
from tests.test_deliveries_integration import (
    TEST_DATABASE_URL,
    Created,
    Sessions,
    Setup,
    add_job,
    add_user,
    expect_error,
    run,
    setup,
)

# Same fixture as part 1: creates rows for one test and deletes them after.
created = part1.created

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

T0 = datetime.now(UTC).replace(microsecond=0)
WINDOW_START = T0 - timedelta(hours=1)
ALL_PROOF = {
    "delivered_litres": 1200,
    "alternative_reason": None,
    "alternative_note": None,
    "location": None,
}


def code_proof(code: str, litres: int = 1200) -> service.NewProof:
    return service.NewProof(**{**ALL_PROOF, "delivered_litres": litres, "delivery_code": code})


def alternative_proof() -> service.NewProof:
    return service.NewProof(
        delivered_litres=1200,
        delivery_code=None,
        alternative_reason=service.AlternativeProofReason.CUSTOMER_CANNOT_RECEIVE_CODE,
        alternative_note="Customer's phone is off; she confirmed in person.",
        location=None,
    )


def sent_code(sms: MockSmsProvider) -> str:
    return sms.outbox[-1].text.split("code is ")[1][:6]


async def to_en_route(sessions: Sessions, s: Setup, driver: User) -> str:
    """An accepted job driven to ``en_route`` through the real endpoints' services."""
    reference = await add_job(
        sessions,
        s,
        driver,
        order_status=OrderStatus.ACCEPTED,
        window_start=WINDOW_START,
    )
    sms = MockSmsProvider()
    async with sessions() as session:
        await service.take_step(
            session,
            driver=driver,
            reference=reference,
            step=service.DriverStep.DEPARTED,
            note=None,
            sms=sms,
        )
    async with sessions() as session:
        await service.record_pickup(
            session,
            driver=driver,
            reference=reference,
            pickup=service.NewPickup(
                assigned_source=True,
                other_source_name=None,
                source_reference=None,
                volume_collected_litres=1200,
                picked_up_at=datetime.now(UTC),
                safety_concern=False,
                safety_note=None,
            ),
        )
    async with sessions() as session:
        await service.take_step(
            session,
            driver=driver,
            reference=reference,
            step=service.DriverStep.EN_ROUTE,
            note=None,
            sms=sms,
        )
    return reference


async def to_unloading(sessions: Sessions, s: Setup, driver: User) -> tuple[str, datetime]:
    """A job arrived at ``T0`` and unloading; returns the reference and arrival time."""
    reference = await to_en_route(sessions, s, driver)
    async with sessions() as session:
        job = await service.arrive(session, driver=driver, reference=reference, location=None)
    assert job.arrived_at is not None
    async with sessions() as session:
        await service.take_step(
            session,
            driver=driver,
            reference=reference,
            step=service.DriverStep.UNLOADING,
            note=None,
            sms=MockSmsProvider(),
        )
    return reference, job.arrived_at


async def code_issued(
    sessions: Sessions, s: Setup, driver: User
) -> tuple[str, MockSmsProvider, datetime]:
    """A job with unloading recorded complete; returns reference, SMS outbox, issue time."""
    reference, _ = await to_unloading(sessions, s, driver)
    sms = MockSmsProvider()
    issued_at = datetime.now(UTC)
    async with sessions() as session:
        await service.complete_unloading(
            session, driver=driver, reference=reference, sms=sms, now=issued_at
        )
    return reference, sms, issued_at


# --- Accept and steps ------------------------------------------------------------


def test_accept_reveals_the_receiver_and_is_harmless_to_repeat(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await add_job(
            sessions,
            s,
            driver,
            order_status=OrderStatus.ASSIGNED,
            assignment_status=AssignmentStatus.OFFERED,
        )
        for _ in range(2):
            async with sessions() as session:
                job = await service.accept_offer(session, driver=driver, reference=reference)
            assert job.job_status is service.JobStatus.ACCEPTED
            assert job.order.status is OrderStatus.ACCEPTED
        async with sessions() as session:
            events = await session.scalar(
                select(func.count())
                .select_from(OrderEvent)
                .where(
                    OrderEvent.order_id == job.order.id,
                    OrderEvent.to_status == OrderStatus.ACCEPTED,
                )
            )
        assert events == 1

        # T-07: an offer that is not yours does not exist.
        other = await add_user(sessions, created, UserRole.DRIVER)
        async with sessions() as session:
            await expect_error(
                service.accept_offer(session, driver=other, reference=reference),
                404,
                "order_not_found",
            )

    run(scenario)


def test_start_texts_the_customer_once_and_only_from_the_delivery_day(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        later = await add_job(
            sessions,
            s,
            driver,
            order_status=OrderStatus.ACCEPTED,
            window_start=T0 + timedelta(days=2),
        )
        sms = MockSmsProvider()
        async with sessions() as session:
            error = await expect_error(
                service.take_step(
                    session,
                    driver=driver,
                    reference=later,
                    step=service.DriverStep.DEPARTED,
                    note=None,
                    sms=sms,
                ),
                409,
                "transition_requirements_unmet",
            )
        assert error.details == {"missing": ["delivery_day_reached"]}
        assert sms.outbox == []

        driver = await add_user(sessions, created, UserRole.DRIVER)
        today = await add_job(
            sessions, s, driver, order_status=OrderStatus.ACCEPTED, window_start=WINDOW_START
        )
        for _ in range(2):
            async with sessions() as session:
                job = await service.take_step(
                    session,
                    driver=driver,
                    reference=today,
                    step=service.DriverStep.DEPARTED,
                    note=None,
                    sms=sms,
                )
            assert job.order.status is OrderStatus.DEPARTED
        # FR-050: one "dispatched" message, not one per tap.
        assert len(sms.outbox) == 1
        assert today in sms.outbox[0].text and "dispatched" in sms.outbox[0].text

    run(scenario)


def test_a_failed_sms_never_blocks_the_start(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await add_job(
            sessions, s, driver, order_status=OrderStatus.ACCEPTED, window_start=WINDOW_START
        )
        async with sessions() as session:
            job = await service.take_step(
                session,
                driver=driver,
                reference=reference,
                step=service.DriverStep.DEPARTED,
                note=None,
                sms=MockSmsProvider(fail=True),
            )
        assert job.order.status is OrderStatus.DEPARTED

    run(scenario)


def test_steps_follow_the_state_machine_and_stop_on_hold(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await add_job(
            sessions, s, driver, order_status=OrderStatus.ACCEPTED, window_start=WINDOW_START
        )
        sms = MockSmsProvider()
        # Skipping ahead is refused.
        async with sessions() as session:
            await expect_error(
                service.take_step(
                    session,
                    driver=driver,
                    reference=reference,
                    step=service.DriverStep.EN_ROUTE,
                    note=None,
                    sms=sms,
                ),
                409,
                "invalid_order_transition",
            )
        async with sessions() as session:
            await expect_error(
                service.arrive(session, driver=driver, reference=reference, location=None),
                409,
                "invalid_order_transition",
            )
        # An unsafe-stop hold blocks the next step (SRS §8).
        async with sessions() as session:
            await service.report_incident(
                session,
                driver=driver,
                reference=reference,
                incident=service.NewIncident(
                    category=ExceptionCategory.UNSAFE_ACCESS,
                    note=None,
                    new_estimated_arrival_at=None,
                ),
            )
        async with sessions() as session:
            await expect_error(
                service.take_step(
                    session,
                    driver=driver,
                    reference=reference,
                    step=service.DriverStep.DEPARTED,
                    note=None,
                    sms=sms,
                ),
                409,
                "job_on_hold",
            )

    run(scenario)


# --- Arrival and the customer-unreachable path (FR-038, T-25) -----------------------


def test_arrival_records_time_window_and_consented_location(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await to_en_route(sessions, s, driver)
        location = service.NewLocation(latitude=6.4527, longitude=7.5103, accuracy_metres=15.0)
        for _ in range(2):
            async with sessions() as session:
                job = await service.arrive(
                    session, driver=driver, reference=reference, location=location, now=T0
                )
        assert job.order.status is OrderStatus.ARRIVED
        assert job.arrived_at == T0
        assert job.unreachable_allowed_at == T0 + timedelta(minutes=10)
        # #67: no code at arrival.
        assert job.delivery_code is None
        async with sessions() as session:
            row = (
                await session.execute(
                    select(
                        DeliveryAttempt.within_window,
                        DeliveryAttempt.arrival_accuracy_metres,
                        func.ST_AsText(DeliveryAttempt.arrival_location),
                        func.ST_SRID(DeliveryAttempt.arrival_location),
                    ).where(DeliveryAttempt.order_id == job.order.id)
                )
            ).one()
            attempts = await session.scalar(
                select(func.count())
                .select_from(DeliveryAttempt)
                .where(DeliveryAttempt.order_id == job.order.id)
            )
        assert row == (True, 15.0, "POINT(7.5103 6.4527)", 4326)
        assert attempts == 1  # the repeat changed nothing

    run(scenario)


def test_t25_failed_attempt_needs_two_attempts_and_the_full_ten_minutes(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await to_en_route(sessions, s, driver)
        async with sessions() as session:
            await service.arrive(session, driver=driver, reference=reference, location=None, now=T0)

        async def fail_at(minutes: int) -> service.DriverJob:
            async with sessions() as session:
                return await service.take_step(
                    session,
                    driver=driver,
                    reference=reference,
                    step=service.DriverStep.FAILED,
                    note=None,
                    sms=MockSmsProvider(),
                    now=T0 + timedelta(minutes=minutes),
                )

        async def contact_at(minutes: int) -> service.DriverJob:
            async with sessions() as session:
                return await service.record_contact_attempt(
                    session,
                    driver=driver,
                    reference=reference,
                    now=T0 + timedelta(minutes=minutes),
                )

        error = await expect_error(fail_at(1), 409, "transition_requirements_unmet")
        assert error.details == {
            "missing": ["contact_attempts_recorded", "unreachable_wait_elapsed"]
        }
        await contact_at(1)
        error = await expect_error(fail_at(12), 409, "transition_requirements_unmet")
        assert error.details == {"missing": ["contact_attempts_recorded"]}
        job = await contact_at(6)
        assert len(job.contact_attempts) == 2
        # Two attempts, but 9 minutes 59 seconds is not the full 10 (#55).
        async with sessions() as session:
            error = await expect_error(
                service.take_step(
                    session,
                    driver=driver,
                    reference=reference,
                    step=service.DriverStep.FAILED,
                    note=None,
                    sms=MockSmsProvider(),
                    now=T0 + timedelta(minutes=10) - timedelta(seconds=1),
                ),
                409,
                "transition_requirements_unmet",
            )
        assert error.details == {"missing": ["unreachable_wait_elapsed"]}

        done = await fail_at(10)
        assert done.order.status is OrderStatus.FAILED
        assert done.section is service.JobSection.DONE
        assert done.end_reason == "customer_unreachable"
        # A lost response: the repeat returns the finished job, not 404.
        again = await fail_at(11)
        assert again.order.id == done.order.id
        assert again.section is service.JobSection.DONE

        async with sessions() as session:
            assignment = await session.scalar(
                select(Assignment).where(Assignment.order_id == done.order.id)
            )
            attempt = await session.scalar(
                select(DeliveryAttempt).where(DeliveryAttempt.order_id == done.order.id)
            )
            exception = await session.scalar(
                select(OrderException).where(
                    OrderException.order_id == done.order.id,
                    OrderException.category == ExceptionCategory.CUSTOMER_UNREACHABLE,
                )
            )
            event = await session.scalar(
                select(OrderEvent).where(
                    OrderEvent.order_id == done.order.id,
                    OrderEvent.to_status == OrderStatus.FAILED,
                )
            )
        assert assignment is not None and assignment.status is AssignmentStatus.COMPLETED
        assert attempt is not None and attempt.outcome is DeliveryOutcome.FAILED
        assert exception is not None
        assert event is not None and event.reason_code is TransitionReason.CUSTOMER_UNREACHABLE
        # The job is no longer open to the driver (part 1 access rule).
        async with sessions() as session:
            await expect_error(
                service.get_driver_job(session, driver_id=driver.id, reference=reference),
                404,
                "order_not_found",
            )

    run(scenario)


def test_contact_attempts_only_while_arrived(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await to_en_route(sessions, s, driver)
        async with sessions() as session:
            await expect_error(
                service.record_contact_attempt(session, driver=driver, reference=reference),
                409,
                "invalid_order_transition",
            )

    run(scenario)


# --- Unloading complete and proof (FR-035, T-08, T-22, T-24) -------------------------


def test_delivery_with_a_code_ends_the_job_with_payment_outstanding(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, sms, issued_at = await code_issued(sessions, s, driver)
        assert len(sms.outbox) == 1
        # Repeating unloading complete issues no second code.
        async with sessions() as session:
            job, recorded = await service.complete_unloading(
                session, driver=driver, reference=reference, sms=sms
            )
        assert recorded is False and len(sms.outbox) == 1
        assert job.unloading_completed_at == issued_at
        assert job.delivery_code is not None and job.delivery_code.attempts == 0

        code = sent_code(sms)
        wrong = "000000" if code != "000000" else "111111"
        async with sessions() as session:
            error = await expect_error(
                service.submit_proof(
                    session, driver=driver, reference=reference, proof=code_proof(wrong)
                ),
                400,
                "delivery_code_invalid",
            )
        assert error.details == {"attempts_remaining": 4}

        async with sessions() as session:
            done, delivered = await service.submit_proof(
                session, driver=driver, reference=reference, proof=code_proof(code, litres=1000)
            )
        assert delivered is True
        assert done.order.status is OrderStatus.DELIVERED
        assert done.section is service.JobSection.DONE
        assert done.delivered_litres == 1000

        async with sessions() as session:
            proof = await session.scalar(
                select(DeliveryProof).where(DeliveryProof.order_id == done.order.id)
            )
            stored = await session.scalar(
                select(DeliveryCode).where(DeliveryCode.order_id == done.order.id)
            )
            partial = await session.scalar(
                select(OrderException).where(
                    OrderException.order_id == done.order.id,
                    OrderException.category == ExceptionCategory.PARTIAL_DELIVERY,
                )
            )
            # T-24 / BR-12: no payment record exists, and the order is delivered.
            payments_table = await session.scalar(text("SELECT to_regclass('public.payments')"))
        assert proof is not None
        assert proof.method is AcknowledgementMethod.DELIVERY_CODE
        assert proof.delivered_litres == 1000 and proof.unloading_confirmed is True
        assert stored is not None and stored.used_at is not None and stored.attempts == 1
        assert partial is not None  # 1000 of 1200 litres (FR-036)
        assert payments_table is None

        # A lost response: the same driver repeating the proof gets the finished
        # job; the used code is not checked again.
        async with sessions() as session:
            again, delivered = await service.submit_proof(
                session, driver=driver, reference=reference, proof=code_proof(code)
            )
        assert delivered is True and again.section is service.JobSection.DONE
        async with sessions() as session:
            proofs = await session.scalar(
                select(func.count())
                .select_from(DeliveryProof)
                .where(DeliveryProof.order_id == done.order.id)
            )
        assert proofs == 1
        # Anyone else still gets 404 (T-07).
        other = await add_user(sessions, created, UserRole.DRIVER)
        async with sessions() as session:
            await expect_error(
                service.submit_proof(
                    session, driver=other, reference=reference, proof=code_proof(code)
                ),
                404,
                "order_not_found",
            )

    run(scenario)


def test_t22_code_refused_before_unloading_complete_expired_or_out_of_attempts(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)

        # Before unloading is recorded complete there is no code (#67).
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, _ = await to_unloading(sessions, s, driver)
        async with sessions() as session:
            error = await expect_error(
                service.submit_proof(
                    session, driver=driver, reference=reference, proof=code_proof("123456")
                ),
                409,
                "transition_requirements_unmet",
            )
        assert error.details == {"missing": ["unloading_confirmed"]}

        # Expired after 10 minutes, even when correct.
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, sms, issued_at = await code_issued(sessions, s, driver)
        async with sessions() as session:
            await expect_error(
                service.submit_proof(
                    session,
                    driver=driver,
                    reference=reference,
                    proof=code_proof(sent_code(sms)),
                    now=issued_at + timedelta(minutes=10),
                ),
                400,
                "delivery_code_expired",
            )

        # The 6th attempt is refused, even with the right code.
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, sms, _ = await code_issued(sessions, s, driver)
        code = sent_code(sms)
        wrong = "000000" if code != "000000" else "111111"
        remaining = []
        for _ in range(5):
            async with sessions() as session:
                error = await expect_error(
                    service.submit_proof(
                        session, driver=driver, reference=reference, proof=code_proof(wrong)
                    ),
                    400,
                    "delivery_code_invalid",
                )
            remaining.append(error.details["attempts_remaining"])  # type: ignore[index]
        assert remaining == [4, 3, 2, 1, 0]
        async with sessions() as session:
            await expect_error(
                service.submit_proof(
                    session, driver=driver, reference=reference, proof=code_proof(code)
                ),
                400,
                "delivery_code_expired",
            )
        async with sessions() as session:
            job = await service.get_driver_job(session, driver_id=driver.id, reference=reference)
        assert job.order.status is OrderStatus.UNLOADING
        assert service.JobAction.REQUEST_NEW_CODE in job.allowed_actions

    run(scenario)


def test_t08_alternative_proof_never_delivers_and_holds_the_job(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, _sms, _ = await code_issued(sessions, s, driver)
        async with sessions() as session:
            job, delivered = await service.submit_proof(
                session, driver=driver, reference=reference, proof=alternative_proof()
            )
        assert delivered is False
        assert job.order.status is OrderStatus.UNLOADING
        assert job.hold is not None and job.hold.hold_kind is HoldKind.PROOF_REVIEW
        assert job.allowed_actions == [service.JobAction.REPORT_INCIDENT]
        async with sessions() as session:
            proof = await session.scalar(
                select(DeliveryProof).where(DeliveryProof.order_id == job.order.id)
            )
        assert proof is not None and proof.method is AcknowledgementMethod.ALTERNATIVE_PROOF
        # Nothing moves on while an administrator reviews (BR-13).
        async with sessions() as session:
            await expect_error(
                service.submit_proof(
                    session, driver=driver, reference=reference, proof=code_proof("123456")
                ),
                409,
                "job_on_hold",
            )

    run(scenario)


def test_two_proofs_at_once_deliver_once(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference, sms, _ = await code_issued(sessions, s, driver)
        code = sent_code(sms)

        async def prove() -> tuple[service.DriverJob, bool]:
            async with sessions() as session:
                return await service.submit_proof(
                    session, driver=driver, reference=reference, proof=code_proof(code)
                )

        results = await asyncio.gather(prove(), prove())
        # The row lock serializes them: one delivers, the other is a repeat.
        assert all(delivered for _, delivered in results)
        assert all(job.section is service.JobSection.DONE for job, _ in results)
        async with sessions() as session:
            order = await session.scalar(select(Order).where(Order.reference == reference))
            assert order is not None
            proofs = await session.scalar(
                select(func.count())
                .select_from(DeliveryProof)
                .where(DeliveryProof.order_id == order.id)
            )
            events = await session.scalar(
                select(func.count())
                .select_from(OrderEvent)
                .where(
                    OrderEvent.order_id == order.id,
                    OrderEvent.to_status == OrderStatus.DELIVERED,
                )
            )
        assert (proofs, events) == (1, 1)

    run(scenario)


def test_a_live_job_takes_precedence_over_a_finished_one(created: Created) -> None:
    # Contract: a rescheduled order offered to the same driver again the same
    # day is handled as the live job, never as a repeat of the ended one.
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await to_en_route(sessions, s, driver)
        async with sessions() as session:
            await service.arrive(session, driver=driver, reference=reference, location=None, now=T0)
        for minutes in (1, 2):
            async with sessions() as session:
                await service.record_contact_attempt(
                    session, driver=driver, reference=reference, now=T0 + timedelta(minutes=minutes)
                )
        async with sessions() as session:
            failed = await service.take_step(
                session,
                driver=driver,
                reference=reference,
                step=service.DriverStep.FAILED,
                note=None,
                sms=MockSmsProvider(),
                now=T0 + timedelta(minutes=10),
            )
        # Rescheduled (row 21) and offered to the same driver again.
        async with sessions() as session:
            order = await session.get(Order, failed.order.id)
            assert order is not None
            order.status = OrderStatus.ASSIGNED
            session.add(
                Assignment(
                    order_id=order.id,
                    driver_user_id=driver.id,
                    status=AssignmentStatus.OFFERED,
                    offered_by=s.admin.id,
                )
            )
            await session.commit()
        async with sessions() as session:
            await expect_error(
                service.take_step(
                    session,
                    driver=driver,
                    reference=reference,
                    step=service.DriverStep.FAILED,
                    note=None,
                    sms=MockSmsProvider(),
                ),
                409,
                "invalid_order_transition",
            )

    run(scenario)
