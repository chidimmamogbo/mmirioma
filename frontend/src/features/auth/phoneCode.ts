/**
 * Pure helpers for the phone code screens (docs/design/phone-verification.md).
 * Kept apart from the components so React Fast Refresh keeps working.
 */
import { ApiError } from '../../lib/api/client'
import type { PhoneCodeSent } from '../../lib/api/phoneVerification'
import { retryAfterSeconds } from '../../lib/forms'

/** A code's lifetime in the contract (auth.md: 5 minutes). */
const CODE_LIFETIME_MS = 5 * 60_000
/** A sent code plus when its response arrived on this device. */
export interface SentCode extends PhoneCodeSent {
  received_at: number
}

export function sentNow(sent: PhoneCodeSent): SentCode {
  return { ...sent, received_at: Date.now() }
}

/**
 * Milliseconds until a new code may be requested, measured from when the
 * response arrived (correction 12): phone clocks can be wrong, so only the
 * server's own times are compared. The send moment is `expires_at` minus the
 * 5-minute lifetime; if the times cannot be read, the contract's 60 s is used.
 */
export function resendWaitMs(sent: PhoneCodeSent): number {
  const wait = Date.parse(sent.resend_available_at) - (Date.parse(sent.expires_at) - CODE_LIFETIME_MS)
  return Number.isFinite(wait) && wait >= 0 ? wait : 60_000
}

/** Keep digits only: spaces and dashes from a pasted "123 456" go, then the first 6 (correction 11). */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6)
}

/** "Wait 9 minutes, then try again." from a 429, or null. */
export function waitText(error: unknown): string | null {
  const seconds = retryAfterSeconds(error)
  if (seconds === null && !(error instanceof ApiError && error.code === 'too_many_attempts')) return null
  const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60))
  return `Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, then try again.`
}
