"""Request, query and response models for the order endpoints (docs/api/orders.md).

Field rules come from the contract's "Field rules" table (FR-020, FR-021),
and the delivery details from docs/api/order-details-and-price.md
("Delivery details", agreed 2026-10-26, #21). Responses carry no price yet.
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
    KEKE_CAN_SIZES_LITRES,
    LANDMARK_MAX_LENGTH,
    DeliveryType,
    Order,
    OrderStatus,
    TankType,
    WaterSourcePreference,
)
from app.modules.orders.quantities import (
    MAX_ORDER_LITRES,
    MAX_ORDER_LOCAL_GALLONS,
    MIN_ORDER_LITRES,
    MIN_ORDER_LOCAL_GALLONS,
    litres_from_local_gallons,
)
from app.modules.orders.service import NewOrder, ReadLookups
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


class KekeDetails(BaseModel):
    """Keke details: jerrycans of 25 or 50 litres (design c-keke)."""

    model_config = ConfigDict(extra="forbid")

    can_size_litres: Literal[25, 50]
    can_count: Annotated[int, Field(strict=True, ge=1)]

    @field_validator("can_count")
    @classmethod
    def _quantity_in_range(cls, can_count: int, info: ValidationInfo) -> int:
        # FR-021: the order is size x count litres, at least 600. Any count
        # that reaches 600 L is accepted (decision 4); the client keeps its
        # presets. A missing size is reported on its own field.
        size = info.data.get("can_size_litres")
        if size in KEKE_CAN_SIZES_LITRES:
            litres = size * can_count
            if litres < MIN_ORDER_LITRES:
                raise ValueError(f"The order must be at least {MIN_ORDER_LITRES} litres")
            if litres > MAX_ORDER_LITRES:
                raise ValueError(f"The order must be at most {MAX_ORDER_LITRES} litres")
        return can_count


class TankerDetails(BaseModel):
    """Tanker details: the customer's tank and the quantity in local gallons."""

    model_config = ConfigDict(extra="forbid")

    #: Recorded for the driver only; no effect on price or vehicle (decision 5).
    tank_type: TankType
    #: 150-25,000 local gallons, so 600-100,000 litres (FR-021).
    quantity_local_gallons: QuantityLocalGallons


def details_problem(
    delivery_type: DeliveryType,
    keke: KekeDetails | None,
    tanker: TankerDetails | None,
    water_source: WaterSourcePreference | None,
) -> str | None:
    """Why a delivery details choice is inconsistent, or None (order details contract).

    Shared by ``OrderCreate`` and ``QuoteCreate`` (pricing), which accept the
    same choice.
    """
    if delivery_type is DeliveryType.KEKE:
        if keke is None or tanker is not None:
            return "A Keke order needs keke details and no tanker details"
        if water_source is not None:
            return "A Keke order has no water_source"
        return None
    if tanker is None or keke is not None:
        return "A Tanker order needs tanker details and no keke details"
    if water_source is None:
        return "A Tanker order needs a water_source"
    return None


def details_litres(keke: KekeDetails | None, tanker: TankerDetails | None) -> int:
    """The quantity the details give, in litres (FR-021): Keke size x count, Tanker gallons x 4."""
    if keke is not None:
        return keke.can_size_litres * keke.can_count
    if tanker is not None:
        return litres_from_local_gallons(tanker.quantity_local_gallons)
    raise ValueError("No delivery details")


class OrderCreate(BaseModel):
    """Body of ``POST /orders``, in one of two shapes.

    - **Delivery details** (order details contract): ``delivery_type`` with
      its ``keke`` or ``tanker`` details, and ``water_source`` for Tanker.
      The details are the single source of the quantity: the server
      converts it (Keke: size x count; Tanker: gallons x 4, FR-021).
    - **Quantity only** (the older shape, still accepted): exactly one of
      ``quantity_litres`` or ``quantity_local_gallons``.

    ``service_zone_id`` is the zone the customer picked (FR-020), in either
    shape. ``quote_id`` (details shape only) names the server quote the
    customer accepted; the server checks it and freezes it on the order
    (FR-024). Unknown fields (price, status, customer, ``is_simulated``, a
    category) are rejected: the server sets those.
    """

    model_config = ConfigDict(extra="forbid")

    idempotency_key: uuid.UUID
    quantity_litres: QuantityLitres | None = None
    quantity_local_gallons: QuantityLocalGallons | None = None
    delivery_type: DeliveryType | None = None
    keke: KekeDetails | None = None
    tanker: TankerDetails | None = None
    water_source: WaterSourcePreference | None = None
    service_zone_id: uuid.UUID | None = None
    quote_id: uuid.UUID | None = None
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
    def _one_shape(self) -> OrderCreate:
        quantity_given = self.quantity_litres is not None or self.quantity_local_gallons is not None
        if self.delivery_type is None:
            if self.keke or self.tanker or self.water_source or self.quote_id:
                raise ValueError("keke, tanker, water_source and quote_id need delivery_type")
            if (self.quantity_litres is None) == (self.quantity_local_gallons is None):
                raise ValueError("Give exactly one of quantity_litres or quantity_local_gallons")
            return self
        # The details are the single source of the quantity.
        if quantity_given:
            raise ValueError("With delivery_type, the quantity comes from keke or tanker only")
        problem = details_problem(self.delivery_type, self.keke, self.tanker, self.water_source)
        if problem:
            raise ValueError(problem)
        return self

    @property
    def litres(self) -> int:
        """The requested quantity in litres, converted exactly (FR-021)."""
        if self.delivery_type is not None:
            return details_litres(self.keke, self.tanker)
        if self.quantity_local_gallons is not None:
            return litres_from_local_gallons(self.quantity_local_gallons)
        # _one_shape guarantees quantity_litres is set here.
        return cast(int, self.quantity_litres)

    def to_new_order(self) -> NewOrder:
        """Convert to the service's input type, with the quantity in litres.

        Returns:
            The validated, normalized order details.
        """
        return NewOrder(
            **self.model_dump(
                exclude={"quantity_litres", "quantity_local_gallons", "keke", "tanker"}
            ),
            quantity_litres=self.litres,
            keke_can_size_litres=self.keke.can_size_litres if self.keke else None,
            keke_can_count=self.keke.can_count if self.keke else None,
            tanker_tank_type=self.tanker.tank_type if self.tanker else None,
            tanker_quantity_local_gallons=(
                self.tanker.quantity_local_gallons if self.tanker else None
            ),
        )


