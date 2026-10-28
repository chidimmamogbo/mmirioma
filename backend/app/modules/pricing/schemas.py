"""Service zone, price list and quote request and response bodies.

Zones and price lists: docs/api/admin-directory.md, agreed 2026-10-26 for
#30 (PR #38, PR #41) and #37. Quotes: docs/api/order-details-and-price.md
(``POST /quotes``, agreed 2026-10-26, #42). Coordinates are WGS 84 decimal
degrees (SRID 4326); a boundary is a GeoJSON ``Polygon`` whose positions are
``[longitude, latitude]``. Fees are integer kobo (``*_minor_units``, SRS §5).
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.modules.orders.models import DeliveryType, WaterSourcePreference
from app.modules.orders.schemas import (
    DeliveryAddress,
    KekeDetails,
    TankerDetails,
    details_litres,
    details_problem,
)
from app.modules.pricing import quotes
from app.modules.pricing.models import (
    MAX_MARGIN_BASIS_POINTS,
    MIN_BAND_LITRES,
    PRICE_LIST_REASON_MAX_LENGTH,
    ZONE_NAME_MAX_LENGTH,
    ZONE_NAME_MIN_LENGTH,
    MarginType,
)
from app.modules.pricing.price_lists import PriceListView, RuleInput
from app.modules.pricing.service import (
    Coordinates,
    FeeInput,
    Position,
    ZoneData,
    ZoneUpdate,
    ZoneView,
)

ZoneName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=ZONE_NAME_MIN_LENGTH, max_length=ZONE_NAME_MAX_LENGTH
    ),
]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
#: ``[longitude, latitude]``; the ranges are checked with the ring.
GeoJsonPosition = Annotated[
    list[Annotated[float, Field(allow_inf_nan=False)]], Field(min_length=2, max_length=2)
]
#: Kobo, 0 or more. The upper bound is the BIGINT column's range, not a
#: business limit (the contract sets none).
FeeMinorUnits = Annotated[int, Field(strict=True, ge=0, le=2**63 - 1)]
#: Fees per zone: one per water category; the bound only stops abuse.
MAX_FEES = 50


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Requests -------------------------------------------------------------------------


class CentreWrite(_Request):
    """The zone's coordinates (FR-010): only the normal ranges are checked."""

    latitude: Latitude
    longitude: Longitude


class BoundaryWrite(_Request):
    """A GeoJSON ``Polygon`` with one closed outer ring (FR-010).

    The contract asks for "a closed ring of at least 4 positions", so holes
    (more rings) are refused. PostGIS checks the rest, such as crossing
    edges, in the service.
    """

    type: Literal["Polygon"]
    coordinates: Annotated[list[list[GeoJsonPosition]], Field(min_length=1, max_length=1)]

    @field_validator("coordinates")
    @classmethod
    def _closed_ring_in_range(cls, rings: list[list[list[float]]]) -> list[list[list[float]]]:
        ring = rings[0]
        if len(ring) < 4:
            raise ValueError("A boundary ring needs at least 4 positions")
        if ring[0] != ring[-1]:
            raise ValueError("A boundary ring must end where it starts")
        for longitude, latitude in ring:
            if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
                raise ValueError("Each position is [longitude, latitude] within range")
        return rings

    def ring(self) -> list[Position]:
        """The outer ring as ``(longitude, latitude)`` tuples."""
        return [(longitude, latitude) for longitude, latitude in self.coordinates[0]]


class FeeWrite(_Request):
    """One delivery fee: per order, for one water category (decision 13)."""

    water_category_id: uuid.UUID
    fee_minor_units: FeeMinorUnits


Fees = Annotated[list[FeeWrite], Field(max_length=MAX_FEES)]


def _distinct_categories(fees: list[FeeWrite] | None) -> list[FeeWrite] | None:
    if fees is not None and len({fee.water_category_id for fee in fees}) != len(fees):
        raise ValueError("Each water category can have only one fee")
    return fees


def _fee_inputs(fees: list[FeeWrite]) -> list[FeeInput]:
    return [FeeInput(fee.water_category_id, fee.fee_minor_units) for fee in fees]


def _coordinates(centre: CentreWrite) -> Coordinates:
    return Coordinates(latitude=centre.latitude, longitude=centre.longitude)


