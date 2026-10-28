/**
 * Admin hold review adapters (#166): the real-API side of the hold functions
 * in `adminApi.ts`, over the typed calls in `lib/api/adminHolds.ts`
 * (docs/api/deliveries.md, "Admin hold review endpoints").
 *
 * The evidence is shown as the server sends it, so nothing is converted. A
 * decision returns the whole order; the screens only need to know it
 * succeeded, then refresh, so the adapters return nothing.
 */
import { apiClient, type ApiClient } from '../../../lib/api/client'
import { withdrawAssignment, type WithdrawRequest } from '../../../lib/api/adminDispatch'
import * as holds from '../../../lib/api/adminHolds'

export type { HoldDecisionRequest, HoldReview, ProofOverrideRequest } from '../../../lib/api/adminHolds'
export type { WithdrawRequest } from '../../../lib/api/adminDispatch'

/**
 * The evidence for the order's open hold.
 *
 * @throws {ApiError} 404 `hold_not_found` (decided meanwhile) or `order_not_found`; `invalid_response`.
 */
export function getHoldReview(reference: string, client: ApiClient = apiClient): Promise<holds.HoldReview> {
  return holds.getHoldReview(reference, undefined, client)
}

/**
 * Approve or reject alternative proof.
 *
 * @throws {ApiError} 403 `own_delivery_override` (approve only); 409
 *   `hold_not_open` or `invalid_order_transition`; 422 `validation_error`;
 *   403 `csrf_failed`; `network_error`.
 */
export async function decideProof(reference: string, request: holds.ProofOverrideRequest, client: ApiClient = apiClient): Promise<void> {
  await holds.decideProof(reference, request, client)
}

/**
 * Let the driver continue after a source review. The server checks the source
 * again, so this can be refused after the sheet showed it as usable.
 *
 * @throws {ApiError} 409 `source_not_eligible` (its message is the server's
 *   sentence; `details.answer` is the new answer) or `hold_not_open`; 422
 *   `validation_error`; 403 `csrf_failed`; `network_error`.
 */
export async function continueSource(reference: string, request: holds.HoldDecisionRequest, client: ApiClient = apiClient): Promise<void> {
  await holds.continueSource(reference, request, client)
}

/**
 * Resume after an unsafe stop; the note is the safe alternative.
 *
 * @throws {ApiError} 409 `hold_not_open`; 422 `validation_error`; 403 `csrf_failed`; `network_error`.
 */
export async function resumeUnsafe(reference: string, request: holds.HoldDecisionRequest, client: ApiClient = apiClient): Promise<void> {
  await holds.resumeUnsafe(reference, request, client)
}

/**
 * Take the job back from the driver before they leave (`withdraw_allowed`),
 * which also closes the unsafe stop.
 *
 * @throws {ApiError} 404 `assignment_not_found` ("This order has no driver
 *   assigned"); 409 `invalid_order_transition`; 403 `csrf_failed`; `network_error`.
 */
export async function withdrawJob(reference: string, request: WithdrawRequest, client: ApiClient = apiClient): Promise<void> {
  await withdrawAssignment(reference, request, client)
}
