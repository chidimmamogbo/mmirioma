/**
 * "Not now" for the install and notification cards (decision Q8): a dismissed
 * card stays hidden for a week in this browser. Stored in localStorage, which
 * may be blocked (private mode); then the card simply shows again.
 */
export const REMIND_AFTER_DAYS = 7

const PREFIX = 'mmirioma.remind.'

/** True while the card `key` was dismissed less than a week ago. */
export function isSnoozed(key: string, now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(PREFIX + key))
    return Number.isFinite(at) && at > 0 && now - at < REMIND_AFTER_DAYS * 86_400_000
  } catch {
    return false
  }
}

/** Hide the card `key` for a week. */
export function snooze(key: string, now = Date.now()): void {
  try {
    localStorage.setItem(PREFIX + key, String(now))
  } catch {
    // Storage blocked: the card shows again next time, which is harmless.
  }
}
