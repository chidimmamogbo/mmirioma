/**
 * Backend order status to the customer's delivery stage.
 *
 * The first `real/` module: a pure conversion with no fetching, which the
 * customer order adapters (#9) build on. The table is the "Customer order
 * stage" section of docs/architecture/api-mapping.md; change both together.
 */
import type { DeliveryStage } from '../../../domain/orders'
import type { AdminOrderStatus } from '../../../lib/api/adminOrders'

const STAGE_BY_STATUS: Record<AdminOrderStatus, DeliveryStage> = {
  // Before confirmation: never "Waiting for rider" (customer-live-prices.md, decision 3; FR-027).
  quote_requested: 'request_received',
  awaiting_confirmation: 'awaiting_confirmation',
  confirmed: 'waiting_rider',
  awaiting_payment: 'waiting_rider',
  // FR-032: the customer must not learn of an assignment before the driver accepts.
  assigned: 'waiting_rider',
  accepted: 'rider_assigned',
  departed: 'rider_assigned',
  collected: 'picked_up',
  en_route: 'on_the_way',
  arrived: 'on_the_way',
  unloading: 'on_the_way',
  delivered: 'delivered',
  cancelled: 'cancelled',
  failed: 'failed',
  disputed: 'under_review',
}

/**
 * The customer stage for a backend order status.
 *
 * @param status - `status` exactly as the backend sent it. Typed as a string
 *   because the server may add statuses the app does not know yet, and
 *   clients must never fail on one (docs/api/orders.md).
 * @returns The stage, or `null` for an unknown status. The caller decides the
 *   fallback screen (api-mapping.md, open question 3).
 */
export function customerStageFromStatus(status: string): DeliveryStage | null {
  return Object.hasOwn(STAGE_BY_STATUS, status) ? STAGE_BY_STATUS[status as AdminOrderStatus] : null
}
