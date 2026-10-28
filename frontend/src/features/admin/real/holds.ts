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
import * as holds from '../../../lib/api/adminHolds'

export type { HoldReview, ProofOverrideRequest } from '../../../lib/api/adminHolds'

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
