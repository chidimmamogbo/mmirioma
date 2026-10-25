"""Cash collection, remittance and reconciliation against a real, migrated database (#123).

Contract: docs/api/payments.md (agreed G3, 2026-10-22). Covers every status
change and who may make it, the 6:00 PM rule, duplicates (repeats,
concurrent receipts), access (another driver, wrong states), the payment
status table, the payment SMS and its failure path, T-24 (delivered with
payment outstanding) and T-21 (each step audited).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards.
"""

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.deliveries import service as deliveries
from app.modules.deliveries.schemas import DriverJobDetail, DriverJobSummary
from app.modules.messaging.sms import MockSmsProvider
from app.modules.orders.models import (
    Order,
    OrderEvent,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.modules.payments import service as payments
from app.modules.payments.models import (
    CashCollection,
    CashCollectionStatus,
    CashEventKind,
    CashRemittance,
    PaymentSmsStatus,
)
from app.modules.pricing.models import AgreementMethod, OrderPriceSnapshot
from app.modules.sources.models import WaterCategory
from app.shared.lagos_time import LAGOS_TZ
from tests import test_deliveries_integration as part1
from tests.test_deliveries_integration import (
    TEST_DATABASE_URL,
    Created,
    Sessions,
    Setup,
    add_user,
    expect_error,
    run,
    setup,
)
from tests.test_driver_job_steps_integration import code_proof, sent_code, to_unloading

# Same fixture as part 1: creates rows for one test and deletes them after.
created = part1.created

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

DUE = 4_500_000  # ₦45,000.00


@pytest.fixture(autouse=True)
def delete_cash_rows(created: Created) -> Iterator[None]:
    """Delete this module's cash and audit rows before part 1 deletes orders and users.

    They reference orders, assignments and users (RESTRICT). This fixture
    depends on ``created``, so its teardown runs first.
    """
    yield
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        users = (created.user_ids,)
        connection.execute("DELETE FROM cash_events WHERE actor_id = ANY(%s)", users)
        connection.execute("DELETE FROM cash_collections WHERE driver_id = ANY(%s)", users)
        connection.execute("DELETE FROM cash_remittances WHERE driver_id = ANY(%s)", users)
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", users)


async def priced(sessions: Sessions, s: Setup, reference: str, total: int = DUE) -> Order:
    """Give the order a manual-quote snapshot and pay-on-delivery fields, as #113 does."""
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
        potable = await session.scalar(select(WaterCategory).where(WaterCategory.code == "potable"))
        assert order is not None and potable is not None
        assert order.delivery_window_start_at is not None
        assert order.delivery_window_end_at is not None
        event = OrderEvent(order_id=order.id, to_status=OrderStatus.CONFIRMED, actor_id=s.admin.id)
        session.add(event)
        await session.flush()
        now = datetime.now(UTC)
        session.add(
            OrderPriceSnapshot(
                order_id=order.id,
                event_id=event.id,
                total_minor_units=total,
                currency="NGN",
                is_manual=True,
                water_category_id=potable.id,
                water_category_label=potable.label,
                source_id=s.source_id,
                delivery_window_start_at=order.delivery_window_start_at,
                delivery_window_end_at=order.delivery_window_end_at,
                entered_by=s.admin.id,
                entered_at=now,
                customer_agreement_method=AgreementMethod.PHONE_CALL,
                customer_agreed_at=now,
            )
        )
        order.payment_method = PaymentMethod.PAY_ON_DELIVERY
        order.payment_status = PaymentStatus.PENDING_COLLECTION
        await session.commit()
        return order


async def unloaded(
    sessions: Sessions, s: Setup, driver: User, total: int = DUE
) -> tuple[str, MockSmsProvider]:
    """A priced job with unloading recorded complete; returns the reference and code SMS."""
    reference, _ = await to_unloading(sessions, s, driver)
    await priced(sessions, s, reference, total)
    sms = MockSmsProvider()
    async with sessions() as session:
        await deliveries.complete_unloading(session, driver=driver, reference=reference, sms=sms)
    return reference, sms


async def delivered(sessions: Sessions, s: Setup, driver: User, total: int = DUE) -> str:
    """A priced job delivered with the customer's code, so the driver can take another.

    A driver holds one live job at a time (``uq_assignments_live_driver``),
    and cash is still recorded after the job ended.
    """
    reference, code_sms = await unloaded(sessions, s, driver, total)
    async with sessions() as session:
        _, done = await deliveries.submit_proof(
            session, driver=driver, reference=reference, proof=code_proof(sent_code(code_sms))
        )
    assert done is True
    return reference


async def record(
    sessions: Sessions,
    driver: User,
    reference: str,
    amount: int,
    note: str | None = None,
    now: datetime | None = None,
) -> tuple[payments.CollectionView, bool]:
    async with sessions() as session:
        return await payments.record_cash(
            session,
            driver=driver,
            reference=reference,
            amount_minor_units=amount,
            note=note,
            now=now,
        )


async def order_of(sessions: Sessions, reference: str) -> Order:
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
    assert order is not None
    return order


async def collection_count(sessions: Sessions) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(CashCollection)) or 0