class KekeRead(BaseModel):
    """Keke details as sent."""

    can_size_litres: int
    can_count: int


class TankerRead(BaseModel):
    """Tanker details as sent; ``quantity_litres`` stays the stored value."""

    tank_type: TankType
    quantity_local_gallons: int


class ServiceZoneRef(BaseModel):
    """The zone sent with the order: its id and current name."""

    id: uuid.UUID
    name: str


class QuoteCategoryRead(BaseModel):
    """The category the customer accepted with the quote (FR-023)."""

    label: str
    supported_uses: str | None


class OrderQuoteRead(BaseModel):
    """The quote frozen on the order at creation (FR-024): total only (decision 6)."""

    currency: Literal["NGN"] = "NGN"
    total_minor_units: int
    water_category: QuoteCategoryRead


class OrderRead(BaseModel):
    """An order as its customer sees it (``OrderRead`` in the contract).

    Has no internal ID, customer ID or ``is_simulated``: customers never see
    them (BR-09). Build it with :meth:`from_order`, which needs the zone's
    name and the quote's summary from the pricing module
    (``orders.service.read_lookups``).

    Attributes:
        delivery_type, keke, tanker, water_source: As sent; ``null`` on
            orders created in the quantity-only shape (before #21).
        service_zone: The zone sent with the order, or ``null``.
        quote: The quote the order was placed with (FR-024), or ``null`` for
            a quote request. Never the breakdown (decision 6).
    """

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
    delivery_type: DeliveryType | None
    keke: KekeRead | None
    tanker: TankerRead | None
    water_source: WaterSourcePreference | None
    service_zone: ServiceZoneRef | None
    quote: OrderQuoteRead | None

    @classmethod
    def from_order(cls, order: Order, lookups: ReadLookups) -> OrderRead:
        """Build the customer view of an order.

        Args:
            order: The order.
            lookups: Zone names and quote summaries covering the order
                (``orders.service.read_lookups``).

        Returns:
            The customer representation.
        """
        zone_id = order.service_zone_id
        summary = lookups.quotes.get(order.quote_id) if order.quote_id is not None else None
        return cls(
            reference=order.reference,
            status=order.status,
            quantity_litres=order.quantity_litres,
            contact_name=order.contact_name,
            contact_phone=order.contact_phone,
            delivery_address=order.delivery_address,
            landmark=order.landmark,
            delivery_instructions=order.delivery_instructions,
            preferred_delivery_date=order.preferred_delivery_date,
            created_at=order.created_at,
            updated_at=order.updated_at,
            delivery_type=order.delivery_type,
            keke=(
                KekeRead(can_size_litres=order.keke_can_size_litres, can_count=order.keke_can_count)
                if order.keke_can_size_litres is not None and order.keke_can_count is not None
                else None
            ),
            tanker=(
                TankerRead(
                    tank_type=order.tanker_tank_type,
                    quantity_local_gallons=order.tanker_quantity_local_gallons,
                )
                if order.tanker_tank_type is not None
                and order.tanker_quantity_local_gallons is not None
                else None
            ),
            water_source=order.water_source,
            service_zone=(
                ServiceZoneRef(id=zone_id, name=lookups.zone_names[zone_id])
                if zone_id is not None and zone_id in lookups.zone_names
                else None
            ),
            quote=(
                OrderQuoteRead(
                    total_minor_units=summary.total_minor_units,
                    water_category=QuoteCategoryRead(
                        label=summary.water_category_label,
                        supported_uses=summary.supported_uses,
                    ),
                )
                if summary is not None
                else None
            ),
        )


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
    def from_order(  # type: ignore[override]
        cls,
        order: Order,
        customer: User,
        hold: OrderHoldRead | None = None,
        *,
        lookups: ReadLookups,
    ) -> AdminOrderRead:
        """Build the staff view of an order.

        Args:
            order: The order.
            customer: The account that placed it.
            hold: The open hold on its current job, if any.
            lookups: Zone names and quote summaries covering the order.

        Returns:
            The admin representation.
        """
        return cls(
            **OrderRead.from_order(order, lookups).model_dump(),
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
