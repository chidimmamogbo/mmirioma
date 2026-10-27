/**
 * Customer notification endpoints, mirroring docs/api/customer-account.md
 * ("Notifications"; agreed in #48, built in #82 part 2). The shape is the one
 * partners read (docs/api/partners.md, `lib/api/partners.ts`): only the path
 * and the `kind` values differ. Screens do not call these directly: the
 * customer adapters in `src/features/customer/real/` convert them.
 */

import { z } from 'zod'
import { apiClient, ApiError, type ApiClient } from './client'

const customerNotificationReadSchema = z.object({
  id: z.string(),
  /** customer-account.md, "What creates a notification"; a later server may add more. */
  kind: z.string(),
  /** Written by the server from a template (FR-050). */
  title: z.string(),
  body: z.string(),
  /** The order's public reference, or `null`. Never the delivery code. */
  reference: z.string().nullable(),
  /** UTC ISO timestamp. */
  created_at: z.string(),
  /** UTC timestamp, or `null` while unread. */
  read_at: z.string().nullable(),
})
export type CustomerNotificationRead = z.infer<typeof customerNotificationReadSchema>

const customerNotificationPageSchema = z.object({
  items: z.array(customerNotificationReadSchema),
  /** Unread messages across all pages, for the badge. */
  unread_count: z.number().int(),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})
export type CustomerNotificationPage = z.infer<typeof customerNotificationPageSchema>

const NOTIFICATIONS_PATH = '/api/v1/me/notifications'

/** Most ids one mark-read request may carry (customer-account.md). */
export const MARK_READ_MAX_IDS = 100

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
 * One page of the customer's in-app messages, newest first
 * (`GET /api/v1/me/notifications`). The server's default page is 50.
 *
 * @throws {ApiError} `validation_error` (422: bad `limit` or `offset`);
 *   `invalid_response` for an unexpected body; shared 401/403.
 */
export async function listCustomerNotifications(
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CustomerNotificationPage> {
  const query = new URLSearchParams()
  if (page.limit !== undefined) query.set('limit', String(page.limit))
  if (page.offset !== undefined) query.set('offset', String(page.offset))
  const search = query.toString()
  const path = search ? `${NOTIFICATIONS_PATH}?${search}` : NOTIFICATIONS_PATH
  return parse(customerNotificationPageSchema, await client.request<unknown>(path, { signal }))
}

/**
 * Mark messages read (`POST /api/v1/me/notifications/read`, 204). With
 * `ids` (up to 100), marks those; without, marks every unread one. Unknown
 * ids, and other people's, are ignored.
 *
 * @throws {ApiError} `validation_error` (422: not UUIDs, or more than 100); `csrf_failed` (403).
 */
export async function markCustomerNotificationsRead(ids?: string[], client: ApiClient = apiClient): Promise<void> {
  await client.request<unknown>(`${NOTIFICATIONS_PATH}/read`, { method: 'POST', body: ids ? { ids } : {} })
}
