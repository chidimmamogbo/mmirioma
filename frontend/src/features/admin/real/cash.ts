/**
 * Admin cash adapters (K3 to K5, docs/design/admin-cash.md, #19).
 *
 * The cash screens are new and were drawn for the agreed contract
 * (docs/api/payments.md), so they use its types as they are: there is no
 * older design type to convert to, and nothing is renamed or filled in. Each
 * adapter only fetches with the shared client; failures pass through as
 * `ApiError` for the screens' error states (docs/architecture/api-mapping.md,
 * "Writing an adapter").
 */
import {
  correctCollection as postCorrection,
  getCashDay as fetchCashDay,
  getDriverCash as fetchDriverCash,
  receiveCash as postRemittance,
  reconcileCollections as postReconciliation,
  type AdminCashCollection,
  type CashDay,
  type CorrectionRequest,
  type DriverCash,
  type ReceiveRequest,
  type ReconcileRequest,
  type Remittance,
} from '../../../lib/api/adminCash'
import { apiClient, type ApiClient } from '../../../lib/api/client'

/**
 * The cash page for one Lagos day (`GET /admin/cash?date=`).
 *
 * @param date - Lagos calendar date, `YYYY-MM-DD`.
 * @param client - The API client; tests pass one with a fake `fetch`.
 * @throws {ApiError} As the server sends it (401, 403, 422, network).
 */
export function getCashDay(date: string, client: ApiClient = apiClient): Promise<CashDay> {
  return fetchCashDay(date, undefined, client)
}

/**
 * A driver's cash on hand, to receive (`GET /admin/cash/drivers/{id}`).
 *
 * @throws {ApiError} `driver_not_found` (404), and the shared errors.
 */
export function getDriverCash(driverId: string, client: ApiClient = apiClient): Promise<DriverCash> {
  return fetchDriverCash(driverId, undefined, client)
}

/**
 * Correct a recorded amount before it is received (approved decision 6).
 *
 * @throws {ApiError} `cash_collection_not_found` (404), `cash_collection_changed` (409), `validation_error` (422).
 */
export function correctCollection(collectionId: string, request: CorrectionRequest, client: ApiClient = apiClient): Promise<AdminCashCollection> {
  return postCorrection(collectionId, request, client)
}

/**
 * Receive cash from one driver; sets each order's payment status (BR-07).
 *
 * @throws {ApiError} `driver_not_found` (404), `cash_collection_changed` (409), `validation_error` (422).
 */
export function receiveCash(request: ReceiveRequest, client: ApiClient = apiClient): Promise<Remittance> {
  return postRemittance(request, client)
}

/**
 * Reconcile received records. Never changes a payment status.
 *
 * @throws {ApiError} `cash_collection_changed` (409), `validation_error` (422).
 */
export function reconcileCollections(request: ReconcileRequest, client: ApiClient = apiClient): Promise<AdminCashCollection[]> {
  return postReconciliation(request, client)
}
