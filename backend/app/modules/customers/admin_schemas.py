"""Request and response bodies for the admin side of support requests.

docs/api/admin-operations.md, "Support requests (admin)". The customer side
is in :mod:`app.modules.customers.schemas`.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.modules.customers.models import NOTE_MAX_LENGTH, SupportRequestStatus, SupportRequestType
from app.modules.orders.schemas import PageParams

#: The contract's minimum for a resolution note (the mock asks for 5).
RESOLUTION_NOTE_MIN_LENGTH = 5
#: Most characters of the search text.
SEARCH_MAX_LENGTH = 100

ResolutionNote = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=RESOLUTION_NOTE_MIN_LENGTH, max_length=NOTE_MAX_LENGTH
    ),
]
SearchText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=SEARCH_MAX_LENGTH)
]


class AdminSupportListParams(PageParams):
    """Query of ``GET /admin/support-requests``.

    Attributes:
        status: Only ``open`` or only ``resolved``; both when left out.
        q: Matches the request reference, the order reference or the
            customer name, ignoring case.
    """

    status: SupportRequestStatus | None = None
    q: SearchText | None = None


class SupportCustomerRead(BaseModel):
    """The customer who wrote the request (NFR-003: staff only)."""

    id: uuid.UUID
    name: str
    phone: str


class SupportResolverRead(BaseModel):
    """The admin who resolved the request."""

    id: uuid.UUID
    name: str


class SupportResolutionRead(BaseModel):
    """How the request was resolved; null on the request while it is open."""

    note: str
    resolved_by: SupportResolverRead
    resolved_at: datetime


class AdminSupportRequestRead(BaseModel):
    """The admin support request object (contract example ``admin-support-request.json``)."""

    reference: str
    type: SupportRequestType
    message: str
    order_reference: str | None
    status: SupportRequestStatus
    created_at: datetime
    customer: SupportCustomerRead
    resolution: SupportResolutionRead | None
    is_simulated: bool


class SupportContactRead(BaseModel):
    """A person the "Call" buttons dial: the order's receiver or its driver."""

    name: str
    role: Literal["customer", "driver"]
    phone: str


class AdminSupportRequestDetail(AdminSupportRequestRead):
    """``GET /admin/support-requests/{reference}``: the request plus ``contacts``."""

    contacts: list[SupportContactRead]


class AdminSupportRequestPage(BaseModel):
    """A page of admin support requests, open first, then newest first."""

    items: list[AdminSupportRequestRead]
    total: int
    limit: int
    offset: int


class SupportResolveRequest(BaseModel):
    """``POST /admin/support-requests/{reference}/resolve``. Unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    note: ResolutionNote
