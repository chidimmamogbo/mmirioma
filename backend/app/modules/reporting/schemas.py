"""Query and response bodies of the admin overview endpoints (docs/api/admin-operations.md)."""

import datetime as dt
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.auth.models import UserRole
from app.shared.lagos_time import lagos_today


class AdminShellRead(BaseModel):
    """``GET /admin/shell``: the sidebar badges and the header bell."""

    orders_needing_action: int
    support_requests_open: int
    notifications_unread: int


class SupportSettingsRead(BaseModel):
    """The support contact, from backend settings only (FR-055)."""

    phone: str
    whatsapp_enabled: bool


class StaffMemberRead(BaseModel):
    """An administrator; ``role`` is always ``admin`` (one staff role)."""

    id: uuid.UUID
    name: str
    phone: str
    role: Literal["admin"]
    last_sign_in_at: datetime | None


class AdminSettingsRead(BaseModel):
    """``GET /admin/settings``, read only (contract decision 4)."""

    support: SupportSettingsRead
    delivery_code_validity_minutes: int
    staff: list[StaffMemberRead]


# --- Part 2: dashboard, live map, activity, reports ------------------------------------

#: ``simulated`` query values: real records (default) or simulated ones only.
#: There is no "include": the two are never mixed (BR-09).
SimulatedFilter = Literal["exclude", "only"]
#: Most activity lines one request may ask for.
ACTIVITY_LIMIT_MAX = 20


class DashboardParams(BaseModel):
    """Query of ``GET /admin/dashboard``.

    Attributes:
        date: A Lagos date, today or earlier; today when left out.
        simulated: ``exclude`` (default) or ``only``.
    """

    date: dt.date | None = None
    simulated: SimulatedFilter = "exclude"

    @field_validator("date")
    @classmethod
    def _not_in_the_future(cls, value: dt.date | None) -> dt.date | None:
        if value is not None and value > lagos_today():
            raise ValueError("The date cannot be in the future")
        return value


class ReportParams(BaseModel):
    """Query of ``GET /admin/reports``: ``range`` is required (the screen's pills)."""

    range: Literal["today", "7d", "30d"]
    simulated: SimulatedFilter = "exclude"


class ActivityParams(BaseModel):
    """Query of ``GET /admin/activity``."""

    limit: int = Field(5, ge=1, le=ACTIVITY_LIMIT_MAX)


class OrderCountsRead(BaseModel):
    """Orders by backend status; statuses with none are left out."""

    total: int
    by_status: dict[str, int]


class DashboardOrdersRead(OrderCountsRead):
    """The dashboard's orders, with how long the oldest has waited."""

    oldest_waiting_minutes: int | None


class DeliveriesRead(BaseModel):
    """Deliveries and the FR-052 on-time count (the screen computes the rate)."""

    delivered: int
    with_window: int
    on_time: int


class DeliveryTypeCountsRead(BaseModel):
    """Orders by delivery type; ``not_recorded`` for orders created before #21."""

    keke: int
    tanker: int
    not_recorded: int


class DriversAvailableRead(BaseModel):
    """Active, approved, available drivers (FR-031)."""

    total: int
    keke: int
    tanker: int


class SourceCountsRead(BaseModel):
    """Water sources usable for dispatch under FR-012, and the rest."""

    usable: int
    not_usable: int


class CashRead(BaseModel):
    """Cash collections (FR-041), integer kobo."""

    collected_minor_units: int
    reconciled_minor_units: int


class AdminDashboardRead(BaseModel):
    """``GET /admin/dashboard`` (``AdminDashboardRead`` in the contract)."""

    date: dt.date
    is_simulated: bool
    orders: DashboardOrdersRead
    deliveries: DeliveriesRead
    by_delivery_type: DeliveryTypeCountsRead
    holds_open: int
    support_requests_open: int
    drivers_available: DriversAvailableRead
    sources: SourceCountsRead
    cash: CashRead


class ZoneRowRead(BaseModel):
    """A ``by_zone`` row; ``zone_id`` and ``name`` are null for orders with no zone."""

    zone_id: uuid.UUID | None
    name: str | None
    orders: int
    delivered: int


class DriverRowRead(BaseModel):
    """A ``by_driver`` row; no pay (partner pay is out of the MVP)."""

    driver_id: uuid.UUID
    name: str
    plate: str | None
    delivered: int


class SourceRowRead(BaseModel):
    """A ``by_source`` row: pickup records per source (the design's loads by station)."""

    source_id: uuid.UUID
    name: str
    pickups: int


class AdminReportRead(BaseModel):
    """``GET /admin/reports`` (``AdminReportRead``): aggregates and names only (FR-053)."""

    range: Literal["today", "7d", "30d"]
    from_: dt.date = Field(serialization_alias="from")
    to: dt.date
    is_simulated: bool
    orders: OrderCountsRead
    deliveries: DeliveriesRead
    by_delivery_type: DeliveryTypeCountsRead
    cash: CashRead
    by_zone: list[ZoneRowRead]
    by_driver: list[DriverRowRead]
    by_source: list[SourceRowRead]


class LiveDriverRead(BaseModel):
    """The driver of a job on the road."""

    id: uuid.UUID
    name: str
    plate: str | None


class NamedRef(BaseModel):
    """A source or zone by id and name."""

    id: uuid.UUID
    name: str


class LiveDeliveryRead(BaseModel):
    """A job on the road; placed by source and zone, never by GPS (FR-037)."""

    reference: str
    status: str
    delivery_type: Literal["keke", "tanker"] | None
    driver: LiveDriverRead
    source: NamedRef | None
    zone: NamedRef | None
    is_simulated: bool


class LiveSourceRead(BaseModel):
    """A water source on the map."""

    id: uuid.UUID
    name: str
    approximate_location: str
    usable: bool
    is_simulated: bool


class LiveMapRead(BaseModel):
    """``GET /admin/live-map``: no customer name, phone or address."""

    deliveries: list[LiveDeliveryRead]
    sources: list[LiveSourceRead]


class ActivityActorRead(BaseModel):
    """Who did it: a staff member (``admin``) or a driver; never a customer."""

    name: str
    role: UserRole


class ActivityItemRead(BaseModel):
    """One line of recent activity; clients show an unknown ``kind`` as a plain line."""

    id: uuid.UUID
    at: datetime
    kind: Literal["order_status", "support_request"]
    order_reference: str | None
    to_status: str | None
    actor: ActivityActorRead | None
    is_simulated: bool


class ActivityRead(BaseModel):
    """``GET /admin/activity``, newest first."""

    items: list[ActivityItemRead]
