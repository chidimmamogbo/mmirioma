/**
 * Admin service area adapters (#74, #111): the real-API side of `listAreas`
 * and `saveArea` in `adminApi.ts`, converting with docs/api/admin-directory.md,
 * "Service zones" (mapping table) and the approved Z4 screen
 * (docs/design/handoff-v1.md).
 *
 * - `centre` is the zone's coordinates, typed in by admin (required).
 * - Adding an area is `POST /admin/service-zones`. The boundary is not edited
 *   on this screen, so it is never sent.
 * - The fee is the pilot water category's, but the admin zone list does not
 *   name that category yet (contract amendment agreed in #108, built in #109,
 *   read by the screen in #110). Until then the fee reads as `null` and
 *   writing one is not connected.
 *
 * Nothing is guessed: a value the server does not give stays empty.
 */
import type { ServiceArea } from '../../../domain/admin'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { notConnected } from '../../../lib/api/notConnected'
import { createAdminServiceZone, listAdminServiceZones, updateAdminServiceZone, type ServiceZone } from '../../../lib/api/serviceZones'

/** Backend zone to the design's service area. */
export function serviceAreaFromZone(zone: ServiceZone): ServiceArea {
  return {
    id: zone.id,
    name: zone.name,
    enabled: zone.is_active,
    centre: zone.centre,
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
 * Add an area (`id` is `null`) or save an existing one: its name, whether it
 * takes orders and its coordinates.
 *
 * @param id - The zone's id; `null` adds an area.
 * @throws {ApiError} `not_connected` for a fee the server cannot store yet;
 *   409 `service_zone_name_taken` with the screen's wording; 422
 *   `validation_error`; otherwise as the server sends it.
 */
export async function saveArea(id: string | null, input: Omit<ServiceArea, 'id'>, client: ApiClient = apiClient): Promise<ServiceArea> {
  if (input.fixed_fee_minor_units !== null) return notConnected('The delivery fee per area')
  const body = { name: input.name.trim(), is_active: input.enabled, centre: input.centre }
  try {
    const zone = id === null ? await createAdminServiceZone(body, client) : await updateAdminServiceZone(id, body, client)
    return serviceAreaFromZone(zone)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'service_zone_name_taken') {
      // Z4 keeps the mock's wording for this error (docs/design/handoff-v1.md).
      throw new ApiError({ kind: error.kind, status: error.status, code: error.code, message: 'An area with this name already exists', details: error.details, cause: error })
    }
    throw error
  }
}
