/**
 * Typed push-subscription API (proposed contract: docs/api/push.md, not
 * agreed yet). Mock mode uses `src/mocks/pushMock.ts`; real-API mode fails
 * with `not_connected` until the backend endpoints exist.
 */
import type { PushSettings } from '../../domain/push'
import { USE_MOCKS } from '../../lib/api/mode'
import { lazyMock } from '../../lib/api/lazyMock'
import { notConnected } from '../../lib/api/notConnected'

/** The mock modules load on first use, and not at all in a build without mocks (#236). */
const mock = lazyMock(__USE_MOCKS__ && (() => import('../../mocks/pushMock')))

/** The browser's subscription as `PushSubscription.toJSON()` gives it. */
export interface BrowserSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export const getPushSettings = (): Promise<PushSettings> => (USE_MOCKS ? mock.getPushSettings() : notConnected('Phone notifications'))

/**
 * Save this browser's push settings. `subscription` is the browser's push
 * address; the mock does not need one because it shows notifications itself.
 */
export const savePushSettings = (settings: PushSettings, subscription: BrowserSubscription | null): Promise<PushSettings> => {
  void subscription
  return USE_MOCKS ? mock.savePushSettings(settings) : notConnected('Phone notifications')
}
