/**
 * Mock push delivery. The real backend sends a push message for chosen events
 * (docs/api/push.md); in mock mode there is no server, so after every mock
 * change we look for notifications that were just added for a user who turned
 * push on in this browser, and show them as real system notifications.
 *
 * Kept free of the mock database module so `db.ts` can call it without an
 * import cycle.
 */
import type { CustomerNotification } from '../domain/orders'
import type { PartnerNotification } from '../domain/partner'
import type { PushPayload } from '../domain/push'
import type { MockState } from './seed'

/** Customer events that are pushed (decision Q10). Others stay in-app only. */
const CUSTOMER_PUSH: CustomerNotification['kind'][] = ['rider_assigned', 'on_the_way', 'delivered', 'payment']
/** Partner events that are always pushed; "new_orders" only when opted in. */
const PARTNER_PUSH: PartnerNotification['kind'][] = ['assigned', 'payout']

/** Partner app base per vehicle (same as PARTNER_APPS in features/partner). */
const PARTNER_BASE = { keke: '/partner/rider', tanker: '/partner/driver' } as const

export interface MockPushMessage extends PushPayload {
  userId: string
}

/** Every notification id in the mock database, to spot new ones after a change. */
export function notificationIds(s: MockState): Set<string> {
  const ids = new Set<string>()
  for (const c of Object.values(s.customers)) c.notifications.forEach((n) => ids.add(n.id))
  for (const p of Object.values(s.partners)) p.notifications.forEach((n) => ids.add(n.id))
  return ids
}

function customerUrl(n: CustomerNotification): string {
  if (!n.reference) return '/notifications'
  if (n.kind === 'delivered') return `/orders/${n.reference}/delivered`
  if (n.kind === 'payment') return `/orders/${n.reference}`
  return `/orders/${n.reference}/track`
}

function partnerUrl(n: PartnerNotification, base: string): string {
  // `/partner` opens the partner's home, where an assigned order shows as a sheet.
  if (n.kind === 'assigned') return '/partner'
  if (n.kind === 'payout') return `${base}/earnings`
  return n.reference ? `${base}/orders/${n.reference}` : `${base}/orders`
}

/**
 * Push messages for notifications added since `before`, for users who turned
 * push on. Pure, so the rules can be tested without a browser.
 */
export function pushMessages(s: MockState, before: Set<string>): MockPushMessage[] {
  const out: MockPushMessage[] = []
  for (const [userId, sub] of Object.entries(s.pushSubscriptions ?? {})) {
    const customer = s.customers[userId]
    if (customer) {
      for (const n of customer.notifications) {
        if (before.has(n.id) || !CUSTOMER_PUSH.includes(n.kind)) continue
        out.push({ userId, title: n.title, body: n.body, url: customerUrl(n), tag: n.reference ?? n.id })
      }
    }
    const partner = s.partners[userId]
    if (partner) {
      const base = PARTNER_BASE[partner.profile.vehicle.type]
      for (const n of partner.notifications) {
        if (before.has(n.id)) continue
        if (!PARTNER_PUSH.includes(n.kind) && !(n.kind === 'new_orders' && sub.new_orders)) continue
        out.push({ userId, title: n.title, body: n.body, url: partnerUrl(n, base), tag: n.reference ?? n.id })
      }
    }
  }
  return out
}

/** Show the new push messages, if this browser allows notifications. */
export function deliverMockPush(s: MockState, before: Set<string>): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const messages = pushMessages(s, before)
  if (messages.length) void showAll(messages)
}

async function showAll(messages: MockPushMessage[]): Promise<void> {
  try {
    // The service worker shows it so a tap can open the right screen (src-sw/sw.ts).
    const reg = await navigator.serviceWorker?.getRegistration()
    for (const m of messages) {
      const options: NotificationOptions = { body: m.body, tag: m.tag, icon: '/icons/icon-192.png', data: { url: m.url } }
      if (reg) await reg.showNotification(m.title, options)
      else new Notification(m.title, options)
    }
  } catch {
    // A notification that cannot be shown is not an error for the action that caused it.
  }
}
