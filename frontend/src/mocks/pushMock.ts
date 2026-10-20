/**
 * Mock of the proposed push subscription endpoints (docs/api/push.md). It
 * only records that the signed-in user wants push in this browser; mockPush.ts
 * then shows their notifications.
 */
import type { PushSettings } from '../domain/push'
import { requireUserId } from './authMock'
import { mutate, read } from './db'
import { delay } from './store'

export async function getPushSettings(): Promise<PushSettings> {
  await delay(null, 80)
  const sub = read().pushSubscriptions[requireUserId()]
  return { enabled: Boolean(sub), new_orders: sub?.new_orders ?? false }
}

export async function savePushSettings(next: PushSettings): Promise<PushSettings> {
  await delay(null)
  const id = requireUserId()
  mutate((s) => {
    if (!next.enabled) delete s.pushSubscriptions[id]
    else s.pushSubscriptions[id] = { new_orders: next.new_orders, created_at: s.pushSubscriptions[id]?.created_at ?? new Date().toISOString() }
  })
  return { enabled: next.enabled, new_orders: next.enabled && next.new_orders }
}
