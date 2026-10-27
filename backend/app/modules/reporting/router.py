"""Admin overview endpoints (docs/api/admin-operations.md): shell, settings,
dashboard, live map, activity and reports.

``CurrentAdmin`` only, so customers and drivers get 403 ``forbidden``
(FR-001). All are reads; settings cannot be saved in the app (contract
decision 4). The dashboard and reports take ``simulated=exclude`` (default)
or ``only`` and never mix the two (BR-09). Handlers only translate between
HTTP and :mod:`app.modules.reporting.service`.
"""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.orders import reporting as orders_reporting
from app.modules.payments import service as payments_service
from app.modules.reporting import service
from app.modules.reporting.schemas import (
    ActivityActorRead,
    ActivityItemRead,
    ActivityParams,
    ActivityRead,
    AdminDashboardRead,
    AdminReportRead,
    AdminSettingsRead,
    AdminShellRead,
    CashRead,
    DashboardOrdersRead,
    DashboardParams,
    DeliveriesRead,
    DeliveryTypeCountsRead,
    DriverRowRead,
    DriversAvailableRead,
    LiveDeliveryRead,
    LiveDriverRead,
    LiveMapRead,
    LiveSourceRead,
    NamedRef,
    OrderCountsRead,
    ReportParams,
    SourceCountsRead,
    SourceRowRead,
    StaffMemberRead,
    SupportSettingsRead,
    ZoneRowRead,
)
from app.shared.lagos_time import lagos_today

