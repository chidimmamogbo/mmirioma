"""Request and response bodies for the customer account (docs/api/customer-account.md)."""

import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, StrictBool, StringConstraints

from app.modules.customers.models import (
    LABEL_MAX_LENGTH,
    NOTE_MAX_LENGTH,
    SUPPORT_MESSAGE_MAX_LENGTH,
    SUPPORT_MESSAGE_MIN_LENGTH,
    DeletionRequestStatus,
    SupportRequestStatus,
    SupportRequestType,
)
from app.modules.orders.schemas import DeliveryAddress, Landmark


def _blank_to_none(value: str) -> str | None:
    # An optional text left as spaces means "not given".
    return value or None


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


SupportMessage = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=SUPPORT_MESSAGE_MIN_LENGTH,
        max_length=SUPPORT_MESSAGE_MAX_LENGTH,
    ),
]
OrderReference = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]
DeletionReason = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=NOTE_MAX_LENGTH),
    AfterValidator(_blank_to_none),
]


class SupportRequestCreate(BaseModel):
    """``POST /me/support-requests``. Unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    type: SupportRequestType
    message: SupportMessage
    order_reference: OrderReference | None = None
    idempotency_key: uuid.UUID


class SupportRequestRead(BaseModel):
    """A support request as its customer sees it (contract "Support request object")."""

    reference: str
    type: SupportRequestType
    message: str
    order_reference: str | None
    status: SupportRequestStatus
    created_at: datetime
    resolved_at: datetime | None


class SupportRequestPageRead(BaseModel):
    """A page of support requests, newest first."""

    items: list[SupportRequestRead]
    total: int
    limit: int
    offset: int


class DeletionRequestCreate(BaseModel):
    """``POST /me/deletion-request``: an optional reason. Unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    reason: DeletionReason | None = None


class DeletionRequestRead(BaseModel):
    """A deletion request as its customer sees it.

    The reason, the staff notes and who handled it are not returned.
    """

    reference: str
    status: DeletionRequestStatus
    requested_at: datetime
    acknowledge_by: date
