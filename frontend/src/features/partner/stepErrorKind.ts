import { ApiError } from '../../lib/api/client'

/** What went wrong with a trip step, in the words the arrival design uses. */
export type StepErrorKind = 'paused' | 'changed' | 'reassigned' | 'not_sent' | 'other'

/**
 * Sorts a failed trip-step request: the job is paused (409 `job_on_hold`), the
 * job is no longer at this step (409 `invalid_order_transition`), the job was
 * reassigned (404 `order_not_found`), the request did not reach the server, or
 * anything else.
 */
export function stepErrorKind(error: unknown): StepErrorKind {
  if (!(error instanceof ApiError)) return 'other'
  if (error.kind === 'network') return 'not_sent'
  if (error.code === 'job_on_hold') return 'paused'
  if (error.code === 'invalid_order_transition') return 'changed'
  if (error.code === 'order_not_found') return 'reassigned'
  return 'other'
}
