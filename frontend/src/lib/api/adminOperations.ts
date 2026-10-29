/**
 * Types and typed calls for the admin overview endpoints, mirroring
 * docs/api/admin-operations.md (agreed, G3; built in #102): the shell counts,
 * dashboard, live map, recent activity and settings.
 *
 * Every response is checked at runtime with Zod: a value the contract does
 * not allow is reported as `ApiError` `invalid_response` rather than shown as
 * the wrong state. Unknown order statuses and activity kinds are kept as
 * strings (the contract says clients show an unknown kind as a plain line),
 * and the adapter decides how to word them.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { apiClient, ApiError, type ApiClient } from './client'

const deliveryTypeSchema = z.enum(['keke', 'tanker'])

/** `GET /admin/shell`: the counts behind the sidebar badges and the header bell. */
export const shellSchema = z.object({
  orders_needing_action: z.number().int(),
  support_requests_open: z.number().int(),
  notifications_unread: z.number().int(),
})
export type AdminShellRead = z.infer<typeof shellSchema>

/** `GET /admin/dashboard`: one Lagos day of operations plus a few "now" values. */
export const dashboardSchema = z.object({
  /** The Lagos date the numbers are for, `YYYY-MM-DD`. */
  date: z.string(),
  /** True when the numbers come from simulated records only (`simulated=only`). */
  is_simulated: z.boolean(),
  orders: z.object({
    total: z.number().int(),
    /** Counted by backend `status`; statuses with no orders are left out. */
    by_status: z.record(z.string(), z.number().int()),
    oldest_waiting_minutes: z.number().int().nullable(),
  }),
  deliveries: z.object({ delivered: z.number().int(), with_window: z.number().int(), on_time: z.number().int() }),
  by_delivery_type: z.object({ keke: z.number().int(), tanker: z.number().int(), not_recorded: z.number().int() }),
  holds_open: z.number().int(),
  support_requests_open: z.number().int(),
  drivers_available: z.object({ total: z.number().int(), keke: z.number().int(), tanker: z.number().int() }),
  sources: z.object({ usable: z.number().int(), not_usable: z.number().int() }),
  cash: z.object({
    /** Integer kobo (SRS section 5). */
    collected_minor_units: z.number().int(),
    reconciled_minor_units: z.number().int(),
  }),
})
export type AdminDashboardRead = z.infer<typeof dashboardSchema>

/** `GET /admin/live-map`: deliveries by source and zone. No GPS (FR-037). */
export const liveMapSchema = z.object({
  deliveries: z.array(
    z.object({
      reference: z.string(),
      /** Backend order status; the adapter maps it to the admin status. */
      status: z.string(),
      /** `null` for an order created before delivery details existed (#21). */
      delivery_type: deliveryTypeSchema.nullable(),
      driver: z.object({ id: z.string(), name: z.string(), plate: z.string().nullable() }),
      /** `null` until the order has a confirmed source. */
      source: z.object({ id: z.string(), name: z.string() }).nullable(),
      /** `null` when the customer's area is not listed. */
      zone: z.object({ id: z.string(), name: z.string() }).nullable(),
      is_simulated: z.boolean(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      approximate_location: z.string().nullable(),
      /** Usable for dispatch under FR-012 for at least one category. */
      usable: z.boolean(),
      is_simulated: z.boolean(),
    }),
  ),
})
export type LiveMapRead = z.infer<typeof liveMapSchema>

/** `GET /admin/activity`: newest first. */
export const activitySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      /** `order_status` or `support_request`; an unknown kind is shown as a plain line. */
      kind: z.string(),
      order_reference: z.string().nullable(),
      /** For `order_status`, the status the order moved to. */
      to_status: z.string().nullable(),
      /** Staff or driver only; `null` for the system and for customers. */
      actor: z.object({ name: z.string(), role: z.string() }).nullable(),
      is_simulated: z.boolean(),
    }),
  ),
})
export type AdminActivityRead = z.infer<typeof activitySchema>

/** `GET /admin/settings`: read only. */
export const settingsSchema = z.object({
  support: z.object({ phone: z.string().nullable(), whatsapp_enabled: z.boolean() }),
  delivery_code_validity_minutes: z.number().int(),
  staff: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string(),
      role: z.string(),
      /** The newest session's creation time, not "last active"; `null` if never signed in. */
      last_sign_in_at: z.string().nullable(),
    }),
  ),
})
export type AdminSettingsRead = z.infer<typeof settingsSchema>

/**
 * Check a response against a schema.
 *
 * @throws {ApiError} `invalid_response` if it does not match.
 */
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
 * The counts behind the sidebar badges and the header bell (`GET /admin/shell`).
 *
 * @throws {ApiError} `not_authenticated` (401), `forbidden` (403); `invalid_response`.
 */
export async function getAdminShell(signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminShellRead> {
  return parse(shellSchema, await client.request<unknown>('/api/v1/admin/shell', { signal }))
}

/**
 * The dashboard numbers for today (`GET /admin/dashboard`).
 *
 * Real orders only: the screens send no `simulated` parameter, so the server
 * excludes simulated records (BR-09, admin-operations.md "Simulated data").
 *
 * @throws {ApiError} 401, 403; `validation_error` (422); `invalid_response`.
 */
export async function getAdminDashboard(signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminDashboardRead> {
  return parse(dashboardSchema, await client.request<unknown>('/api/v1/admin/dashboard', { signal }))
}

/**
 * Deliveries in progress and the water sources (`GET /admin/live-map`).
 *
 * @throws {ApiError} 401, 403; `invalid_response`.
 */
export async function getAdminLiveMap(signal?: AbortSignal, client: ApiClient = apiClient): Promise<LiveMapRead> {
  return parse(liveMapSchema, await client.request<unknown>('/api/v1/admin/live-map', { signal }))
}

/**
 * The newest events for "Recent activity" (`GET /admin/activity`).
 *
 * @param limit - 1 to 20; the server defaults to 5.
 * @throws {ApiError} 401, 403; `validation_error` (422) outside 1 to 20; `invalid_response`.
 */
export async function getAdminActivity(limit?: number, signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminActivityRead> {
  const query = limit === undefined ? '' : `?limit=${limit}`
  return parse(activitySchema, await client.request<unknown>(`/api/v1/admin/activity${query}`, { signal }))
}

/**
 * The support contact, the code validity and the staff list (`GET /admin/settings`).
 *
 * @throws {ApiError} 401, 403; `invalid_response`.
 */
export async function getAdminSettings(signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminSettingsRead> {
  return parse(settingsSchema, await client.request<unknown>('/api/v1/admin/settings', { signal }))
}
