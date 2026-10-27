"""Vehicle capacity for pricing: which vehicles can carry an order (FR-013).

Kept apart from :mod:`app.modules.dispatch.service`, which imports the orders
module, so the quote (pricing module, #21) can ask about vehicles without an
import cycle. Only the dispatch models are read here.
"""

import math
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dispatch.models import VehicleProfile

#: FR-013: a vehicle makes at most two trips per order.
MAX_TRIPS_PER_ORDER = 2


@dataclass(frozen=True)
class VehiclePlan:
    """How an order would be carried: one vehicle profile and its trips."""

    vehicle_profile_id: uuid.UUID
    safe_payload_litres: int
    trips: int


async def plan_for(session: AsyncSession, *, litres: int) -> VehiclePlan | None:
    """Find a configured vehicle that can carry ``litres`` in at most two trips.

    FR-013: trips = quantity / the vehicle's verified safe payload, rounded
    up; at most two per vehicle per order; a load never exceeds the verified
    payload (BR-03). Only active vehicle profiles count.

    Decided for #21 (technical lead, 2026-10-26, decision D): vehicle
    profiles do not record Keke or Tanker yet, so **any** active vehicle
    counts. Among those that can, the plan with the fewest trips is chosen,
    then the smallest such vehicle, so the plan never assumes a bigger
    vehicle than needed.

    Args:
        session: Database session.
        litres: The order quantity in whole litres.

    Returns:
        The plan, or ``None`` when no vehicle can carry it (the quote becomes
        ``manual_quote_required`` / ``no_vehicle_plan``, FR-021, T-03).
    """
    payloads = await session.execute(
        select(VehicleProfile.id, VehicleProfile.safe_payload_litres).where(
            VehicleProfile.is_active.is_(True)
        )
    )
    plans = [
        VehiclePlan(vehicle_id, payload, math.ceil(litres / payload))
        for vehicle_id, payload in payloads
        if payload > 0 and math.ceil(litres / payload) <= MAX_TRIPS_PER_ORDER
    ]
    if not plans:
        return None
    return min(
        plans, key=lambda plan: (plan.trips, plan.safe_payload_litres, str(plan.vehicle_profile_id))
    )
