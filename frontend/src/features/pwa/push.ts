/**
 * Turning phone notifications on and off in this browser (decision Q9).
 *
 * Push needs three things: a browser that supports it, the person's
 * permission (asked only when they tap "Turn on", never on page load), and a
 * subscription saved on the server. On iPhone, websites can only get push
 * once added to the home screen (iOS 16.4+), so there we ask them to install
 * first.
 */
import type { PushSettings } from '../../domain/push'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import { isIos } from './installPrompt'
import { savePushSettings, type BrowserSubscription } from './pushApi'

export type PushSupport = 'supported' | 'install-first' | 'unsupported'

/** Can this browser get push right now? */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    // iPhone Safari outside the installed app has no Notification API at all.
    return typeof navigator !== 'undefined' && isIos(navigator.userAgent, navigator.maxTouchPoints ?? 0) ? 'install-first' : 'unsupported'
  }
  if (!USE_MOCKS && !('PushManager' in window)) return 'unsupported'
  return 'supported'
}

/** The person blocked notifications for this site; only browser settings can undo it. */
export function pushBlocked(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied'
}

/** Thrown when the person says no to the browser's permission question. */
export class PushPermissionError extends Error {
  constructor() {
    super('Notifications are blocked. Allow them for this site in your browser settings, then try again.')
    this.name = 'PushPermissionError'
  }
}

/** Convert a base64url VAPID public key to the bytes `pushManager.subscribe` wants. */
export function vapidKeyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Subscribe this browser with the push service (real-API mode only). */
async function browserSubscription(vapidKey: string): Promise<BrowserSubscription> {
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(vapidKey) }))
  const json = sub.toJSON()
  return { endpoint: json.endpoint ?? sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
}

/**
 * Turn push on (asking permission first) or off, and save the choice.
 *
 * @throws PushPermissionError when the person refuses notifications.
 */
export async function setPush(next: PushSettings): Promise<PushSettings> {
  if (!next.enabled) return savePushSettings({ enabled: false, new_orders: false }, null)
  if (Notification.permission !== 'granted') {
    const answer = await Notification.requestPermission()
    if (answer !== 'granted') throw new PushPermissionError()
  }
  if (USE_MOCKS) return savePushSettings(next, null)
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!key) return notConnected('Phone notifications')
  return savePushSettings(next, await browserSubscription(key))
}
