"""Privacy tool against a real database (#129, NFR-005).

Covers anonymizing a customer (refusals, dry run, the saved result, audit
row, sign-in impossible afterwards), correcting a name, and the monthly
retention review step by step, including what it must keep.

The review acts on the whole database, so these tests never let it see
anything but their own rows: their rows are dated 2017-2021 and the review
runs with ``now`` in 2021, before every other row in the test database.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from geoalchemy2 import WKTElement
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth import service as auth_service
from app.modules.auth.models import PhoneVerification, User, UserRole, UserSession
from app.modules.deliveries.models import (
    AcknowledgementMethod,
    DeliveryAttempt,
    DeliveryCode,
    DeliveryProof,
    ExceptionCategory,
    HoldKind,
    OrderException,
    SmsStatus,
)
from app.modules.dispatch.models import Assignment, AssignmentStatus
from app.modules.orders.models import Order, OrderStatus, PaymentMethod, PaymentStatus
from app.modules.payments.models import (
    CashCollection,
    CashCollectionStatus,
    CashRemittance,
)
from app.modules.privacy import service
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

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created
# The review's clock: before every row other tests create (they use 2026).
REVIEW_NOW = datetime(2021, 6, 1, 9, 0, tzinfo=UTC)
OLD = datetime(2020, 1, 15, 9, 0, tzinfo=UTC)
POINT = "POINT(7.4951 6.4584)"


@pytest.fixture(autouse=True)
def delete_audit_rows(created: Created) -> Iterator[None]:
    """Delete this module's cash and audit rows before part 1 deletes orders and users."""
    yield
    url = get_settings().sync_database_url.set(drivername="postgresql")
    users = (created.user_ids,)
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        connection.execute("DELETE FROM cash_collections WHERE driver_id = ANY(%s)", users)
        connection.execute("DELETE FROM cash_remittances WHERE driver_id = ANY(%s)", users)
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", users)


async def finished_job(sessions: Sessions, s: Setup, driver: User, **fields: object) -> str:
    """``add_job`` with the assignment completed, as on a finished order.

    A driver may hold one live (offered or accepted) assignment only.
    """
    return await add_job(
        sessions,
        s,
        driver,
        assignment_status=AssignmentStatus.COMPLETED,
        ended_at=OLD,
        **fields,
    )


async def backdate_user(sessions: Sessions, user: User, at: datetime) -> None:
    async with sessions() as session:
        await session.execute(
            update(User).where(User.id == user.id).values(created_at=at, updated_at=at)
        )
        await session.commit()


async def add_codes_and_session(sessions: Sessions, user: User, *, expired_at: datetime) -> None:
    """A used phone code and a session, both expired at ``expired_at``."""
    async with sessions() as session:
        session.add(
            PhoneVerification(
                user_id=user.id,
                phone=user.phone,
                purpose="account_phone",
                code_hash="a" * 64,
                expires_at=expired_at,
                consumed_at=expired_at - timedelta(minutes=2),
            )
        )
        session.add(
            UserSession(user_id=user.id, token_hash=uuid.uuid4().hex * 2, expires_at=expired_at)
        )
        await session.commit()


async def add_delivery(
    sessions: Sessions, s: Setup, driver: User, reference: str, *, at: datetime
) -> None:
    """Give an order an arrival and a code proof, both with GPS, dated ``at``."""
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
        assert order is not None
        assignment = await session.scalar(select(Assignment).where(Assignment.order_id == order.id))
        assert assignment is not None
        attempt = DeliveryAttempt(
            assignment_id=assignment.id,
            order_id=order.id,
            arrived_at=at,
            arrival_location=WKTElement(POINT, srid=4326),
            arrival_accuracy_metres=12.0,
            unloading_completed_at=at,
            recorded_by=driver.id,
            created_at=at,
            updated_at=at,
        )
        code = DeliveryCode(
            order_id=order.id,
            code_hash="b" * 64,
            issued_at=at,
            expires_at=at + timedelta(minutes=10),
            used_at=at + timedelta(minutes=1),
            sms_status=SmsStatus.ACCEPTED,
            issued_by=driver.id,
            created_at=at,
            updated_at=at,
        )
        session.add_all([attempt, code])
        await session.flush()
        session.add(
            DeliveryProof(
                assignment_id=assignment.id,
                order_id=order.id,
                delivery_attempt_id=attempt.id,
                delivered_litres=1200,
                unloading_confirmed=True,
                delivered_at=at,
                method=AcknowledgementMethod.DELIVERY_CODE,
                delivery_code_id=code.id,
                location=WKTElement(POINT, srid=4326),
                location_accuracy_metres=8.0,
                recorded_by=driver.id,
                created_at=at,
                updated_at=at,
            )
        )
        await session.commit()


