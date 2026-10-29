/**
 * Driver cash adapters (#20): the real-API side of the cash functions in
 * `partnerApi.ts`, over the typed calls in `lib/api/driverCash.ts`
 * (docs/api/payments.md, "Driver endpoints"; design
 * docs/design/driver-cash.md, K1 and K2).
 *
 * The screens use the contract's own shapes (`DriverCash`, `CashCollection`,
 * the job's `cash`), so nothing is converted. Errors pass through as
 * `ApiError` for the screens to word.
 */
import { apiClient, type ApiClient } from '../../../lib/api/client'
import * as driverCash from '../../../lib/api/driverCash'

export type { CashCollection, DriverCash, JobCash, RecordCashRequest } from '../../../lib/api/driverCash'

/**
 * The signed-in partner's cash (K2 home card and My cash).
 *
 * @throws {ApiError} `invalid_response`; shared 401/403; `network_error`.
 */
export function getMyCash(client: ApiClient = apiClient): Promise<driverCash.DriverCash> {
  return driverCash.getMyCash(undefined, client)
}

/**
 * Record the cash the customer paid (K1 Record cash). A repeat of the same
 * amount and note answers with the same record, so "Try again" is safe.
 *
 * @throws {ApiError} 409 `cash_already_recorded` or
 *   `transition_requirements_unmet`; 404 `order_not_found`; 422
 *   `validation_error`; 403 `csrf_failed`; `network_error`.
 */
export function recordCash(reference: string, request: driverCash.RecordCashRequest, client: ApiClient = apiClient): Promise<driverCash.CashCollection> {
  return driverCash.recordCash(reference, request, client)
}

/**
 * Mark the chosen records ready to hand over (K2 Hand over cash).
 *
 * @throws {ApiError} 409 `cash_collection_changed`; 422 `validation_error`;
 *   403 `csrf_failed`; `network_error`.
 */
export function handOverCash(collectionIds: string[], client: ApiClient = apiClient): Promise<driverCash.DriverCash> {
  return driverCash.handOverCash(collectionIds, client)
}
