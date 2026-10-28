"""Request and response bodies of the admin customer directory.

Source: docs/api/admin-directory.md, "Customers" (agreed, G3, #43). Staff see
phones and addresses (NFR-003); nothing here is sent to a customer.
"""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.modules.customers.schemas import AddressLabel
from app.modules.orders.models import DeliveryType, OrderStatus
from app.modules.orders.schemas import PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX, DeliveryAddress, Landmark

#: ``q`` on the customer list: trimmed, 1-100 characters.
SearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class AdminCustomerListParams(BaseModel):
    """Query parameters of ``GET /admin/customers``.

    Attributes:
        q: Matches a part of the name (case-insensitive) or, with 4 or more
            digits, a part of the phone in E.164 or local ``0...`` form.
        limit: Page size, 1-100 (default 50).
        offset: Rows to skip.
    """

    q: SearchText | None = None
    limit: int = Field(PAGE_LIMIT_DEFAULT, ge=1, le=PAGE_LIMIT_MAX)
    offset: int = Field(0, ge=0)


class AdminAddressZoneRead(BaseModel):
    """The address's zone; ``is_active`` is read live (FR-010)."""

    id: uuid.UUID
    name: str
    is_active: bool


class AdminAddressRead(BaseModel):
    """One saved address, as staff see it (the contract's ``Address``)."""

    id: uuid.UUID
    label: str
    address: str
    landmark: str | None
    zone: AdminAddressZoneRead
    is_default: bool
    created_at: datetime


class AdminRecentOrderRead(BaseModel):
    """One of the customer's newest orders: enough to find it in the Orders page."""

    reference: str
    created_at: datetime
    status: OrderStatus
    quantity_litres: int
    delivery_type: DeliveryType | None


class AdminCustomerSummaryRead(BaseModel):
    """One row of the customer list."""

    id: uuid.UUID
    name: str
    phone: str
    phone_verified: bool
    is_active: bool
    orders_count: int
    created_at: datetime


class AdminCustomerRead(AdminCustomerSummaryRead):
    """The customer detail: the summary plus money, addresses and recent orders."""

    paid_total_minor_units: int
    addresses: list[AdminAddressRead]
    recent_orders: list[AdminRecentOrderRead]


class AdminCustomerPageRead(BaseModel):
    """A page of customers, newest first, plus the header count."""

    items: list[AdminCustomerSummaryRead]
    total: int
    limit: int
    offset: int
    ordered_last_7_days: int


class AdminAddressCreate(BaseModel):
    """``POST /admin/customers/{id}/addresses``. Unknown fields are rejected.

    ``zone_id`` is required: an address must have a zone (SRS §5, FR-020).
    """

    model_config = ConfigDict(extra="forbid")

    label: AddressLabel
    address: DeliveryAddress
    landmark: Landmark | None = None
    zone_id: uuid.UUID
