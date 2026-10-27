"""Admin operations part 1 against a real, migrated database (#102).

docs/api/admin-operations.md: the admin notifications each action creates
(one row per active admin, in the action's transaction; none for
``assignment_expired``, which nothing triggers), support requests for staff
(list, search, contacts, resolve with its audit row, final), the audit log
filter, the shell counts and the staff list with ``last_sign_in_at``.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards. Rows for admins created
here are checked, so admins left in the database by others do not matter.
"""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.modules.audit import service as audit_service
from app.modules.audit.models import AuditLog
from app.modules.auth import service as auth_service
from app.modules.auth.models import User, UserRole, UserSession
from app.modules.customers import requests
from app.modules.customers.models import SupportRequestStatus, SupportRequestType
from app.modules.deliveries import service as deliveries_service
from app.modules.deliveries.models import ExceptionCategory
from app.modules.dispatch import service as dispatch_service
from app.modules.notifications import admin_messages
from app.modules.notifications.models import Notification
from app.modules.orders.models import OrderStatus
from app.modules.privacy import service as privacy_service
from app.modules.reporting import service as reporting
from tests import test_deliveries_integration as deliveries_tests
from tests import test_dispatch_integration as dispatch_tests
from tests import test_driver_job_steps_integration as steps_tests
from tests import test_partners_integration as partners_tests
from tests.test_deliveries_integration import Sessions, expect_error
from tests.test_orders_integration import TEST_DATABASE_URL, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]


@dataclass
class Created:
    """Every row a test creates; the helpers borrowed from other test modules fill it."""

    user_ids: list[uuid.UUID] = field(default_factory=list)
    source_ids: list[uuid.UUID] = field(default_factory=list)
    vehicle_ids: list[uuid.UUID] = field(default_factory=list)
    zone_ids: list[uuid.UUID] = field(default_factory=list)


@pytest.fixture
def created(monkeypatch: pytest.MonkeyPatch) -> Iterator[Created]:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL or "")
    get_settings.cache_clear()
    rows = Created()
    yield rows
    url = get_settings().sync_database_url.set(drivername="postgresql")
    users = (rows.user_ids,)
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        # Foreign keys are RESTRICT, so children first; notifications and
        # driver service zones go with their orders, users and profiles.
        for statement in (
            "DELETE FROM support_requests WHERE user_id = ANY(%s)",
            "DELETE FROM audit_logs WHERE actor_id = ANY(%s)",
            "DELETE FROM order_exceptions WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM delivery_proofs WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM contact_attempts WHERE delivery_attempt_id IN "
            "(SELECT id FROM delivery_attempts WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s)))",
            "DELETE FROM delivery_attempts WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM delivery_codes WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM pickup_records WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM order_price_snapshots WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM cash_collections WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM cash_remittances WHERE driver_id = ANY(%s)",
            "DELETE FROM order_events WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM assignments WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM assignments WHERE driver_user_id = ANY(%s)",
            "DELETE FROM orders WHERE customer_id = ANY(%s)",
            "DELETE FROM driver_profiles WHERE user_id = ANY(%s)",
            "DELETE FROM user_sessions WHERE user_id = ANY(%s)",
        ):
            connection.execute(statement, users)
        connection.execute("DELETE FROM vehicle_profiles WHERE id = ANY(%s)", (rows.vehicle_ids,))
        connection.execute(
            "DELETE FROM water_source_categories WHERE source_id = ANY(%s)", (rows.source_ids,)
        )
        connection.execute("DELETE FROM water_sources WHERE id = ANY(%s)", (rows.source_ids,))
        connection.execute("DELETE FROM users WHERE id = ANY(%s)", users)
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", (rows.zone_ids,))
    get_settings.cache_clear()


async def add_admin(sessions: Sessions, created: Created, *, active: bool = True) -> User:
    admin = await dispatch_tests.add_user(sessions, created, UserRole.ADMIN)  # type: ignore[arg-type]
    if not active:
        async with sessions() as session:
            stored = await session.get(User, admin.id)
            assert stored is not None
            stored.is_active = False
            await session.commit()
    return admin


