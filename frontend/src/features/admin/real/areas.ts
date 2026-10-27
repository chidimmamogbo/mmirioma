/**
 * Admin service area adapters (#74): the real-API side of `listAreas` and
 * `saveArea` in `adminApi.ts`, converting with docs/api/admin-directory.md,
 * "Service zones" (mapping table).
 *
 * The screen still has its pre-Z4 fields, so only what the contract can carry
 * is linked:
 *
 * - `station_id` and `distance_km` have no source and are always `null`.
 * - The fee is the pilot water category's, but no endpoint says which category
 *   that is (contract amendment proposed in #74). Until it is agreed and built,
 *   the fee reads as `null` and writing one is not connected.
 * - Adding an area needs the zone's coordinates, which the screen cannot enter
 *   until the Z4 screen change, so it is not connected either.
 *
 * Nothing is guessed: a value the server does not give stays empty.
 */
import type { ServiceArea } from '../../../domain/admin'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { notConnected } from '../../../lib/api/notConnected'
import { listAdminServiceZones, updateAdminServiceZone, type ServiceZone } from '../../../lib/api/serviceZones'

/** Backend zone to the design's service area. */
export function serviceAreaFromZone(zone: ServiceZone): ServiceArea {
  return {
    id: zone.id,
    name: zone.name,
    enabled: zone.is_active,
    station_id: null,
    distance_km: null,
    fixed_fee_minor_units: null,
  }
}

/**
 * Every service area, active or not, by name.
 *
 * @throws {ApiError} As the server sends it (401, 403, network).
 */
export async function listAreas(client: ApiClient = apiClient): Promise<ServiceArea[]> {
  return (await listAdminServiceZones(undefined, client)).map(serviceAreaFromZone)
}

/**
 * Save an area's name and whether it takes orders.
 *
 * @param id - The zone's id; `null` adds an area, which is not connected yet.
 * @throws {ApiError} `not_connected` for adding an area, or for a station,
 *   distance or fee the server cannot store yet; 409 `service_zone_name_taken`
 *   with the screen's wording; otherwise as the server sends it.
 */
export async function saveArea(id: string | null, input: Omit<ServiceArea, 'id'>, client: ApiClient = apiClient): Promise<ServiceArea> {
  if (id === null) return notConnected('Adding service areas')
  if (input.station_id !== null || input.distance_km !== null) return notConnected('Serving station and distance')
  if (input.fixed_fee_minor_units !== null) return notConnected('The delivery fee per area')
  try {
    return serviceAreaFromZone(await updateAdminServiceZone(id, { name: input.name.trim(), is_active: input.enabled }, client))
  } catch (error) {
    if (error instanceof ApiError && error.code === 'service_zone_name_taken') {
      // Z4 keeps the mock's wording for this error (docs/design/handoff-v1.md).
      throw new ApiError({ kind: error.kind, status: error.status, code: error.code, message: 'An area with this name already exists', details: error.details, cause: error })
    }
    throw error
  }
}
