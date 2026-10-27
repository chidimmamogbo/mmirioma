/**
 * Customer support and account-deletion endpoints, mirroring
 * docs/api/customer-account.md ("Support requests", "Account deletion";
 * agreed in #48, built in #82 part 4). Screens do not call these directly:
 * the customer adapters in `src/features/customer/real/` convert them.
 */

import type { Page } from './adminOrders'
import { apiClient, type ApiClient } from './client'

export type SupportRequestType = 'late' | 'wrong_quantity' | 'payment' | 'rider' | 'other'

export interface SupportRequestRead {
  /** `SR-` and 8 random characters; not sequential (NFR-002). */
  reference: string
  type: SupportRequestType
  message: string
  /** The order the report is about, or `null`. */
  order_reference: string | null
  /** Staff resolve requests. */
  status: 'open' | 'resolved'
  /** UTC ISO timestamps. */
  created_at: string
  resolved_at: string | null
}

export interface SupportRequestCreate {
  type: SupportRequestType
  /** Trimmed, 3–1000 characters. */
  message: string
  /** Must be this customer's order, else 404 `order_not_found`. */
  order_reference: string | null
  /** One per report, reused on every retry (FR-026 pattern). */
  idempotency_key: string
}

/** Where a deletion request stands (privacy notice §9; customer-account.md, decision 10). */
export type DeletionRequestStatus = 'received' | 'acknowledged' | 'completed' | 'refused'

export interface DeletionRequestRead {
  /** `DR-` and 8 random characters, to quote when staff call back. */
  reference: string
  status: DeletionRequestStatus
  /** UTC ISO timestamp. */
  requested_at: string
  /** Lagos date `YYYY-MM-DD`: 3 working days after the request. */
  acknowledge_by: string
}

/** The customer's support requests, newest first (`GET /api/v1/me/support-requests`). */
export function listSupportRequests(params: { limit: number; offset: number }, signal?: AbortSignal, client: ApiClient = apiClient) {
  const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) })
  return client.request<Page<SupportRequestRead>>(`/api/v1/me/support-requests?${query}`, { signal })
}

/**
 * Send a support request (`POST /api/v1/me/support-requests`): 201, or 200
 * when the same key and body were already stored (a retry).
 *
 * @throws {ApiError} 404 `order_not_found`; 409 `idempotency_key_reused`; 422 `validation_error`.
 */
export function createSupportRequest(input: SupportRequestCreate, client: ApiClient = apiClient) {
  return client.request<SupportRequestRead>('/api/v1/me/support-requests', { method: 'POST', body: input })
}

/**
 * Ask for the account to be deleted (`POST /api/v1/me/deletion-request`):
 * 202, or 200 with the open request. Nothing is deleted until staff verify it.
 *
 * @throws {ApiError} 422 `validation_error` (reason over 500 characters).
 */
export function createDeletionRequest(reason: string | null, client: ApiClient = apiClient) {
  return client.request<DeletionRequestRead>('/api/v1/me/deletion-request', { method: 'POST', body: { reason } })
}

/**
 * The open deletion request (`GET /api/v1/me/deletion-request`).
 *
 * @throws {ApiError} 404 `deletion_request_not_found` when there is none.
 */
export function getDeletionRequest(signal?: AbortSignal, client: ApiClient = apiClient) {
  return client.request<DeletionRequestRead>('/api/v1/me/deletion-request', { signal })
}