async def admin_messages_for(
    sessions: Sessions, admin_ids: list[uuid.UUID]
) -> list[tuple[uuid.UUID, str, str, uuid.UUID | None]]:
    """``(user_id, kind, body, order_id)`` of the admin rows these admins received."""
    async with sessions() as session:
        rows = await session.execute(
            select(
                Notification.user_id, Notification.kind, Notification.body, Notification.order_id
            )
            .where(
                Notification.user_id.in_(admin_ids),
                Notification.kind.in_(admin_messages.ADMIN_KINDS),
            )
            .order_by(Notification.created_at, Notification.id)
        )
    return [tuple(row) for row in rows]  # type: ignore[misc]


# --- Admin notifications ---------------------------------------------------------------


def test_a_decline_tells_each_active_admin_once(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        first = await add_admin(sessions, created)
        second = await add_admin(sessions, created)
        inactive = await add_admin(sessions, created, active=False)
        driver = await dispatch_tests.add_driver(sessions, created)  # type: ignore[arg-type]
        order = await dispatch_tests.confirmed_order(sessions, created)  # type: ignore[arg-type]
        async with sessions() as session:
            await dispatch_service.assign_driver(
                session, order_id=order.id, driver_user_id=driver.id, admin=first
            )
        # An offer alone tells no admin anything.
        assert await admin_messages_for(sessions, [first.id, second.id]) == []
        async with sessions() as session:
            await dispatch_service.decline_assignment(session, order_id=order.id, driver=driver)
        body = f"{order.reference} needs another driver."
        rows = await admin_messages_for(sessions, [first.id, second.id, inactive.id])
        assert sorted(rows) == sorted(
            [
                (first.id, "driver_declined", body, order.id),
                (second.id, "driver_declined", body, order.id),
            ]
        )

    run(scenario)


def test_holds_tell_admins_once_per_driver_action(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await deliveries_tests.setup(sessions, created)  # type: ignore[arg-type]
        driver = await deliveries_tests.add_user(sessions, created, UserRole.DRIVER)  # type: ignore[arg-type]
        reference = await deliveries_tests.add_job(
            sessions, s, driver, order_status=OrderStatus.DEPARTED
        )
        # A pickup at another source with a safety concern opens two holds,
        # but the admin gets one message.
        async with sessions() as session:
            await deliveries_service.record_pickup(
                session,
                driver=driver,
                reference=reference,
                pickup=deliveries_tests.pickup(
                    assigned_source=False,
                    other_source_name="Sample Tanker Point",
                    safety_concern=True,
                    safety_note="Sample: the tank smelled of fuel",
                ),
                now=deliveries_tests.NOW,
            )
        order = await deliveries_tests.order_for(sessions, reference)
        hold = (
            s.admin.id,
            "hold_opened",
            f"{reference} needs your review before the driver continues.",
            order.id,
        )
        assert await admin_messages_for(sessions, [s.admin.id]) == [hold]

        # An incident that does not stop the job adds nothing; an unsafe one adds one.
        # A driver holds one live job at a time, so a second driver takes it.
        second = await deliveries_tests.add_user(sessions, created, UserRole.DRIVER)  # type: ignore[arg-type]
        other = await deliveries_tests.add_job(
            sessions, s, second, order_status=OrderStatus.EN_ROUTE
        )
        for category in (ExceptionCategory.RUNNING_LATE, ExceptionCategory.UNSAFE_TRANSFER):
            async with sessions() as session:
                await deliveries_service.report_incident(
                    session,
                    driver=second,
                    reference=other,
                    incident=deliveries_service.NewIncident(
                        category,
                        None,
                        deliveries_tests.NOW + timedelta(hours=1)
                        if category is ExceptionCategory.RUNNING_LATE
                        else None,
                    ),
                    now=deliveries_tests.NOW,
                )
        other_order = await deliveries_tests.order_for(sessions, other)
        assert [row[1:] for row in await admin_messages_for(sessions, [s.admin.id])] == [
            hold[1:],
            (
                "hold_opened",
                f"{other} needs your review before the driver continues.",
                other_order.id,
            ),
        ]

    run(scenario)


def test_alternative_proof_tells_admins(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await deliveries_tests.setup(sessions, created)  # type: ignore[arg-type]
        driver = await deliveries_tests.add_user(sessions, created, UserRole.DRIVER)  # type: ignore[arg-type]
        reference, _sms, _ = await steps_tests.code_issued(sessions, s, driver)
        async with sessions() as session:
            await deliveries_service.submit_proof(
                session, driver=driver, reference=reference, proof=steps_tests.alternative_proof()
            )
        assert [row[1] for row in await admin_messages_for(sessions, [s.admin.id])] == [
            "hold_opened"
        ]

    run(scenario)


def test_a_partner_sign_up_tells_admins(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_admin(sessions, created)
        zone = await partners_tests.add_zone(sessions, created)  # type: ignore[arg-type]
        await partners_tests.sign_up(sessions, created, zone)  # type: ignore[arg-type]
        assert await admin_messages_for(sessions, [admin.id]) == [
            (
                admin.id,
                "partner_pending",
                "Check their vehicle and phone, then approve or suspend.",
                None,
            )
        ]

    run(scenario)


# --- Support requests ------------------------------------------------------------------


async def send_request(
    sessions: Sessions,
    customer: User,
    *,
    order_reference: str | None,
    key: uuid.UUID | None = None,
    message: str = "The water has not arrived yet.",
) -> str:
    async with sessions() as session:
        request, _, _ = await requests.create_support_request(
            session,
            customer,
            type=SupportRequestType.LATE,
            message=message,
            order_reference=order_reference,
            idempotency_key=key or uuid.uuid4(),
        )
    return request.reference


def test_support_requests_notify_list_contact_and_resolve(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s = await deliveries_tests.setup(sessions, created)  # type: ignore[arg-type]
        driver = await deliveries_tests.add_user(sessions, created, UserRole.DRIVER)  # type: ignore[arg-type]
        order_ref = await deliveries_tests.add_job(
            sessions, s, driver, order_status=OrderStatus.EN_ROUTE
        )
        order = await deliveries_tests.order_for(sessions, order_ref)
        key = uuid.uuid4()
        with_order = await send_request(sessions, s.customer, order_reference=order_ref, key=key)
        # An idempotent retry adds no second message.
        await send_request(sessions, s.customer, order_reference=order_ref, key=key)
        without_order = await send_request(
            sessions, s.customer, order_reference=None, message="How do I pay?"
        )
        assert [row[1:] for row in await admin_messages_for(sessions, [s.admin.id])] == [
            ("support_request", f"A customer reported a problem with {order_ref}.", order.id),
            ("support_request", "A customer reported a problem.", None),
        ]

        async with sessions() as session:
            views, total = await requests.list_admin_support_requests(
                session, status=None, q=s.customer.name, limit=50, offset=0
            )
            assert {view.request.reference for view in views} >= {with_order, without_order}
            assert total >= 2
            # Search by the order reference; LIKE wildcards match literally.
            found, _ = await requests.list_admin_support_requests(
                session, status=None, q=order_ref.lower(), limit=50, offset=0
            )
            assert [view.request.reference for view in found] == [with_order]
            assert found[0].is_simulated is True  # add_job orders are simulated
            # "%" is matched literally, so it does not match every request.
            nothing, count = await requests.list_admin_support_requests(
                session, status=None, q=f"{s.customer.name}%", limit=50, offset=0
            )
            assert (nothing, count) == ([], 0)

            view, contacts = await requests.get_admin_support_request(session, reference=with_order)
            assert view.customer.id == s.customer.id
            assert [(c.role, c.name, c.phone) for c in contacts] == [
                ("customer", "Ngozi Adeyemi", "+2348000000001"),
                ("driver", driver.name, driver.phone),
            ]
            _, alone = await requests.get_admin_support_request(session, reference=without_order)
            assert [(c.role, c.phone) for c in alone] == [("customer", s.customer.phone)]
            await expect_error(
                requests.get_admin_support_request(session, reference="SR-NOTFOUND"),
                404,
                "support_request_not_found",
            )

        async with sessions() as session:
            resolved = await requests.resolve_support_request(
                session, reference=with_order, admin=s.admin, note="Called the customer."
            )
        assert resolved.request.status is SupportRequestStatus.RESOLVED
        assert resolved.resolver is not None and resolved.resolver.id == s.admin.id
        async with sessions() as session:
            await expect_error(
                requests.resolve_support_request(
                    session, reference=with_order, admin=s.admin, note="Again, later."
                ),
                409,
                "support_request_already_resolved",
            )
        async with sessions() as session:
            audit = list(
                await session.scalars(
                    select(AuditLog).where(AuditLog.target_id == resolved.request.id)
                )
            )
            # The customer sees it as resolved; the order is unchanged.
            mine, _ = await requests.list_support_requests(session, s.customer, limit=50, offset=0)
            open_only, _ = await requests.list_admin_support_requests(
                session, status=SupportRequestStatus.OPEN, q=s.customer.name, limit=50, offset=0
            )
        assert [(a.action, a.actor_id, a.details) for a in audit] == [
            ("support_request_resolved", s.admin.id, {})
        ]
        assert {r.reference: r.status for r, _ in mine}[with_order] is SupportRequestStatus.RESOLVED
        assert [v.request.reference for v in open_only] == [without_order]
        assert (
            await deliveries_tests.order_for(sessions, order_ref)
        ).status is OrderStatus.EN_ROUTE

        async with sessions() as session:
            page, total = await audit_service.list_logs(
                session,
                target_type="support_request",
                target_id=resolved.request.id,
                limit=50,
                offset=0,
            )
        assert (total, [(log.action, actor.id) for log, actor in page]) == (
            1,
            [("support_request_resolved", s.admin.id)],
        )

    run(scenario)


# --- Shell and settings ----------------------------------------------------------------


def test_shell_counts_and_staff_last_sign_in(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_admin(sessions, created)
        never = await add_admin(sessions, created)
        inactive = await add_admin(sessions, created, active=False)
        driver = await dispatch_tests.add_driver(sessions, created)  # type: ignore[arg-type]
        waiting = await dispatch_tests.confirmed_order(sessions, created)  # type: ignore[arg-type]
        offered = await dispatch_tests.confirmed_order(sessions, created)  # type: ignore[arg-type]
        async with sessions() as session:
            before = await reporting.shell_counts(session, admin)
            await dispatch_service.assign_driver(
                session, order_id=offered.id, driver_user_id=driver.id, admin=admin
            )
        async with sessions() as session:
            after = await reporting.shell_counts(session, admin)
        # The offered order has a live assignment, so it no longer waits on staff.
        assert after.orders_needing_action == before.orders_needing_action - 1
        assert waiting.status is OrderStatus.CONFIRMED

        signed_in = datetime.now(UTC).replace(microsecond=0) - timedelta(hours=2)
        async with sessions() as session:
            for created_at in (signed_in - timedelta(days=3), signed_in):
                session.add(
                    UserSession(
                        user_id=admin.id,
                        token_hash=uuid.uuid4().hex + uuid.uuid4().hex,
                        expires_at=signed_in + timedelta(days=7),
                        created_at=created_at,
                        updated_at=created_at,
                    )
                )
            await session.commit()
        async with sessions() as session:
            staff = {member.user.id: member for member in await auth_service.list_staff(session)}
        assert staff[admin.id].last_sign_in_at == signed_in
        assert staff[never.id].last_sign_in_at is None
        assert inactive.id not in staff
        assert driver.id not in staff

    run(scenario)


def test_an_anonymized_customers_request_still_reads_for_staff(created: Created) -> None:
    # #117: anonymizing replaces the message and the staff note with the same
    # text, so the admin view keeps its agreed shape (resolution.note is a string).
    async def scenario(sessions: Sessions) -> None:
        admin = await add_admin(sessions, created)
        customer = await dispatch_tests.add_user(sessions, created, UserRole.CUSTOMER)  # type: ignore[arg-type]
        reference = await send_request(sessions, customer, order_reference=None)
        async with sessions() as session:
            await requests.resolve_support_request(
                session,
                reference=reference,
                admin=admin,
                note=f"Called {customer.name} back on {customer.phone}.",
            )
        async with sessions() as session:
            await privacy_service.anonymize_customer(
                session,
                actor=admin,
                customer_phone=customer.phone,
                now=datetime.now(UTC),
                apply=True,
            )
        async with sessions() as session:
            view, contacts = await requests.get_admin_support_request(session, reference=reference)
            page, _ = await requests.list_admin_support_requests(
                session, status=SupportRequestStatus.RESOLVED, q=reference, limit=50, offset=0
            )
        removed = "Removed at the customer's request."
        assert (view.request.message, view.request.resolution_note) == (removed, removed)
        assert view.request.status is SupportRequestStatus.RESOLVED
        assert view.resolver is not None and view.resolver.id == admin.id
        assert view.customer.name == "Deleted customer"
        assert customer.phone not in {c.phone for c in contacts}
        assert [v.request.reference for v in page] == [reference]

    run(scenario)
