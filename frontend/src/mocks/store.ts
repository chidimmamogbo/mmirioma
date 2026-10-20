/**
 * Tiny store for mock data, kept in this browser's localStorage. It exists
 * only so the mock-backed screens behave like a real backend during
 * development and demos: data you add (and the mock sign-in) survives closing
 * the tab or the installed app, like the real 7-day session cookie. Nothing
 * here is sent anywhere.
 */
import { ApiError } from '../lib/api/client'

// Bump when MockState changes shape, so stale saved data is not read back.
export const MOCK_STORAGE_KEY = 'mmirioma.mock.v3'

/** Simulated network latency so loading states are visible. */
export const MOCK_LATENCY_MS = 250

export function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** Deep copy so callers can never mutate stored mock data by accident. */
export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function loadState<T>(seed: () => T): T {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // Storage blocked or corrupted: fall back to fresh seed data.
  }
  return seed()
}

export function saveState<T>(state: T): void {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable (private mode quota): keep working in memory only.
  }
}

export function resetState(): void {
  try {
    localStorage.removeItem(MOCK_STORAGE_KEY)
  } catch {
    // Ignore: nothing to clear.
  }
}

/** Build an ApiError shaped like the backend envelope, for mock failures. */
export function mockError(status: number, code: string, message: string, details: unknown = null): ApiError {
  return new ApiError({ kind: 'http', status, code, message, details })
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Public-safe order reference: `MO-` + 10 random Crockford base32 characters (orders.md). */
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return 'MO-' + Array.from(bytes, (b) => CROCKFORD[b % 32]).join('')
}

/** Random six-digit delivery code. */
export function newDeliveryCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}