async def gps_points(sessions: Sessions, reference: str) -> list[object]:
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
        assert order is not None
        attempts = await session.scalars(
            select(DeliveryAttempt.arrival_location).where(DeliveryAttempt.order_id == order.id)
        )
        proofs = await session.scalars(
            select(DeliveryProof.location).where(DeliveryProof.order_id == order.id)
        )
        return [point for point in [*attempts, *proofs] if point is not None]


async def add_open_hold(sessions: Sessions, s: Setup, reference: str) -> None:
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
        assert order is not None
        session.add(
            OrderException(
                order_id=order.id,
                category=ExceptionCategory.UNSAFE_ACCESS,
                note="Gate locked",
                hold_kind=HoldKind.UNSAFE_STOP,
                reported_by=s.admin.id,
            )
        )
        await session.commit()


async def reload_user(sessions: Sessions, user_id: uuid.UUID) -> User | None:
    async with sessions() as session:
        return await session.get(User, user_id)


async def anonymize(sessions: Sessions, s: Setup, *, apply: bool) -> service.AnonymizeResult:
    async with sessions() as session:
        return await service.anonymize_customer(
            session, actor=s.admin, customer_phone=s.customer.phone, now=REVIEW_NOW, apply=apply
        )


def test_anonymize_is_refused_while_an_order_is_open(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        failed = await finished_job(sessions, s, driver, order_status=OrderStatus.FAILED)
        delivered = await finished_job(sessions, s, driver, order_status=OrderStatus.DELIVERED)
        await add_open_hold(sessions, s, delivered)

        with pytest.raises(service.CustomerNotReady) as refused:
            await anonymize(sessions, s, apply=True)
        assert sorted(refused.value.blockers) == sorted(
            [f"{failed}: failed", f"{delivered}: open hold or review"]
        )
        unchanged = await reload_user(sessions, s.customer.id)
        assert unchanged is not None
        assert (unchanged.phone, unchanged.is_active) == (s.customer.phone, True)

    run(scenario)


def test_anonymize_dry_run_saves_nothing_and_apply_removes_the_details(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        delivered = await finished_job(sessions, s, driver, order_status=OrderStatus.DELIVERED)
        cancelled = await finished_job(sessions, s, driver, order_status=OrderStatus.CANCELLED)
        await add_delivery(sessions, s, driver, delivered, at=OLD)
        await add_codes_and_session(sessions, s.customer, expired_at=datetime.now(UTC))
        original_phone = s.customer.phone

        dry = await anonymize(sessions, s, apply=False)
        assert (dry.orders_anonymized, dry.gps_points_cleared, dry.applied) == (2, 2, False)
        assert dry.notes_to_review == 0
        still = await reload_user(sessions, s.customer.id)
        assert still is not None and still.phone == original_phone
        assert len(await gps_points(sessions, delivered)) == 2

        done = await anonymize(sessions, s, apply=True)
        assert (done.customer_id, done.orders_anonymized, done.gps_points_cleared) == (
            s.customer.id,
            2,
            2,
        )

        async with sessions() as session:
            user = await session.get(User, s.customer.id)
            assert user is not None
            assert user.name == "Deleted customer"
            assert user.phone.startswith("+0") and len(user.phone) == 16
            assert (user.is_active, user.phone_verified_at) == (False, None)
            for table in (UserSession, PhoneVerification):
                left = await session.scalars(select(table).where(table.user_id == user.id))
                assert list(left) == []
            for reference in (delivered, cancelled):
                order = await session.scalar(select(Order).where(Order.reference == reference))
                assert order is not None
                assert (order.contact_name, order.contact_phone, order.delivery_address) == (
                    "Deleted",
                    "+0" + "0" * 14,
                    "Deleted",
                )
                assert (order.landmark, order.delivery_instructions) == (None, None)
                assert order.status in {OrderStatus.DELIVERED, OrderStatus.CANCELLED}
            audit = list(
                await session.scalars(select(AuditLog).where(AuditLog.target_id == user.id))
            )
        assert [(row.action, row.details) for row in audit] == [
            ("customer_anonymized", {"orders_anonymized": 2, "gps_points_cleared": 2})
        ]
        assert await gps_points(sessions, delivered) == []

        # The old phone no longer identifies an account; sign-in is impossible.
        with pytest.raises(APIError):
            async with sessions() as session:
                await auth_service.authenticate(session, phone=original_phone, password="unused")

        # The phone is free again; the account is gone from customer lookups.
        with pytest.raises(LookupError):
            await anonymize(sessions, s, apply=True)

    run(scenario)


def test_correct_name_changes_the_name_and_audits_without_names(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        async with sessions() as session:
            customer_id = await service.correct_customer_name(
                session, actor=s.admin, customer_phone=s.customer.phone, name="Corrected Name"
            )
        assert customer_id == s.customer.id
        async with sessions() as session:
            user = await session.get(User, s.customer.id)
            assert user is not None and user.name == "Corrected Name"
            audit = list(
                await session.scalars(select(AuditLog).where(AuditLog.target_id == user.id))
            )
        assert [(row.action, row.details) for row in audit] == [("account_name_corrected", {})]

        async with sessions() as session:
            with pytest.raises(LookupError):
                await service.correct_customer_name(
                    session, actor=s.admin, customer_phone=s.admin.phone, name="Staff"
                )

    run(scenario)


def test_retention_review_dry_run_then_apply_then_nothing_left(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)
        await backdate_user(sessions, s.customer, OLD - timedelta(days=60))
        await add_codes_and_session(sessions, s.customer, expired_at=OLD)

        # Never verified: one due (created over 30 days before REVIEW_NOW), one not yet.
        due = await add_user(sessions, created, UserRole.CUSTOMER)
        await backdate_user(sessions, due, REVIEW_NOW - timedelta(days=31))
        recent = await add_user(sessions, created, UserRole.CUSTOMER)
        await backdate_user(sessions, recent, REVIEW_NOW - timedelta(days=29))

        # Finished in 2017: due for anonymizing (3 years) and its GPS for clearing.
        old_order = await finished_job(
            sessions,
            s,
            driver,
            order_status=OrderStatus.DELIVERED,
            events=[(OrderStatus.DELIVERED, datetime(2017, 5, 1, tzinfo=UTC))],
        )
        await add_delivery(sessions, s, driver, old_order, at=datetime(2017, 5, 1, tzinfo=UTC))
        # Delivered in 2020: GPS due (90 days), order kept (under 3 years).
        recent_order = await finished_job(
            sessions,
            s,
            driver,
            order_status=OrderStatus.DELIVERED,
            events=[(OrderStatus.DELIVERED, OLD)],
        )
        await add_delivery(sessions, s, driver, recent_order, at=OLD)
        # Disputed in 2020: GPS kept as evidence.
        disputed = await finished_job(
            sessions,
            s,
            driver,
            order_status=OrderStatus.DISPUTED,
            events=[(OrderStatus.DISPUTED, OLD)],
        )
        await add_delivery(sessions, s, driver, disputed, at=OLD)

        async def review(apply: bool) -> service.ReviewResult:
            async with sessions() as session:
                return await service.retention_review(
                    session, actor=s.admin, now=REVIEW_NOW, apply=apply
                )

        dry = await review(apply=False)
        assert dry.applied is False
        assert dry.phone_codes_cleared >= 1 and dry.delivery_codes_cleared >= 3
        assert dry.sessions_deleted >= 1 and dry.unverified_accounts_deleted >= 1
        assert dry.gps_points_cleared >= 4 and dry.orders_anonymized >= 1
        assert await reload_user(sessions, due.id) is not None
        assert len(await gps_points(sessions, recent_order)) == 2

        applied = await review(apply=True)
        assert applied == dry.__class__(**{**dry.__dict__, "applied": True})

        async with sessions() as session:
            codes = await session.scalars(
                select(PhoneVerification.code_hash).where(
                    PhoneVerification.user_id == s.customer.id
                )
            )
            assert list(codes) == [""]  # row kept, hash gone
            sessions_left = await session.scalars(
                select(UserSession).where(UserSession.user_id == s.customer.id)
            )
            assert list(sessions_left) == []
            delivery_hashes = await session.scalars(
                select(DeliveryCode.code_hash)
                .join(Order, Order.id == DeliveryCode.order_id)
                .where(Order.customer_id == s.customer.id)
            )
            assert set(delivery_hashes) == {""}
            proofs = await session.scalars(
                select(DeliveryProof.delivery_code_id)
                .join(Order, Order.id == DeliveryProof.order_id)
                .where(Order.customer_id == s.customer.id)
            )
            assert all(code_id is not None for code_id in proofs)  # proofs intact
            old = await session.scalar(select(Order).where(Order.reference == old_order))
            kept = await session.scalar(select(Order).where(Order.reference == recent_order))
            assert old is not None and old.delivery_address == "Deleted"
            assert kept is not None and kept.delivery_address != "Deleted"
            audit = await session.scalar(
                select(AuditLog).where(
                    AuditLog.actor_id == s.admin.id, AuditLog.action == "retention_review_applied"
                )
            )
        assert audit is not None and audit.details["orders_anonymized"] == applied.orders_anonymized
        assert await reload_user(sessions, due.id) is None
        assert await reload_user(sessions, recent.id) is not None
        assert await reload_user(sessions, s.customer.id) is not None  # verified-less, has orders
        assert await gps_points(sessions, old_order) == []
        assert await gps_points(sessions, recent_order) == []
        assert len(await gps_points(sessions, disputed)) == 2

        again = await review(apply=True)
        assert again == service.ReviewResult(0, 0, 0, 0, 0, 0, applied=True)

    run(scenario)


async def set_payment(
    sessions: Sessions,
    reference: str,
    status: PaymentStatus,
    *,
    outstanding: int = 0,
    overpaid: int = 0,
) -> Order:
    async with sessions() as session:
        await session.execute(
            update(Order)
            .where(Order.reference == reference)
            .values(
                payment_method=PaymentMethod.PAY_ON_DELIVERY,
                payment_status=status,
                outstanding_balance_minor_units=outstanding,
                overpaid_minor_units=overpaid,
            )
        )
        await session.commit()
        order = await session.scalar(select(Order).where(Order.reference == reference))
    assert order is not None
    return order


async def add_cash(
    sessions: Sessions,
    s: Setup,
    driver: User,
    reference: str,
    status: CashCollectionStatus,
    *,
    note: str | None = None,
) -> uuid.UUID:
    """A cash collection in ``status``, with the received and reconciled fields it needs."""
    async with sessions() as session:
        order = await session.scalar(select(Order).where(Order.reference == reference))
        assert order is not None
        assignment = await session.scalar(select(Assignment).where(Assignment.order_id == order.id))
        assert assignment is not None
        received = status in {CashCollectionStatus.REMITTED, CashCollectionStatus.RECONCILED}
        remittance_id = None
        if received:
            remittance = CashRemittance(
                driver_id=driver.id,
                recorded_minor_units=100_000,
                counted_minor_units=100_000,
                difference_minor_units=0,
                received_by=s.admin.id,
                remitted_at=OLD,
            )
            session.add(remittance)
            await session.flush()
            remittance_id = remittance.id
        reconciled = status is CashCollectionStatus.RECONCILED
        collection = CashCollection(
            order_id=order.id,
            driver_id=driver.id,
            assignment_id=assignment.id,
            amount_minor_units=100_000,
            note=note,
            status=status,
            collected_at=OLD,
            remittance_due_at=OLD + timedelta(hours=8),
            remittance_id=remittance_id,
            remitted_at=OLD if received else None,
            received_by=s.admin.id if received else None,
            reconciled_at=OLD if reconciled else None,
            reconciled_by=s.admin.id if reconciled else None,
        )
        session.add(collection)
        await session.commit()
        return collection.id


def test_anonymize_refuses_unsettled_cash_and_warns_on_outside_balances(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await setup(sessions, created)
        driver = await add_user(sessions, created, UserRole.DRIVER)

        def delivered() -> object:
            return finished_job(sessions, s, driver, order_status=OrderStatus.DELIVERED)

        not_recorded = await delivered()
        await set_payment(sessions, not_recorded, PaymentStatus.PENDING_COLLECTION)
        with_driver = await delivered()
        await set_payment(sessions, with_driver, PaymentStatus.PENDING_COLLECTION)
        with_driver_cash = await add_cash(
            sessions, s, driver, with_driver, CashCollectionStatus.COLLECTED
        )
        part_paid = await delivered()
        await set_payment(sessions, part_paid, PaymentStatus.PARTIALLY_PAID, outstanding=50_000)
        await add_cash(
            sessions, s, driver, part_paid, CashCollectionStatus.RECONCILED, note="Paid half"
        )
        overpaid = await delivered()
        await set_payment(sessions, overpaid, PaymentStatus.PAID, overpaid=20_000)
        await add_cash(sessions, s, driver, overpaid, CashCollectionStatus.RECONCILED)
        # Cancelled after confirmation: still pending_collection, but no cash can exist.
        cancelled = await finished_job(sessions, s, driver, order_status=OrderStatus.CANCELLED)
        await set_payment(sessions, cancelled, PaymentStatus.PENDING_COLLECTION)

        with pytest.raises(service.CustomerNotReady) as refused:
            await anonymize(sessions, s, apply=False)
        assert sorted(refused.value.blockers) == sorted(
            [f"{not_recorded}: cash not recorded", f"{with_driver}: cash collected"]
        )

        # Settle both in the app: the cash is recorded and reconciled.
        await add_cash(sessions, s, driver, not_recorded, CashCollectionStatus.RECONCILED)
        await set_payment(sessions, not_recorded, PaymentStatus.PAID)
        async with sessions() as session:
            # One statement: the CHECKs tie the status to these fields.
            remittance = CashRemittance(
                driver_id=driver.id,
                recorded_minor_units=100_000,
                counted_minor_units=100_000,
                difference_minor_units=0,
                received_by=s.admin.id,
                remitted_at=OLD,
            )
            session.add(remittance)
            await session.flush()
            await session.execute(
                update(CashCollection)
                .where(CashCollection.id == with_driver_cash)
                .values(
                    status=CashCollectionStatus.RECONCILED,
                    remittance_id=remittance.id,
                    remitted_at=OLD,
                    received_by=s.admin.id,
                    reconciled_at=OLD,
                    reconciled_by=s.admin.id,
                )
            )
            await session.commit()
        await set_payment(sessions, with_driver, PaymentStatus.PAID)

        result = await anonymize(sessions, s, apply=False)
        assert result.cash_warnings == sorted(
            [
                f"{part_paid}: part paid, ₦500.00 outstanding; "
                "check the balance record kept outside the app (F9)",
                f"{overpaid}: overpaid by ₦200.00; "
                "check the refund record kept outside the app (F7)",
            ]
        )
        assert result.notes_to_review == 1  # the driver's cash note
        assert result.orders_anonymized == 5

    run(scenario)