class ServiceZoneCreate(_Request):
    """Body of ``POST /admin/service-zones`` (``ServiceZoneWrite``).

    ``boundary`` may be ``null`` or omitted; ``fallback_delivery_fees`` may
    be omitted (no fees).
    """

    name: ZoneName
    is_active: bool
    centre: CentreWrite
    boundary: BoundaryWrite | None = None
    fallback_delivery_fees: Fees = []

    _fees_distinct = field_validator("fallback_delivery_fees")(_distinct_categories)

    def to_data(self) -> ZoneData:
        """The service's input."""
        return ZoneData(
            name=self.name,
            is_active=self.is_active,
            centre=_coordinates(self.centre),
            boundary=self.boundary.ring() if self.boundary else None,
            fees=_fee_inputs(self.fallback_delivery_fees),
        )


class ServiceZoneUpdate(_Request):
    """Body of ``PATCH /admin/service-zones/{id}``: every field optional.

    An absent field is unchanged. ``null`` clears ``boundary`` only; the
    other fields cannot be ``null``. A sent ``fallback_delivery_fees``
    replaces the whole list.
    """

    name: ZoneName | None = None
    is_active: bool | None = None
    centre: CentreWrite | None = None
    boundary: BoundaryWrite | None = None
    fallback_delivery_fees: Fees | None = None

    _fees_distinct = field_validator("fallback_delivery_fees")(_distinct_categories)

    @model_validator(mode="after")
    def _only_boundary_may_be_null(self) -> Self:
        for field in ("name", "is_active", "centre", "fallback_delivery_fees"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

    def to_update(self) -> ZoneUpdate:
        """The service's input, naming the fields that were sent."""
        sent = {"fees" if f == "fallback_delivery_fees" else f for f in self.model_fields_set}
        return ZoneUpdate(
            sent=frozenset(sent),
            name=self.name,
            is_active=self.is_active,
            centre=_coordinates(self.centre) if self.centre else None,
            boundary=self.boundary.ring() if self.boundary else None,
            fees=(
                _fee_inputs(self.fallback_delivery_fees)
                if self.fallback_delivery_fees is not None
                else None
            ),
        )


# --- Responses ------------------------------------------------------------------------


class WaterCategoryRef(BaseModel):
    """A water category's id and current label (FR-014)."""

    id: uuid.UUID
    label: str


class AdminWaterCategory(BaseModel):
    """A water category in the admin list: no ``code``, no description, no price."""

    id: uuid.UUID
    label: str
    is_active: bool


class AdminWaterCategoryList(BaseModel):
    """Body of ``GET /admin/water-categories``: every category, by label (#160)."""

    items: list[AdminWaterCategory]


class FeeRead(BaseModel):
    """A zone's delivery fee for one category, per order."""

    water_category: WaterCategoryRef
    fee_minor_units: int


class CentreRead(BaseModel):
    """WGS 84 decimal degrees."""

    latitude: float
    longitude: float


class BoundaryRead(BaseModel):
    """GeoJSON ``Polygon``: one ring of ``[longitude, latitude]`` positions."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[list[float]]]


class ServiceZoneRead(BaseModel):
    """``ServiceZone``: what administrators see (fees included)."""

    id: uuid.UUID
    name: str
    is_active: bool
    centre: CentreRead
    boundary: BoundaryRead | None
    fallback_delivery_fees: list[FeeRead]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_view(cls, view: ZoneView) -> Self:
        """Build the response from the service's view of a zone."""
        return cls(
            id=view.zone.id,
            name=view.zone.name,
            is_active=view.zone.is_active,
            centre=CentreRead(latitude=view.centre.latitude, longitude=view.centre.longitude),
            boundary=(
                BoundaryRead(coordinates=[[[lon, lat] for lon, lat in view.boundary]])
                if view.boundary is not None
                else None
            ),
            fallback_delivery_fees=[
                FeeRead(
                    water_category=WaterCategoryRef(
                        id=fee.water_category_id, label=fee.water_category_label
                    ),
                    fee_minor_units=fee.fee_minor_units,
                )
                for fee in view.fees
            ],
            created_at=view.zone.created_at,
            updated_at=view.zone.updated_at,
        )


class ServiceZoneList(BaseModel):
    """Body of ``GET /admin/service-zones``: every zone, by name.

    ``pilot_water_category`` is the category whose fee the Service areas screen
    edits (amendment #74), or ``None`` when no category has the configured code.
    """

    items: list[ServiceZoneRead]
    pilot_water_category: WaterCategoryRef | None


class ServiceZoneOption(BaseModel):
    """A zone someone can pick: ``id`` and ``name`` only (no fees, no geometry)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ServiceZoneOptionList(BaseModel):
    """Body of ``GET /service-zones``: active zones only, by name."""

    items: list[ServiceZoneOption]


# --- Price lists (#37) ----------------------------------------------------------------

#: Litres are whole numbers; the upper bound is the INTEGER column's range, not a business limit.
Litres = Annotated[int, Field(strict=True, ge=MIN_BAND_LITRES, le=1_000_000_000)]
#: Rules per price list; the bound only stops abuse.
MAX_RULES = 100
PAGE_LIMIT_DEFAULT = 50
PAGE_LIMIT_MAX = 100


class FixedMarginWrite(_Request):
    """A fixed MmiriOma margin in kobo per order (FR-022)."""

    type: Literal["fixed"]
    amount_minor_units: FeeMinorUnits


class PercentageMarginWrite(_Request):
    """A percentage margin of water + delivery + handling, in basis points (1 % = 100)."""

    type: Literal["percentage"]
    basis_points: Annotated[int, Field(strict=True, ge=0, le=MAX_MARGIN_BASIS_POINTS)]


MarginWrite = Annotated[FixedMarginWrite | PercentageMarginWrite, Field(discriminator="type")]


class PriceRuleWrite(_Request):
    """One rule of ``PriceListCreate`` (the contract's rule without ``id``)."""

    zone_id: uuid.UUID | None
    water_category_id: uuid.UUID | None
    min_litres: Litres
    max_litres: Litres | None
    base_delivery_fee_minor_units: FeeMinorUnits
    distance_rate_minor_units_per_km: FeeMinorUnits
    additional_trip_minor_units: FeeMinorUnits
    handling_minor_units: FeeMinorUnits
    margin: MarginWrite

    @model_validator(mode="after")
    def _band_in_order(self) -> Self:
        if self.max_litres is not None and self.max_litres < self.min_litres:
            raise ValueError("max_litres must be at least min_litres")
        return self

    def to_input(self) -> RuleInput:
        """The service's input."""
        fixed = isinstance(self.margin, FixedMarginWrite)
        return RuleInput(
            zone_id=self.zone_id,
            water_category_id=self.water_category_id,
            min_litres=self.min_litres,
            max_litres=self.max_litres,
            base_delivery_fee_minor_units=self.base_delivery_fee_minor_units,
            distance_rate_minor_units_per_km=self.distance_rate_minor_units_per_km,
            additional_trip_minor_units=self.additional_trip_minor_units,
            handling_minor_units=self.handling_minor_units,
            margin_type=MarginType.FIXED if fixed else MarginType.PERCENTAGE,
            margin_amount_minor_units=self.margin.amount_minor_units
            if isinstance(self.margin, FixedMarginWrite)
            else None,
            margin_basis_points=self.margin.basis_points
            if isinstance(self.margin, PercentageMarginWrite)
            else None,
        )


class PriceListCreate(_Request):
    """Body of ``POST /admin/price-lists``: the whole new set of rules.

    ``base_version`` is required (``null`` only for the first list), so a
    client cannot save over a version it did not see.
    """

    base_version: Annotated[int, Field(strict=True, ge=1)] | None
    reason: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, max_length=PRICE_LIST_REASON_MAX_LENGTH)
        ]
        | None
    ) = None
    rules: Annotated[list[PriceRuleWrite], Field(min_length=1, max_length=MAX_RULES)]

    @field_validator("reason")
    @classmethod
    def _blank_reason_is_none(cls, reason: str | None) -> str | None:
        return reason or None