router = APIRouter(prefix="/admin", tags=["admin overview"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}


@router.get("/shell", responses=_AUTH_ERRORS)
async def get_shell(admin: CurrentAdmin, db: DbSession) -> AdminShellRead:
    """The sidebar badges and the header bell for the signed-in admin."""
    counts = await service.shell_counts(db, admin)
    return AdminShellRead(
        orders_needing_action=counts.orders_needing_action,
        support_requests_open=counts.support_requests_open,
        notifications_unread=counts.notifications_unread,
    )


@router.get("/settings", responses=_AUTH_ERRORS)
async def get_settings_page(admin: CurrentAdmin, db: DbSession) -> AdminSettingsRead:
    """The support contact, the delivery code validity and the staff, read only."""
    settings = await service.admin_settings(db)
    return AdminSettingsRead(
        support=SupportSettingsRead(
            phone=settings.support_phone, whatsapp_enabled=settings.whatsapp_enabled
        ),
        delivery_code_validity_minutes=settings.delivery_code_validity_minutes,
        staff=[
            StaffMemberRead(
                id=member.user.id,
                name=member.user.name,
                phone=member.user.phone,
                role="admin",
                last_sign_in_at=member.last_sign_in_at,
            )
            for member in settings.staff
        ],
    )


def _deliveries(counts: orders_reporting.DeliveryCounts) -> DeliveriesRead:
    return DeliveriesRead(
        delivered=counts.delivered, with_window=counts.with_window, on_time=counts.on_time
    )


def _cash(cash: payments_service.CashTotals) -> CashRead:
    return CashRead(
        collected_minor_units=cash.collected_minor_units,
        reconciled_minor_units=cash.reconciled_minor_units,
    )


@router.get("/dashboard", responses=_AUTH_ERRORS)
async def get_dashboard(
    params: Annotated[DashboardParams, Query()], admin: CurrentAdmin, db: DbSession
) -> AdminDashboardRead:
    """The dashboard for a Lagos date (today by default), real or simulated records (BR-09)."""
    board = await service.dashboard(
        db, day=params.date or lagos_today(), simulated=params.simulated == "only"
    )
    return AdminDashboardRead(
        date=board.day,
        is_simulated=board.is_simulated,
        orders=DashboardOrdersRead(
            total=board.orders.total,
            by_status=board.orders.by_status,
            oldest_waiting_minutes=board.oldest_waiting_minutes,
        ),
        deliveries=_deliveries(board.deliveries),
        by_delivery_type=DeliveryTypeCountsRead(**board.orders.by_delivery_type),
        holds_open=board.holds_open,
        support_requests_open=board.support_requests_open,
        drivers_available=DriversAvailableRead(
            total=board.drivers.total, keke=board.drivers.keke, tanker=board.drivers.tanker
        ),
        sources=SourceCountsRead(usable=board.sources_usable, not_usable=board.sources_not_usable),
        cash=_cash(board.cash),
    )


@router.get("/reports", responses=_AUTH_ERRORS)
async def get_report(
    params: Annotated[ReportParams, Query()], admin: CurrentAdmin, db: DbSession
) -> AdminReportRead:
    """Aggregates over today, 7 or 30 Lagos days; no customer data (FR-052, FR-053)."""
    result = await service.report(db, range_name=params.range, simulated=params.simulated == "only")
    return AdminReportRead(
        range=params.range,
        from_=result.from_day,
        to=result.to_day,
        is_simulated=result.is_simulated,
        orders=OrderCountsRead(total=result.orders.total, by_status=result.orders.by_status),
        deliveries=_deliveries(result.deliveries),
        by_delivery_type=DeliveryTypeCountsRead(**result.orders.by_delivery_type),
        cash=_cash(result.cash),
        by_zone=[
            ZoneRowRead(zone_id=r.zone_id, name=r.name, orders=r.orders, delivered=r.delivered)
            for r in result.by_zone
        ],
        by_driver=[
            DriverRowRead(
                driver_id=r.driver.id, name=r.driver.name, plate=r.plate, delivered=r.delivered
            )
            for r in result.by_driver
        ],
        by_source=[
            SourceRowRead(source_id=r.source_id, name=r.name, pickups=r.pickups)
            for r in result.by_source
        ],
    )


@router.get("/live-map", responses=_AUTH_ERRORS)
async def get_live_map(admin: CurrentAdmin, db: DbSession) -> LiveMapRead:
    """Jobs on the road and every source; placed by source and zone, never GPS (FR-037)."""
    data = await service.live_map(db)
    deliveries = []
    for item in data.deliveries:
        order = item.job.order
        deliveries.append(
            LiveDeliveryRead(
                reference=order.reference,
                status=order.status.value,
                delivery_type=order.delivery_type.value if order.delivery_type else None,
                driver=LiveDriverRead(
                    id=item.job.driver.id, name=item.job.driver.name, plate=item.job.plate
                ),
                source=(
                    NamedRef(id=order.source_id, name=item.source_name)
                    if order.source_id is not None and item.source_name is not None
                    else None
                ),
                zone=(
                    NamedRef(id=order.service_zone_id, name=item.zone_name)
                    if order.service_zone_id is not None and item.zone_name is not None
                    else None
                ),
                is_simulated=order.is_simulated,
            )
        )
    return LiveMapRead(
        deliveries=deliveries,
        sources=[
            LiveSourceRead(
                id=source.id,
                name=source.name,
                approximate_location=source.approximate_location,
                usable=usable,
                is_simulated=source.is_simulated,
            )
            for source, usable in data.sources
        ],
    )


@router.get("/activity", responses=_AUTH_ERRORS)
async def get_activity(
    params: Annotated[ActivityParams, Query()], admin: CurrentAdmin, db: DbSession
) -> ActivityRead:
    """The newest order status changes and support requests, newest first."""
    items = await service.activity(db, limit=params.limit)
    return ActivityRead(
        items=[
            ActivityItemRead(
                id=item.id,
                at=item.at,
                kind=item.kind,
                order_reference=item.order_reference,
                to_status=item.to_status.value if item.to_status is not None else None,
                actor=(
                    ActivityActorRead(name=item.actor.name, role=item.actor.role)
                    if item.actor is not None
                    else None
                ),
                is_simulated=item.is_simulated,
            )
            for item in items
        ]
    )
