/**
 * Admin dispatch adapters (#16): the real-API side of `listEligibleRiders`
 * and `assignOrder` in `adminApi.ts`, from docs/api/deliveries.md, "Admin
 * dispatch endpoints".
 *
 * Withdraw and cancel are not linked here: "Cancel this order" cancels the
 * whole order, which is a transition (`real/holds.ts`, #176), not a withdraw,
 * and the screen has no withdraw control yet.
 */
import type { AdminOrder, EligibleRider } from '../../../domain/admin'
import { assignDriver, listDispatchDrivers, type DispatchDriver } from '../../../lib/api/adminDispatch'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { adminOrderFromRead } from './orders'

/**
 * A driver the order can be offered to, as the design's eligible rider.
 *
 * Only drivers with no eligibility problem are listed, so two values follow
 * from the contract's reasons: such a driver is not `unavailable` (online)
 * and not `busy` (no live job). The rest is not sent and stays empty: the
 * vehicle type is the profile's free text, the backend has no rating, and
 * service areas are not checked yet (deliveries.md, "Driver eligibility").
 */
export function eligibleRiderFromDriver(driver: DispatchDriver): EligibleRider {
  const type = driver.vehicle?.type
  return {
    id: driver.id,
    name: driver.name,
    vehicle: type === 'keke' || type === 'tanker' ? type : null,
    rating: null,
    active_orders: 0,
    online: true,
    works_in_area: null,
  }
}

/**
 * The drivers who can take this order now, in the server's order (by name).
 *
 * @throws {ApiError} 404 `order_not_found`; as the server sends it.
 */
export async function listEligibleRiders(reference: string, client: ApiClient = apiClient): Promise<EligibleRider[]> {
  const drivers = await listDispatchDrivers(reference, undefined, client)
  return drivers.filter((d) => d.reasons.length === 0).map(eligibleRiderFromDriver)
}

/**
 * Offer the order to a driver (row 8). The driver has not accepted yet.
 *
 * @throws {ApiError} 409 `invalid_order_transition` as "This order has
 *   changed." (the contract's client wording); 409 `driver_not_eligible`,
 *   404 `driver_not_found` / `order_not_found` as the server sends them.
 */
export async function assignOrder(reference: string, driverId: string, client: ApiClient = apiClient): Promise<AdminOrder> {
  try {
    return adminOrderFromRead(await assignDriver(reference, driverId, client))
  } catch (error) {
    if (error instanceof ApiError && error.code === 'invalid_order_transition') {
      throw new ApiError({ kind: error.kind, status: error.status, code: error.code, message: 'This order has changed.', details: error.details, cause: error })
    }
    throw error
  }
}