class PriceListPageParams(BaseModel):
    """``limit`` (1-100, default 50) and ``offset`` query parameters."""

    limit: int = Field(PAGE_LIMIT_DEFAULT, ge=1, le=PAGE_LIMIT_MAX)
    offset: int = Field(0, ge=0)


class PersonRead(BaseModel):
    """An administrator's id and name."""

    id: uuid.UUID
    name: str


class PriceRuleRead(BaseModel):
    """A saved rule (the contract's ``rules[]``)."""

    id: uuid.UUID
    zone_id: uuid.UUID | None
    water_category_id: uuid.UUID | None
    min_litres: int
    max_litres: int | None
    base_delivery_fee_minor_units: int
    distance_rate_minor_units_per_km: int
    additional_trip_minor_units: int
    handling_minor_units: int
    margin: dict[str, Any]


class PriceChangeRead(BaseModel):
    """One changed field from the previous version; ``from`` is ``null`` for an added rule."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    path: str
    from_: Any = Field(alias="from")
    to: Any


class PriceListRead(BaseModel):
    """``PriceList``: one saved version."""

    version: int
    effective_from: datetime
    created_by: PersonRead
    reason: str | None
    rules: list[PriceRuleRead]
    changes: list[PriceChangeRead]

    @classmethod
    def from_view(cls, view: PriceListView) -> Self:
        """Build the response from the service's view of a version."""
        return cls(
            version=view.version.version,
            effective_from=view.version.effective_from,
            created_by=PersonRead(id=view.created_by.id, name=view.created_by.name),
            reason=view.version.reason,
            rules=[
                PriceRuleRead(
                    id=rule.id,
                    zone_id=rule.zone_id,
                    water_category_id=rule.water_category_id,
                    min_litres=rule.min_litres,
                    max_litres=rule.max_litres,
                    base_delivery_fee_minor_units=rule.base_delivery_fee_minor_units,
                    distance_rate_minor_units_per_km=rule.distance_rate_minor_units_per_km,
                    additional_trip_minor_units=rule.additional_trip_minor_units,
                    handling_minor_units=rule.handling_minor_units,
                    margin=(
                        {"type": "fixed", "amount_minor_units": rule.margin_amount_minor_units}
                        if rule.margin_type == MarginType.FIXED
                        else {"type": "percentage", "basis_points": rule.margin_basis_points}
                    ),
                )
                for rule in view.rules
            ],
            changes=[PriceChangeRead.model_validate(change) for change in view.version.changes],
        )


