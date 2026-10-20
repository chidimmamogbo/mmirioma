import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../lib/api/client'

/**
 * Do not retry requests that cannot succeed by retrying: client errors (4xx,
 * e.g. not signed in, validation) and misconfiguration. Network errors and
 * 5xx get up to two retries, which helps on patchy mobile data.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.kind === 'config') return false
    if (error.status !== null && error.status >= 400 && error.status < 500) return false
  }
  return failureCount < 2
}

/** Creates the app's query client. Exported for tests. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
      // Mutations (orders, payments) are never retried automatically; the
      // order endpoint is idempotent, but a retry must reuse the same key and
      // that is the caller's job (FR-026).
      mutations: { retry: false },
    },
  })
}
