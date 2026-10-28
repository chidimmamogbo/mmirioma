/**
 * Admin service area adapters (#74, #110): the real-API side of `listAreas` and
 * `saveArea` in `adminApi.ts`, converting with docs/api/admin-directory.md,
 * "Service zones" (mapping table).
 *
 * The screen still has its pre-Z4 fields, so only what the contract can carry
 * is linked:
 *
 * - `station_id` and `distance_km` have no source and are always `null`.
 * - The fee is the pilot water category's entry in the zone's
 *   `fallback_delivery_fees`, or `null` when the zone has none. The category
 *   comes from `pilot_water_category` in the zone list (#109). Saving writes
 *   that one entry and keeps the others. When the server names no pilot
 *   category, the fee reads as `null` and writing one is not connected.
 * - Adding an area needs the zone's coordinates, which the screen cannot enter
 *   until the Z4 screen change, so it is not connected either.
 *
 * Nothing is guessed: a value the server does not give stays empty.
 */
import type { ServiceArea } from '../../../domain/admin'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { notConnected } from '../../../lib/api/notConnected'
import { listAdminServiceZones, updateAdminServiceZone, type ServiceZone, type ServiceZoneUpdate } from '../../../lib/api/serviceZones'

/** The pilot category's fee for a zone in kobo, or `null` when the zone has none or the server names no pilot category. */
function pilotFee(zone: ServiceZone, pilotCategoryId: string | null): number | null {
  if (pilotCategoryId === null) return null
  return zone.fallback_delivery_fees.find((fee) => fee.water_category.id === pilotCategoryId)?.fee_minor_units ?? null
}

/** Backend zone to the design's service area. */
export function serviceAreaFromZone(zone: ServiceZone, pilotCategoryId: string | null = null): ServiceArea {
  return {
    id: zone.id,
    name: zone.name,
    enabled: zone.is_active,
    station_id: null,
    distance_km: null,
    fixed_fee_minor_units: pilotFee(zone, pilotCategoryId),
  }
}

/**
 * Every service area, active or not, by name.
 *
 * @throws {ApiError} As the server sends it (401, 403, network).
 */
export async function listAreas(client: ApiClient = apiClient): Promise<ServiceArea[]> {
  const { items, pilot_water_category } = await listAdminServiceZones(undefined, client)
  return items.map((zone) => serviceAreaFromZone(zone, pilot_water_category?.id ?? null))
}

/**
 * The zone's fee list with the pilot category's entry set to `fee` (or removed
 * when `fee` is `null`) and every other category's entry kept, as the PATCH
 * replaces the whole list.
 */
function feesWithPilot(zone: ServiceZone, pilotCategoryId: string, fee: number | null): NonNullable<ServiceZoneUpdate['fallback_delivery_fees']> {
  const others = zone.fallback_delivery_fees
    .filter((entry) => entry.water_category.id !== pilotCategoryId)
    .map((entry) => ({ water_category_id: entry.water_category.id, fee_minor_units: entry.fee_minor_units }))
  return fee === null ? others : [...others, { water_category_id: pilotCategoryId, fee_minor_units: fee }]
}

/**
 * Save an area's name, whether it takes orders and its delivery fee.
 *
 * The current zone is read first: the fee is sent only when it changed, and
 * then with the other categories' fees kept.
 *
 * @param id - The zone's id; `null` adds an area, which is not connected yet.
 * @throws {ApiError} `not_connected` for adding an area, for a station or
 *   distance, or for a fee when the server names no pilot category; 404
 *   `service_zone_not_found`; 409 `service_zone_name_taken` with the screen's
 *   wording; otherwise as the server sends it.
 */
export async function saveArea(id: string | null, input: Omit<ServiceArea, 'id'>, client: ApiClient = apiClient): Promise<ServiceArea> {
  if (id === null) return notConnected('Adding service areas')
  if (input.station_id !== null || input.distance_km !== null) return notConnected('Serving station and distance')
  const { items, pilot_water_category } = await listAdminServiceZones(undefined, client)
  const pilotCategoryId = pilot_water_category?.id ?? null
  const current = items.find((zone) => zone.id === id)
  if (!current) {
    throw new ApiError({ kind: 'http', status: 404, code: 'service_zone_not_found', message: 'Area not found' })
  }
  const feeChanged = input.fixed_fee_minor_units !== pilotFee(current, pilotCategoryId)
  if (feeChanged && pilotCategoryId === null) return notConnected('The delivery fee per area')
  const update: ServiceZoneUpdate = { name: input.name.trim(), is_active: input.enabled }
  if (feeChanged && pilotCategoryId !== null) update.fallback_delivery_fees = feesWithPilot(current, pilotCategoryId, input.fixed_fee_minor_units)
  try {
    return serviceAreaFromZone(await updateAdminServiceZone(id, update, client), pilotCategoryId)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'service_zone_name_taken') {
      // Z4 keeps the mock's wording for this error (docs/design/handoff-v1.md).
      throw new ApiError({ kind: error.kind, status: error.status, code: error.code, message: 'An area with this name already exists', details: error.details, cause: error })
    }
    throw error
  }
}
