import { useEffect, useState } from 'react'
import { ApiError } from '../lib/api/client'
import { getHealth } from '../lib/api/health'

type Status =
  | { state: 'loading' }
  | { state: 'ok'; service: string }
  | { state: 'error'; message: string }

/**
 * Shows whether the backend health endpoint is reachable.
 *
 * Calls the API once on mount. The request is aborted on unmount; React
 * StrictMode mounts twice in development, so the first request is cancelled
 * and its result ignored rather than overwriting the second one.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    getHealth(controller.signal)
      .then((health) => setStatus({ state: 'ok', service: health.service }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message =
          error instanceof ApiError ? error.message : 'Unexpected error contacting the API.'
        setStatus({ state: 'error', message })
      })

    return () => controller.abort()
  }, [])

  return (
    <p role="status" aria-live="polite" className="text-sm font-medium">
      {status.state === 'loading' && 'Checking API…'}
      {status.state === 'ok' && `API is reachable (${status.service})`}
      {status.state === 'error' && `API unavailable: ${status.message}`}
    </p>
  )
}