class PriceListPage(BaseModel):
    """A page of price lists, newest first (shared page shape)."""

    items: list[PriceListRead]
    total: int
    limit: int
    offset: int


# --- Quotes (#21) ----------------------------------------------------------------------


class QuoteCreate(_Request):
    """Body of ``POST /quotes``: the choice to price (order details contract).

    The same delivery details as ``OrderCreate``, with the address required:
    there is no price without it (#42). There is no category field: the
    server prices the pilot category, and an unknown field (such as
    ``water_category_id``) is 422, so a client cannot believe it chose one.
    """

    delivery_type: DeliveryType
    keke: KekeDetails | None = None
    tanker: TankerDetails | None = None
    water_source: WaterSourcePreference | None = None
    delivery_address: DeliveryAddress
    service_zone_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        problem = details_problem(self.delivery_type, self.keke, self.tanker, self.water_source)
        if problem:
            raise ValueError(problem)
        return self

    def to_choice(self) -> quotes.Choice:
        """Convert to the service's input, with the quantity in litres (FR-021)."""
        return quotes.Choice(
            delivery_type=str(self.delivery_type),
            keke_can_size_litres=self.keke.can_size_litres if self.keke else None,
            keke_can_count=self.keke.can_count if self.keke else None,
            tanker_tank_type=str(self.tanker.tank_type) if self.tanker else None,
            tanker_quantity_local_gallons=(
                self.tanker.quantity_local_gallons if self.tanker else None
            ),
            water_source=str(self.water_source) if self.water_source else None,
            quantity_litres=details_litres(self.keke, self.tanker),
            delivery_address=self.delivery_address,
            service_zone_id=self.service_zone_id,
        )


class QuoteCategory(BaseModel):
    """The pilot category's label and supported uses (FR-023)."""

    label: str
    supported_uses: str | None


class QuoteAvailable(BaseModel):
    """A server price: the payable total only (decision 6), valid until a time."""

    status: Literal["quote_available"] = "quote_available"
    quote_id: uuid.UUID
    currency: Literal["NGN"] = "NGN"
    quantity_litres: int
    water_category: QuoteCategory
    #: Kobo, a whole number of naira (rounded up, decision C).
    total_minor_units: int
    price_valid_until: datetime


class QuoteManual(BaseModel):
    """No reliable price (SRS §6): the reason code, never a number."""

    status: Literal["manual_quote_required"] = "manual_quote_required"
    quote_id: None = None
    quantity_litres: int
    reason: quotes.ManualReason


QuoteRead = Annotated[QuoteAvailable | QuoteManual, Field(discriminator="status")]


def quote_read(answer: quotes.QuoteAnswer) -> QuoteAvailable | QuoteManual:
    """Shape the service's answer for the customer: total only, never the components."""
    if answer.reason is not None:
        return QuoteManual(quantity_litres=answer.quantity_litres, reason=answer.reason)
    if answer.quote is None or answer.category is None:
        raise ValueError("A quote answer without a reason must carry the quote")
    return QuoteAvailable(
        quote_id=answer.quote.id,
        quantity_litres=answer.quantity_litres,
        water_category=QuoteCategory(
            label=answer.quote.water_category_label,
            supported_uses=answer.category.supported_uses,
        ),
        total_minor_units=answer.quote.total_minor_units,
        price_valid_until=answer.quote.price_valid_until,
    )
