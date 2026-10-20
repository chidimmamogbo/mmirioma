/**
 * Push notification settings (proposed contract: docs/api/push.md).
 *
 * Push goes to a device, not an account: each browser or installed app that
 * turns notifications on gets its own subscription for the signed-in user.
 */
export interface PushSettings {
  /** This browser gets push notifications for the signed-in user. */
  enabled: boolean
  /** Partners only: also "New order near you". Off by default because it fires all day. */
  new_orders: boolean
}

/** What a push message carries; the service worker shows it and opens `url` on tap. */
export interface PushPayload {
  title: string
  body: string
  /** In-app path to open when the notification is tapped. */
  url: string
  /** Notifications with the same tag replace each other (one per order). */
  tag: string
}
