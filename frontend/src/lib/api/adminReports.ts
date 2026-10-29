/**
 * Type and typed call for `GET /admin/reports`, mirroring
 * docs/api/admin-operations.md (agreed, G3; built in #102 part 2).
 *
 * The response is checked at runtime with Zod: a value the contract does not
 * allow is reported as `ApiError` `invalid_response`. Money is integer kobo
 * (`*_minor_units`), never a float (SRS section 5).
 *
 * If the contract changes, update this schema in the same PR.
 */

import { z } from 'zod'
import { apiClient, ApiError, type ApiClient } from './client'

/** The Reports page's date pills. `7d` is the 7 Lagos days ending today. */
export type AdminReportRange = 'today' | '7d' | '30d'

/** `GET /admin/reports`: aggregates for one range. Holds no customer data (FR-053). */
export const reportSchema = z.object({
  range: z.enum(['today', '7d', '30d']),
  /** First and last Lagos date of the range, `YYYY-MM-DD`. */
  from: z.string(),
  to: z.string(),
  /** True when the numbers come from simulated records only (`simulated=only`). */
  is_simulated: z.boolean(),
  orders: z.object({
    total: z.number().int(),
    /** Counted by backend `status`; statuses with no orders are left out. */
    by_status: z.record(z.string(), z.number().int()),
  }),
  deliveries: z.object({ delivered: z.number().int(), with_window: z.number().int(), on_time: z.number().int() }),
  by_delivery_type: z.object({ keke: z.number().int(), tanker: z.number().int(), not_recorded: z.number().int() }),
  cash: z.object({
    /** Integer kobo (SRS section 5). */
    collected_minor_units: z.number().int(),
    reconciled_minor_units: z.number().int(),
  }),
  /** One row with `zone_id` and `name` null collects orders with no zone. */
  by_zone: z.array(z.object({ zone_id: z.string().nullable(), name: z.string().nullable(), orders: z.number().int(), delivered: z.number().int() })),
  by_driver: z.array(z.object({ driver_id: z.string(), name: z.string(), plate: z.string().nullable(), delivered: z.number().int() })),
  by_source: z.array(z.object({ source_id: z.string(), name: z.string(), pickups: z.number().int() })),
})
export type AdminReportRead = z.infer<typeof reportSchema>

/**
 * The report for a range (`GET /admin/reports`).
 *
 * Always sends `range`: the server has no default and answers a missing one
 * with 422 `validation_error` (admin-operations.md, decision 7). The screens
 * send no `simulated` parameter, so the server excludes simulated records
 * (BR-09).
 *
 * @param range - The pill the admin picked.
 * @throws {ApiError} 401, 403; `validation_error` (422); `invalid_response`.
 */
export async function getAdminReport(range: AdminReportRange, signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminReportRead> {
  const query = new URLSearchParams()
  if (range) query.set('range', range)
  const value = await client.request<unknown>(`/api/v1/admin/reports?${query.toString()}`, { signal })
  const result = reportSchema.safeParse(value)
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
