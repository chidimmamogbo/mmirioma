/**
 * Admin order cancellation adapters (#176): the real-API side of
 * `getCancellationOutcome` and `cancelOrder` in `adminApi.ts`, over the typed
 * calls in `lib/api/adminHolds.ts` (docs/api/deliveries.md, "GET
 * .../cancellation-outcome" and "POST .../transition (fail and cancel)").
 *
 * The agreed cancel has one reason, `mmirioma_unable` (FR-044): nothing else
 * is offered until #174 adds one.
 */
import { apiClient, type ApiClient } from '../../../lib/api/client'
import * as holds from '../../../lib/api/adminHolds'
import type { AdminOrderStatus } from '../../../lib/api/adminOrders'

export type { CancellationOutcome } from '../../../lib/api/adminHolds'

export interface CancelRequest {
  /** The backend status the panel loaded, so a changed order is refused (409). */
  expected_status: string
  note: string | null
  /** From the order detail: none; the cancel closes any open hold (admin-order-cancellation.md, decision 5). */
  hold_id: string | null
}

/**
 * What cancelling would cost the customer: the server's sentence, shown as written.
 *
 * @throws {ApiError} 409 `invalid_order_transition` (the order can no longer be cancelled); 404 `order_not_found`.
 */
export function getCancellationOutcome(reference: string, client: ApiClient = apiClient): Promise<holds.CancellationOutcome> {
  return holds.getCancellationOutcome(reference, undefined, client)
}

/**
 * Cancel the order with `mmirioma_unable`.
 *
 * @throws {ApiError} 409 `invalid_order_transition` (the order changed); 422
 *   `validation_error`; 403 `csrf_failed`; `network_error`.
 */
export async function cancelOrder(reference: string, request: CancelRequest, client: ApiClient = apiClient): Promise<void> {
  await holds.transitionOrder(
    reference,
    {
      to: 'cancelled',
      expected_status: request.expected_status as AdminOrderStatus,
      reason_code: 'mmirioma_unable',
      note: request.note,
      hold_id: request.hold_id,
    },
    client,
  )
}
