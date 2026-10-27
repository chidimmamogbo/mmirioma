/**
 * Types and typed calls for the admin service zone endpoints, mirroring
 * docs/api/admin-directory.md, "Service zones" (agreed 2026-10-26, built in
 * #30). The customer and partner zone list (`GET /service-zones`) is in
 * `partners.ts`.
 *
 * Responses are checked at runtime with Zod, so an unexpected shape is
 * reported as `ApiError` `invalid_response` instead of showing a wrong zone.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { apiClient, ApiError, type ApiClient } from './client'

const ADMIN_ZONES_PATH = '/api/v1/admin/service-zones'

/** `ServiceZone` (admin-directory.md, "Object"). */
export const serviceZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** FR-010; the design's "enabled". */
  is_active: z.boolean(),
  /** WGS 84 decimal degrees. */
  centre: z.object({ latitude: z.number(), longitude: z.number() }),
  /** GeoJSON `Polygon` or `null`; not shown on any screen. */
  boundary: z.unknown().nullable(),
  /** One fee per water category, per order, in kobo (FR-010, FR-022 fallback). */
  fallback_delivery_fees: z.array(
    z.object({
      water_category: z.object({ id: z.string(), label: z.string() }),
      fee_minor_units: z.number().int(),
    }),
  ),
  created_at: z.string(),
  updated_at: z.string(),
})
export type ServiceZone = z.infer<typeof serviceZoneSchema>

const serviceZoneListSchema = z.object({ items: z.array(serviceZoneSchema) })

/**
 * `ServiceZoneWrite` with every field optional (`PATCH`). An absent field is
 * unchanged; a sent `fallback_delivery_fees` replaces the whole list.
 */
export interface ServiceZoneUpdate {
  name?: string
  is_active?: boolean
  centre?: { latitude: number; longitude: number }
  boundary?: unknown
  fallback_delivery_fees?: { water_category_id: string; fee_minor_units: number }[]
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError({
      kind: 'parse',
      status: 200,
      code: 'invalid_response',
      message: 'The server returned an unexpected response.',
      cause: result.error,
    })
  }
  return result.data
}

/**
 * Every zone, active or not, by name (`GET /admin/service-zones`).
 *
 * @throws {ApiError} `invalid_response`; shared 401/403; `network_error`.
 */
export async function listAdminServiceZones(signal?: AbortSignal, client: ApiClient = apiClient): Promise<ServiceZone[]> {
  return parse(serviceZoneListSchema, await client.request<unknown>(ADMIN_ZONES_PATH, { signal })).items
}

/**
 * Change a zone (`PATCH /admin/service-zones/{id}`).
 *
 * @throws {ApiError} `service_zone_not_found`, `water_category_not_found` (404);
 *   `service_zone_name_taken` (409); `validation_error` (422); `csrf_failed`;
 *   `invalid_response`; `network_error`.
 */
export async function updateAdminServiceZone(id: string, update: ServiceZoneUpdate, client: ApiClient = apiClient): Promise<ServiceZone> {
  return parse(serviceZoneSchema, await client.request<unknown>(`${ADMIN_ZONES_PATH}/${encodeURIComponent(id)}`, { method: 'PATCH', body: update }))
}
