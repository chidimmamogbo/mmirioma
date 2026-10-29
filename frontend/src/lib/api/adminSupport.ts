/**
 * Types and typed calls for admin support requests, the audit log and admin
 * notifications, mirroring docs/api/admin-operations.md (agreed, G3; built in
 * #102).
 *
 * Every response is checked at runtime with Zod: a value the contract does
 * not allow is reported as `ApiError` `invalid_response` rather than shown as
 * the wrong state. An unknown support request type, audit action or
 * notification kind is kept as a string, and the adapter decides how to word
 * it (the contract says clients show an unknown value as it is).
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { apiClient, ApiError, type ApiClient } from './client'

const personSchema = z.object({ id: z.string(), name: z.string() })

/** `AdminSupportRequest`: a customer's "Report a problem", as staff see it. */
export const supportRequestSchema = z.object({
  /** `SR-` and 8 characters; also the id in the paths below. */
  reference: z.string(),
  /** `late`, `wrong_quantity`, `payment`, `rider` or `other`. */
  type: z.string(),
  message: z.string(),
  order_reference: z.string().nullable(),
  status: z.enum(['open', 'resolved']),
  created_at: z.string(),
  /** The customer who wrote it (staff only, NFR-003). */
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string() }),
  /** `null` while open. */
  resolution: z.object({ note: z.string(), resolved_by: personSchema, resolved_at: z.string() }).nullable(),
  is_simulated: z.boolean(),
})
export type AdminSupportRequest = z.infer<typeof supportRequestSchema>

const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int(), limit: z.number().int(), offset: z.number().int() })

/** `GET /admin/support-requests/{reference}`: the request plus the people the "Call" buttons dial. */
export const supportRequestDetailSchema = supportRequestSchema.extend({
  contacts: z.array(z.object({ name: z.string(), role: z.string(), phone: z.string() })),
})
export type AdminSupportRequestDetail = z.infer<typeof supportRequestDetailSchema>

/** `GET /admin/audit-logs`: one audit row. `details` holds ids and kinds only. */
export const auditLogSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.object({ id: z.string(), name: z.string(), role: z.string() }),
  /** The snake_case action code; the adapter turns known codes into words. */
  action: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  details: z.record(z.string(), z.unknown()),
})
export type AuditLogRead = z.infer<typeof auditLogSchema>

/** `GET /admin/notifications`: the header bell. The server sends no path; the screen builds the link. */
export const adminNotificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  /** An order reference, or `null`. */
  reference: z.string().nullable(),
  created_at: z.string(),
  /** `null` while unread. */
  read_at: z.string().nullable(),
})
export type AdminNotificationRead = z.infer<typeof adminNotificationSchema>

const notificationsPageSchema = pageOf(adminNotificationSchema).extend({ unread_count: z.number().int() })
export type AdminNotificationsPage = z.infer<typeof notificationsPageSchema>

const supportPageSchema = pageOf(supportRequestSchema)
export type AdminSupportPage = z.infer<typeof supportPageSchema>

const auditPageSchema = pageOf(auditLogSchema)
export type AuditLogPage = z.infer<typeof auditPageSchema>

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

/** Query parameters of `GET /admin/support-requests`. */
export interface SupportRequestListParams {
  /** Matches the reference, the order reference or the customer name; 1 to 100 characters. */
  q?: string
  status?: 'open' | 'resolved'
  limit?: number
  offset?: number
}

/**
 * List support requests, open first and then newest first
 * (`GET /admin/support-requests`).
 *
 * @throws {ApiError} 401, 403; `validation_error` (422) for a bad query; `invalid_response`.
 */
export async function listAdminSupportRequests(
  params: SupportRequestListParams = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<AdminSupportPage> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.status) query.set('status', params.status)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))
  const suffix = query.size ? `?${query}` : ''
  return parse(supportPageSchema, await client.request<unknown>(`/api/v1/admin/support-requests${suffix}`, { signal }))
}

/**
 * One support request with its contacts (`GET /admin/support-requests/{reference}`).
 *
 * @throws {ApiError} `support_request_not_found` (404); 401, 403; `invalid_response`.
 */
export async function getAdminSupportRequest(
  reference: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<AdminSupportRequestDetail> {
  return parse(
    supportRequestDetailSchema,
    await client.request<unknown>(`/api/v1/admin/support-requests/${encodeURIComponent(reference)}`, { signal }),
  )
}

/**
 * Resolve a request with a note (`POST /admin/support-requests/{reference}/resolve`).
 * Final: there is no reopen. It changes nothing on the order.
 *
 * @param note - 5 to 500 characters after trimming.
 * @throws {ApiError} `support_request_not_found` (404); `support_request_already_resolved` (409);
 *   `validation_error` (422) for a missing, short or long note; `csrf_failed` (403); `invalid_response`.
 */
export async function resolveAdminSupportRequest(
  reference: string,
  note: string,
  client: ApiClient = apiClient,
): Promise<AdminSupportRequest> {
  return parse(
    supportRequestSchema,
    await client.request<unknown>(`/api/v1/admin/support-requests/${encodeURIComponent(reference)}/resolve`, {
      method: 'POST',
      body: { note },
    }),
  )
}

/**
 * The audit log, newest first (`GET /admin/audit-logs`). Reading it is not itself audited.
 *
 * @param limit - Page size; the server defaults to 50.
 * @throws {ApiError} 401, 403; `validation_error` (422); `invalid_response`.
 */
export async function listAdminAuditLogs(limit?: number, signal?: AbortSignal, client: ApiClient = apiClient): Promise<AuditLogPage> {
  const suffix = limit === undefined ? '' : `?limit=${limit}`
  return parse(auditPageSchema, await client.request<unknown>(`/api/v1/admin/audit-logs${suffix}`, { signal }))
}

/**
 * This admin's notifications, newest first (`GET /admin/notifications`).
 *
 * @throws {ApiError} 401, 403; `invalid_response`.
 */
export async function listAdminNotificationsPage(signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminNotificationsPage> {
  return parse(notificationsPageSchema, await client.request<unknown>('/api/v1/admin/notifications', { signal }))
}

/**
 * Mark notifications read (`POST /admin/notifications/read`, 204). Without
 * `ids` it marks every unread message of this admin.
 *
 * @throws {ApiError} `csrf_failed` (403); `validation_error` (422) for more than 100 ids.
 */
export async function markAdminNotificationsReadRequest(ids?: string[], client: ApiClient = apiClient): Promise<void> {
  await client.request<unknown>('/api/v1/admin/notifications/read', { method: 'POST', body: ids ? { ids } : {} })
}
