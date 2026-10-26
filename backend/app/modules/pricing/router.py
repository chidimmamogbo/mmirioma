"""Service zone and price list endpoints (docs/api/admin-directory.md).

"Service zones" (agreed 2026-10-26 for #30, PR #38, PR #41) and "Price
lists" (agreed 2026-10-26, #37). The admin endpoints use
``CurrentAdmin``, so every other role gets 403 ``forbidden`` (FR-001); their
writes also need the CSRF header, which the auth dependency enforces.
``GET /service-zones`` needs **no session**: partner sign-up lists the zones
before an account exists, and it returns only active zone ids and names.
Handlers only translate between HTTP and :mod:`app.modules.pricing.service`
or :mod:`app.modules.pricing.price_lists`.
"""

import uuid
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.pricing import price_lists, service
from app.modules.pricing.schemas import (
    PriceListCreate,
    PriceListPage,
    PriceListPageParams,
    PriceListRead,
    ServiceZoneCreate,
    ServiceZoneList,
    ServiceZoneOption,
    ServiceZoneOptionList,
    ServiceZoneRead,
    ServiceZoneUpdate,
)

router = APIRouter(tags=["pricing"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_ADMIN_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}
_WRITE_ERRORS: dict[int | str, dict[str, object]] = {
    **_ADMIN_ERRORS,
    HTTPStatus.NOT_FOUND: {"model": ErrorResponse},
    HTTPStatus.CONFLICT: {"model": ErrorResponse},
}


@router.get("/admin/service-zones", responses=_ADMIN_ERRORS)
async def list_zones(admin: CurrentAdmin, db: DbSession) -> ServiceZoneList:
    """Every zone, active or not, by name, with its fees (no pagination)."""
    views = await service.list_zones(db)
    return ServiceZoneList(items=[ServiceZoneRead.from_view(view) for view in views])


@router.post("/admin/service-zones", status_code=HTTPStatus.CREATED, responses=_WRITE_ERRORS)
async def create_zone(
    body: ServiceZoneCreate, admin: CurrentAdmin, db: DbSession
) -> ServiceZoneRead:
    """Create a zone with its fees (FR-010).

    Raises:
        APIError: 404 ``water_category_not_found``; 409
            ``service_zone_name_taken``; 422 ``validation_error``.
    """
    view = await service.create_zone(db, actor=admin, data=body.to_data())
    return ServiceZoneRead.from_view(view)


@router.patch("/admin/service-zones/{zone_id}", responses=_WRITE_ERRORS)
async def update_zone(
    zone_id: uuid.UUID, body: ServiceZoneUpdate, admin: CurrentAdmin, db: DbSession
) -> ServiceZoneRead:
    """Change the fields sent; ``null`` clears the boundary.

    Raises:
        APIError: 404 ``service_zone_not_found`` or
            ``water_category_not_found``; 409 ``service_zone_name_taken``;
            422 ``validation_error``.
    """
    view = await service.update_zone(db, actor=admin, zone_id=zone_id, update=body.to_update())
    return ServiceZoneRead.from_view(view)


@router.get("/service-zones")
async def list_zone_options(db: DbSession) -> ServiceZoneOptionList:
    """Active zones to pick from (FR-020): ``id`` and ``name`` only, by name."""
    zones = await service.list_active_zones(db)
    return ServiceZoneOptionList(items=[ServiceZoneOption.model_validate(z) for z in zones])


# --- Price lists (#37) ----------------------------------------------------------------


@router.get("/admin/price-lists", responses=_ADMIN_ERRORS)
async def list_price_lists(
    page: Annotated[PriceListPageParams, Query()], admin: CurrentAdmin, db: DbSession
) -> PriceListPage:
    """Saved price lists, newest first (shared page shape)."""
    views, total = await price_lists.list_price_lists(db, limit=page.limit, offset=page.offset)
    return PriceListPage(
        items=[PriceListRead.from_view(view) for view in views],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get(
    "/admin/price-lists/current",
    responses={**_ADMIN_ERRORS, HTTPStatus.NOT_FOUND: {"model": ErrorResponse}},
)
async def current_price_list(admin: CurrentAdmin, db: DbSession) -> PriceListRead:
    """The price list new quotes use.

    Raises:
        APIError: 404 ``price_list_not_found`` before the first save.
    """
    return PriceListRead.from_view(await price_lists.current_price_list(db))


@router.post(
    "/admin/price-lists",
    status_code=HTTPStatus.CREATED,
    responses={**_WRITE_ERRORS, HTTPStatus.UNPROCESSABLE_ENTITY: {"model": ErrorResponse}},
)
async def save_price_list(
    body: PriceListCreate, admin: CurrentAdmin, db: DbSession
) -> PriceListRead:
    """Save a new version from the whole set of rules; it takes effect at once.

    Raises:
        APIError: 404 ``service_zone_not_found`` or ``water_category_not_found``;
            409 ``price_list_changed`` or ``price_list_unchanged``; 422
            ``price_rules_overlap`` or ``validation_error``.
    """
    view = await price_lists.save_price_list(
        db,
        actor=admin,
        base_version=body.base_version,
        reason=body.reason,
        rules=[rule.to_input() for rule in body.rules],
    )
    return PriceListRead.from_view(view)
