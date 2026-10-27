"""Request and response bodies for the customer account (docs/api/customer-account.md)."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StrictBool, StringConstraints

from app.modules.customers.models import LABEL_MAX_LENGTH
from app.modules.orders.schemas import DeliveryAddress, Landmark

AddressLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=LABEL_MAX_LENGTH)
]


class ProfileStatsRead(BaseModel):
    """Counts shown on the profile."""

    orders: int
    addresses: int


class CustomerProfileRead(BaseModel):
    """``GET /me/profile``. No email, photo, preferences or points (decisions 1-3, 12)."""

    name: str
    phone: str
    phone_verified: bool
    customer_since: datetime
    stats: ProfileStatsRead


class AddressInput(BaseModel):
    """``POST /me/addresses`` and ``PATCH /me/addresses/{id}``: the whole address.

    Unknown fields are rejected, as ``OrderCreate`` does.
    """

    model_config = ConfigDict(extra="forbid")

    label: AddressLabel
    address: DeliveryAddress
    landmark: Landmark | None = None
    zone_id: uuid.UUID
    make_default: StrictBool = False


class AddressZoneRead(BaseModel):
    """The address's zone; ``is_active`` is read live (FR-010)."""

    id: uuid.UUID
    name: str
    is_active: bool


class AddressRead(BaseModel):
    """One saved address."""

    id: uuid.UUID
    label: str
    address: str
    landmark: str | None
    zone: AddressZoneRead
    is_default: bool
    created_at: datetime
    updated_at: datetime


class AddressPageRead(BaseModel):
    """A page of addresses, default first, then newest (README, "Pagination")."""

    items: list[AddressRead]
    total: int
    limit: int
    offset: int
