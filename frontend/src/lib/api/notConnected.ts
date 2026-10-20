import { ApiError } from './client'

/**
 * Error for a feature whose backend endpoint does not exist yet. Thrown by
 * typed API functions in real-API mode, so a screen shows its error state
 * instead of pretending to work (CLAUDE.md: no stub features that look
 * operational). Remove the call once the endpoint and its contract exist.
 *
 * @param feature - Short name for logs and the message, e.g. "Saved addresses".
 */
export function notConnected(feature: string): Promise<never> {
  return Promise.reject(
    new ApiError({
      kind: 'config',
      status: null,
      code: 'not_connected',
      message: `${feature} is not connected to the server yet.`,
    }),
  )
}
