"""Service zone request and response bodies (docs/api/admin-directory.md).

Agreed 2026-10-26 for #30 (PR #38, PR #41). Coordinates are WGS 84 decimal
degrees (SRID 4326); a boundary is a GeoJSON ``Polygon`` whose positions are
``[longitude, latitude]``. Fees are integer kobo (``*_minor_units``, SRS §5).
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.modules.pricing.models import ZONE_NAME_MAX_LENGTH, ZONE_NAME_MIN_LENGTH
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
    """Body of ``GET /admin/service-zones``: every zone, by name."""

    items: list[ServiceZoneRead]


class ServiceZoneOption(BaseModel):
    """A zone someone can pick: ``id`` and ``name`` only (no fees, no geometry)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ServiceZoneOptionList(BaseModel):
    """Body of ``GET /service-zones``: active zones only, by name."""

    items: list[ServiceZoneOption]
