"""Request, query and response models for the order endpoints (docs/api/orders.md).

Field rules come from the contract's "Field rules" table (FR-020, FR-021).
Responses carry no price: orders are still price-less requests (FR-021,
FR-022).
"""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal, cast

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.modules.auth.models import User
from app.modules.orders.models import (
    CONTACT_NAME_MAX_LENGTH,
    DELIVERY_ADDRESS_MAX_LENGTH,
    DELIVERY_INSTRUCTIONS_MAX_LENGTH,
    LANDMARK_MAX_LENGTH,
    Order,
    OrderStatus,
)
from app.modules.orders.quantities import (
    MAX_ORDER_LITRES,
    MAX_ORDER_LOCAL_GALLONS,
    MIN_ORDER_LITRES,
    MIN_ORDER_LOCAL_GALLONS,
    litres_from_local_gallons,
)
from app.modules.orders.service import NewOrder
from app.shared import lagos_time
from app.shared.phone import normalize_nigerian_phone

DELIVERY_ADDRESS_MIN_LENGTH = 5
PAGE_LIMIT_DEFAULT = 50
PAGE_LIMIT_MAX = 100


def _blank_to_none(value: str) -> str | None:
    # An optional field left as spaces means "not given", so it is stored as
    # null rather than an empty string.
    return value or None


# strict=True rejects JSON strings ("600"), floats (600.0) and booleans, so a
# client bug cannot silently become a valid quantity. Both units have the same
# 600-100000 litre range (FR-021).
QuantityLitres = Annotated[int, Field(strict=True, ge=MIN_ORDER_LITRES, le=MAX_ORDER_LITRES)]
QuantityLocalGallons = Annotated[
    int, Field(strict=True, ge=MIN_ORDER_LOCAL_GALLONS, le=MAX_ORDER_LOCAL_GALLONS)
]
ContactName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=CONTACT_NAME_MAX_LENGTH),
]
ContactPhone = Annotated[str, Field(max_length=32), AfterValidator(normalize_nigerian_phone)]
DeliveryAddress = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=DELIVERY_ADDRESS_MIN_LENGTH,
        max_length=DELIVERY_ADDRESS_MAX_LENGTH,
    ),
]
Landmark = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=LANDMARK_MAX_LENGTH),
    AfterValidator(_blank_to_none),
]
DeliveryInstructions = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=DELIVERY_INSTRUCTIONS_MAX_LENGTH),
    AfterValidator(_blank_to_none),
]


class OrderCreate(BaseModel):
    """Body of ``POST /orders``.

    The quantity is given in exactly one unit: ``quantity_litres`` or
    ``quantity_local_gallons`` (FR-021). The server converts gallons to
    litres; the order stores litres only.

    Unknown fields (price, status, customer, ``is_simulated``) are rejected:
    the server sets those.
    """

    model_config = ConfigDict(extra="forbid")

    idempotency_key: uuid.UUID
    quantity_litres: QuantityLitres | None = None
    quantity_local_gallons: QuantityLocalGallons | None = None
    contact_name: ContactName
    contact_phone: ContactPhone
    delivery_address: DeliveryAddress
    landmark: Landmark | None = None
    delivery_instructions: DeliveryInstructions | None = None
    preferred_delivery_date: date | None = None

    @field_validator("preferred_delivery_date")
    @classmethod
    def _not_in_the_past(cls, value: date | None) -> date | None:
        # "Today or later in Africa/Lagos" (contract field rules). A
        # preference only; it does not reserve a slot (FR-025).
        if value is not None and value < lagos_time.lagos_today():
            raise ValueError("Choose today or a later date")
        return value

    @model_validator(mode="after")
    def _exactly_one_quantity(self) -> OrderCreate:
        if (self.quantity_litres is None) == (self.quantity_local_gallons is None):
            raise ValueError("Give exactly one of quantity_litres or quantity_local_gallons")
        return self

    @property
    def litres(self) -> int:
        """The requested quantity in litres, converted from gallons if needed."""
        if self.quantity_local_gallons is not None:
            return litres_from_local_gallons(self.quantity_local_gallons)
        # _exactly_one_quantity guarantees quantity_litres is set here.
        return cast(int, self.quantity_litres)

    def to_new_order(self) -> NewOrder:
        """Convert to the service's input type, with the quantity in litres.

        Returns:
            The validated, normalized order details.
        """
        return NewOrder(
            **self.model_dump(exclude={"quantity_litres", "quantity_local_gallons"}),
            quantity_litres=self.litres,
        )


