/**
 * Customer notification adapters (#88, part 2): the real-API side of
 * `listNotifications` and `markNotificationsRead` in `customerApi.ts`, against
 * the endpoints of #82 part 2 (PR #91). Same rules as the partner app
 * (`features/partner/real/account.ts`): `read` is `read_at !== null`, and a
 * kind this build does not know is shown, never hidden or failed on.
 */
import type { CustomerNotification, CustomerNotificationList } from '../../../domain/orders'
import { apiClient, type ApiClient } from '../../../lib/api/client'
import {
  listCustomerNotifications,
  markCustomerNotificationsRead,
  type CustomerNotificationRead,
} from '../../../lib/api/customerNotifications'

/** The kinds the server sends today (customer-account.md, "What creates a notification"). */
const KNOWN_KINDS = [
  'order_received',
  'order_confirmed',
  'rider_assigned',
  'on_the_way',
  'delivered',
  'cancelled',
  'delivery_failed',
] as const satisfies readonly CustomerNotification['kind'][]

function knownKind(kind: string): CustomerNotification['kind'] {
  return (KNOWN_KINDS as readonly string[]).includes(kind) ? (kind as CustomerNotification['kind']) : 'update'
}

/** Backend messages to the design's list, newest first as the server sends them. */
export function customerNotificationsFromRead(items: CustomerNotificationRead[]): CustomerNotification[] {
  return items.map((n) => ({
    id: n.id,
    kind: knownKind(n.kind),
    title: n.title,
    body: n.body,
    at: n.created_at,
    read: n.read_at !== null,
    reference: n.reference,
  }))
}

/**
 * The newest page (50) of the customer's notifications
 * (`GET /me/notifications`), with the server's `unread_count` across all
 * pages for the bell, the menu badge and "Mark all read".
 */
export async function listNotifications(client: ApiClient = apiClient): Promise<CustomerNotificationList> {
  const page = await listCustomerNotifications({}, undefined, client)
  return { items: customerNotificationsFromRead(page.items), unread_count: page.unread_count }
}

/** Mark those messages read, or every unread one without `ids` (`POST /me/notifications/read`). */
export async function markNotificationsRead(ids?: string[], client: ApiClient = apiClient): Promise<void> {
  await markCustomerNotificationsRead(ids, client)
}