def test_the_whole_cash_lifecycle_and_every_refusal(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        other = await add_user(sessions, created, UserRole.DRIVER)
        reference, _ = await to_unloading(sessions, s, driver)
        await priced(sessions, s, reference)

        # BR-15: not before unloading is recorded complete.
        error = await expect_error(
            record(sessions, driver, reference, DUE), 409, "transition_requirements_unmet"
        )
        assert error.details == {"missing": ["unloading_completed"]}
        code_sms = MockSmsProvider()
        async with sessions() as session:
            await deliveries.complete_unloading(
                session, driver=driver, reference=reference, sms=code_sms
            )

        # The Cash card: amount due from the snapshot, and record_cash offered.
        async with sessions() as session:
            job = await deliveries.get_driver_job(session, driver_id=driver.id, reference=reference)
            cash = (await payments.cash_for_jobs(session, [job]))[job.order.id]
        assert (cash.amount_due_minor_units, cash.manual, cash.record_allowed) == (DUE, True, True)
        detail = DriverJobDetail.from_job(job, cash)
        assert "record_cash" in detail.allowed_actions
        assert detail.cash is not None and detail.cash.amount_due_label == "manual_quote"

        # T-07: another driver's job is 404.
        await expect_error(record(sessions, other, reference, DUE), 404, "order_not_found")
        # A different amount needs a note; nothing is written without it.
        error = await expect_error(
            record(sessions, driver, reference, 4_000_000), 422, "validation_error"
        )
        assert error.details[0]["loc"] == ["body", "note"]
        assert await collection_count(sessions) == 0

        view, created_now = await record(sessions, driver, reference, 4_000_000, "Typed short")
        assert created_now is True
        first = view.collection
        assert first.status is CashCollectionStatus.COLLECTED
        assert first.remittance_due_at == payments.remittance_due_at(first.collected_at)
        # A lost response retried: the same record, 200.
        again, created_now = await record(sessions, driver, reference, 4_000_000, "Typed short")
        assert (created_now, again.collection.id) == (False, first.id)
        # Any other amount is a duplicate: refused with what is recorded.
        error = await expect_error(
            record(sessions, driver, reference, DUE), 409, "cash_already_recorded"
        )
        assert error.details == {"amount_minor_units": 4_000_000}
        assert await collection_count(sessions) == 1

        # BR-12: recording cash changes neither status.
        order = await order_of(sessions, reference)
        assert order.status is OrderStatus.UNLOADING
        assert order.payment_status is PaymentStatus.PENDING_COLLECTION

        # T-24: delivered with payment outstanding; the done job keeps its card.
        async with sessions() as session:
            done, delivered = await deliveries.submit_proof(
                session,
                driver=driver,
                reference=reference,
                proof=code_proof(sent_code(code_sms)),
            )
        assert delivered is True
        order = await order_of(sessions, reference)
        assert order.status is OrderStatus.DELIVERED
        assert order.payment_status is PaymentStatus.PENDING_COLLECTION
        async with sessions() as session:
            jobs = await deliveries.list_driver_jobs(session, driver_id=driver.id)
            cards = await payments.cash_for_jobs(session, jobs.done)
        summary = DriverJobSummary.from_job(jobs.done[0], cards.get(jobs.done[0].order.id))
        assert summary.cash is not None and summary.cash.record_allowed is False
        assert summary.cash.collection is not None
        assert summary.cash.collection.status is CashCollectionStatus.COLLECTED
        # The delivering driver can still retry after the job ended.
        _, created_now = await record(sessions, driver, reference, 4_000_000, "Typed short")
        assert created_now is False

        # Hand over: only the holder, only from collected.
        async with sessions() as session:
            await expect_error(
                payments.hand_over(session, driver=other, collection_ids=[first.id]),
                409,
                "cash_collection_changed",
            )
        async with sessions() as session:
            mine = await payments.hand_over(session, driver=driver, collection_ids=[first.id])
        assert mine.ready_minor_units == 4_000_000 and mine.on_hand_minor_units == 4_000_000
        async with sessions() as session:
            await expect_error(
                payments.hand_over(session, driver=driver, collection_ids=[first.id]),
                409,
                "cash_collection_changed",
            )

        # Decision 6: an administrator corrects the typo before receiving it.
        async with sessions() as session:
            await expect_error(
                payments.correct_amount(
                    session,
                    admin=s.admin,
                    collection_id=first.id,
                    amount_minor_units=4_000_000,
                    reason="Same",
                ),
                422,
                "validation_error",
            )
        async with sessions() as session:
            fixed = await payments.correct_amount(
                session,
                admin=s.admin,
                collection_id=first.id,
                amount_minor_units=DUE,
                reason="Driver typed 40,000; the envelope holds 45,000",
            )
        assert fixed.collection.amount_minor_units == DUE
        assert fixed.collection.original_amount_minor_units == 4_000_000
        assert fixed.corrected_by is not None and fixed.corrected_by.id == s.admin.id
        # The driver's own retry still matches their original record.
        _, created_now = await record(sessions, driver, reference, 4_000_000, "Typed short")
        assert created_now is False

        # Receive: a counted difference needs a note; nothing is written without it.
        sms = MockSmsProvider()
        async with sessions() as session:
            await expect_error(
                payments.receive_cash(
                    session,
                    admin=s.admin,
                    driver_id=driver.id,
                    collection_ids=[first.id],
                    counted_minor_units=4_400_000,
                    note=None,
                    sms=sms,
                ),
                422,
                "validation_error",
            )
        async with sessions() as session:
            result = await payments.receive_cash(
                session,
                admin=s.admin,
                driver_id=driver.id,
                collection_ids=[first.id],
                counted_minor_units=4_400_000,
                note="1,000 short; driver says a torn note was kept aside",
                sms=sms,
            )
        assert result.remittance.difference_minor_units == -100_000
        (received,) = result.orders
        assert received.payment_status is PaymentStatus.PAID
        assert received.sms_status is PaymentSmsStatus.ACCEPTED
        assert len(sms.outbox) == 1
        assert sms.outbox[0].phone == s.customer.phone
        assert f"we received N45,000.00 cash for order {reference}." in sms.outbox[0].text
        order = await order_of(sessions, reference)
        assert order.payment_status is PaymentStatus.PAID
        assert order.status is OrderStatus.DELIVERED  # BR-12
        assert (order.outstanding_balance_minor_units, order.overpaid_minor_units) == (0, 0)

        # Once received: no correction, no second receipt, no handover.
        async with sessions() as session:
            await expect_error(
                payments.correct_amount(
                    session,
                    admin=s.admin,
                    collection_id=first.id,
                    amount_minor_units=4_000_000,
                    reason="Late",
                ),
                409,
                "cash_collection_changed",
            )
        async with sessions() as session:
            await expect_error(
                payments.receive_cash(
                    session,
                    admin=s.admin,
                    driver_id=driver.id,
                    collection_ids=[first.id],
                    counted_minor_units=DUE,
                    note=None,
                    sms=sms,
                ),
                409,
                "cash_collection_changed",
            )
        assert len(sms.outbox) == 1

        # Reconcile: the same administrator may (decision 7); payment unchanged.
        async with sessions() as session:
            (reconciled,) = await payments.reconcile(
                session, admin=s.admin, collection_ids=[first.id], note=None
            )
        assert reconciled.collection.status is CashCollectionStatus.RECONCILED
        assert (await order_of(sessions, reference)).payment_status is PaymentStatus.PAID
        async with sessions() as session:
            await expect_error(
                payments.reconcile(session, admin=s.admin, collection_ids=[first.id], note=None),
                409,
                "cash_collection_changed",
            )

        # History, newest first, and the payment card with the difference.
        async with sessions() as session:
            history = await payments.cash_history(session, order.id)
            view = await payments.payment_view(session, order)
        assert [entry.event.kind for entry in history] == [
            CashEventKind.CASH_RECONCILED,
            CashEventKind.CASH_RECEIVED,
            CashEventKind.CASH_CORRECTED,
            CashEventKind.CASH_HANDED_OVER,
            CashEventKind.CASH_RECORDED,
        ]
        received_entry = history[1]
        assert received_entry.event.payment_status is PaymentStatus.PAID
        assert received_entry.sms_status is PaymentSmsStatus.ACCEPTED
        assert history[2].event.previous_amount_minor_units == 4_000_000
        assert view is not None and view.remittance is not None
        assert view.remittance.difference_minor_units == -100_000

        # T-21 / NFR-004: every custody change is audited, with no notes.
        async with sessions() as session:
            audits = list(
                await session.scalars(
                    select(AuditLog).where(AuditLog.actor_id.in_([driver.id, s.admin.id]))
                )
            )
        actions = [row.action for row in audits]
        for action in (
            "cash_recorded",
            "cash_handed_over",
            "cash_corrected",
            "cash_received",
            "cash_remittance_recorded",
            "cash_reconciled",
        ):
            assert actions.count(action) == 1, action
        assert not any("note" in str(row.details) for row in audits)

    run(scenario)


def test_part_paid_nothing_paid_overpaid_and_a_refused_sms(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        amounts = {4_000_000: "Paid 40,000", 0: "Customer paid nothing", 5_000_000: "No change"}
        ids = []
        references = []
        for amount, note in amounts.items():
            reference = await delivered(sessions, s, driver)
            view, _ = await record(sessions, driver, reference, amount, note)
            ids.append(view.collection.id)
            references.append(reference)

        # Received straight from "collected" (K4 lets the administrator tick it).
        sms = MockSmsProvider(fail=True)
        async with sessions() as session:
            result = await payments.receive_cash(
                session,
                admin=s.admin,
                driver_id=driver.id,
                collection_ids=ids,
                counted_minor_units=9_000_000,
                note=None,
                sms=sms,
            )
        assert result.remittance.difference_minor_units == 0
        outcomes = [
            (
                o.payment_status,
                o.outstanding_balance_minor_units,
                o.overpaid_minor_units,
                o.sms_status,
            )
            for o in result.orders
        ]
        assert outcomes == [
            (PaymentStatus.PARTIALLY_PAID, 500_000, 0, PaymentSmsStatus.FAILED),
            # Nothing received, nothing to acknowledge: no SMS at all.
            (PaymentStatus.PARTIALLY_PAID, DUE, 0, None),
            (PaymentStatus.PAID, 0, 500_000, PaymentSmsStatus.FAILED),
        ]
        # FR-050: the refused SMS undid nothing.
        async with sessions() as session:
            statuses = list(
                await session.scalars(
                    select(CashCollection.status).where(CashCollection.id.in_(ids))
                )
            )
        assert statuses == [CashCollectionStatus.REMITTED] * 3
        assert (await order_of(sessions, references[1])).outstanding_balance_minor_units == DUE

    run(scenario)


def test_cancelled_or_unpriced_orders_take_no_cash(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        reference = await delivered(sessions, s, driver)
        async with sessions() as session:
            await session.execute(
                update(Order)
                .where(Order.reference == reference)
                .values(status=OrderStatus.CANCELLED)
            )
            await session.commit()
        error = await expect_error(
            record(sessions, driver, reference, DUE), 409, "transition_requirements_unmet"
        )
        assert error.details == {"missing": ["unloading_completed"]}

        # An order confirmed without a price snapshot (by script, before #113).
        reference, _ = await to_unloading(sessions, s, driver)
        async with sessions() as session:
            await deliveries.complete_unloading(
                session, driver=driver, reference=reference, sms=MockSmsProvider()
            )
        error = await expect_error(
            record(sessions, driver, reference, DUE), 409, "transition_requirements_unmet"
        )
        assert error.details == {"missing": ["price_recorded"]}
        assert await collection_count(sessions) == 0

    run(scenario)


def test_the_6pm_rule_overdue_flag_and_the_cash_page(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        day = (datetime.now(UTC) - timedelta(days=2)).astimezone(LAGOS_TZ).date()
        morning = datetime(day.year, day.month, day.day, 10, tzinfo=LAGOS_TZ).astimezone(UTC)
        evening = datetime(day.year, day.month, day.day, 19, tzinfo=LAGOS_TZ).astimezone(UTC)
        first = await delivered(sessions, s, driver)
        second = await delivered(sessions, s, driver)
        early, _ = await record(sessions, driver, first, DUE, now=morning)
        late, _ = await record(sessions, driver, second, DUE, now=evening)
        six_pm = datetime(day.year, day.month, day.day, 18, tzinfo=LAGOS_TZ)
        assert early.collection.remittance_due_at == six_pm
        assert late.collection.remittance_due_at == six_pm + timedelta(days=1)

        # 7:30 pm that day: the morning cash is overdue, the evening cash is not.
        half_past_seven = evening + timedelta(minutes=30)
        async with sessions() as session:
            mine = await payments.driver_cash(session, driver_id=driver.id, now=half_past_seven)
            page = await payments.cash_day(session, day=day, now=half_past_seven)
        assert mine.overdue is True and mine.on_hand_minor_units == 2 * DUE
        assert mine.remittance_due_at == six_pm
        assert [view.overdue for view in mine.collections] == [False, True]  # newest first
        (row,) = [row for row in page.drivers if row.driver.id == driver.id]
        assert (row.overdue, row.held_minor_units, row.ready_minor_units) == (True, 2 * DUE, 0)
        assert page.recorded_minor_units == 2 * DUE
        assert page.with_drivers_minor_units == 2 * DUE
        assert page.received_minor_units == 0 and page.differences == 0

        # Received the next morning: counted on that day, not the collection day.
        next_morning = morning + timedelta(days=1)
        async with sessions() as session:
            await payments.receive_cash(
                session,
                admin=s.admin,
                driver_id=driver.id,
                collection_ids=[early.collection.id],
                counted_minor_units=DUE - 100,
                note="100 kobo short",
                sms=MockSmsProvider(),
                now=next_morning,
            )
        async with sessions() as session:
            collection_day = await payments.cash_day(session, day=day, now=next_morning)
            received_day = await payments.cash_day(
                session, day=day + timedelta(days=1), now=next_morning
            )
        assert collection_day.received_minor_units == 0
        assert received_day.received_minor_units == DUE
        assert received_day.differences == 1
        assert [v.collection.id for v in received_day.awaiting_reconciliation] == [
            early.collection.id
        ]

    run(scenario)


def test_two_administrators_receiving_at_once_receive_once(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        second_admin = await add_user(sessions, created, UserRole.ADMIN)
        reference, _ = await unloaded(sessions, s, driver)
        view, _ = await record(sessions, driver, reference, DUE)
        sms = MockSmsProvider()

        async def receive(admin: User) -> object:
            async with sessions() as session:
                try:
                    return await payments.receive_cash(
                        session,
                        admin=admin,
                        driver_id=driver.id,
                        collection_ids=[view.collection.id],
                        counted_minor_units=DUE,
                        note=None,
                        sms=sms,
                    )
                except Exception as error:  # noqa: BLE001 - the test inspects it
                    return error

        results = await asyncio.gather(receive(s.admin), receive(second_admin))
        successes = [r for r in results if isinstance(r, payments.RemittanceResult)]
        failures = [r for r in results if not isinstance(r, payments.RemittanceResult)]
        assert len(successes) == 1 and len(failures) == 1
        assert getattr(failures[0], "code", None) == "cash_collection_changed"
        assert len(sms.outbox) == 1
        async with sessions() as session:
            remittances = await session.scalar(
                select(func.count())
                .select_from(CashRemittance)
                .where(CashRemittance.driver_id == driver.id)
            )
        assert remittances == 1

    run(scenario)