class OrderRead(BaseModel):
    """An order as its customer sees it (``OrderRead`` in the contract).

    Has no internal ID, customer ID or ``is_simulated``: customers never see
    them (BR-09).
    """

    model_config = ConfigDict(from_attributes=True)

    reference: str
    status: OrderStatus
    quantity_litres: int
    contact_name: str
    contact_phone: str
    delivery_address: str
    landmark: str | None
    delivery_instructions: str | None
    preferred_delivery_date: date | None
    created_at: datetime
    updated_at: datetime


class OrderCustomer(BaseModel):
    """The ordering customer's account, shown to staff.

    Attributes:
        phone_verified: Whether the customer verified the phone by SMS code
            (FR-003). Demo accounts are marked verified by the seed.
    """

    id: uuid.UUID
    name: str
    phone: str
    phone_verified: bool


# Hold kinds as the API names them. The deliveries module owns holds and
# their enumeration (``HoldKind``); orders cannot import it (deliveries
# depends on orders), so the values are repeated here and a test keeps the
# two equal.
HoldKindName = Literal["source_review", "unsafe_stop", "proof_review"]


class OrderHoldRead(BaseModel):
    """The open hold on an order's current job (admin hold review, R0).

    Attributes:
        id: The hold's id, sent back with a decision.
        kind: Proof review, source review or unsafe stop.
        since: When it opened (UTC).
    """

    id: uuid.UUID
    kind: HoldKindName
    since: datetime


class AdminOrderRead(OrderRead):
    """An order as staff see it: the customer view plus internal fields.

    Attributes:
        hold: The open hold on the order's current job, or null. Set by the
            deliveries module, which owns holds; an order that can be offered
            to a driver (``confirmed``) never has one, because holds close
            when a job ends.
    """

    id: uuid.UUID
    customer: OrderCustomer
    is_simulated: bool
    hold: OrderHoldRead | None = None

    @classmethod
    def from_order(
        cls, order: Order, customer: User, hold: OrderHoldRead | None = None
    ) -> AdminOrderRead:
        """Build the staff view of an order.

        Args:
            order: The order.
            customer: The account that placed it.
            hold: The open hold on its current job, if any.

        Returns:
            The admin representation.
        """
        return cls(
            **OrderRead.model_validate(order).model_dump(),
            id=order.id,
            customer=OrderCustomer(
                id=customer.id,
                name=customer.name,
                phone=customer.phone,
                phone_verified=customer.phone_verified_at is not None,
            ),
            is_simulated=order.is_simulated,
            hold=hold,
        )


class OrderPage(BaseModel):
    """A page of the customer's own orders (shared page shape, docs/api/README.md)."""

    items: list[OrderRead]
    total: int
    limit: int
    offset: int


class AdminOrderPage(BaseModel):
    """A page of orders for staff."""

    items: list[AdminOrderRead]
    total: int
    limit: int
    offset: int


class PageParams(BaseModel):
    """``limit`` (1-100, default 50) and ``offset`` (0 or more) query parameters."""

    limit: int = Field(PAGE_LIMIT_DEFAULT, ge=1, le=PAGE_LIMIT_MAX)
    offset: int = Field(0, ge=0)


class AdminOrderFilters(PageParams):
    """Query parameters of ``GET /admin/orders``.

    Attributes:
        status: Statuses to include; repeat the parameter for several. Empty
            means all statuses.
        created_from: First creation date to include (Africa/Lagos).
        created_to: Last creation date to include (Africa/Lagos).
        is_simulated: True for demo records only, false for real orders only,
            omitted for both (BR-09).
    """

    status: list[OrderStatus] = []
    created_from: date | None = None
    created_to: date | None = None
    is_simulated: bool | None = None

    @field_validator("created_to")
    @classmethod
    def _range_not_reversed(cls, value: date | None, info: ValidationInfo) -> date | None:
        created_from = info.data.get("created_from")
        if value is not None and created_from is not None and value < created_from:
            raise ValueError("created_to must be on or after created_from")
        return value
