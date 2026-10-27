/**
 * Customer account endpoints, mirroring docs/api/customer-account.md (agreed
 * in #48; built in #82). This first part covers the profile and saved
 * addresses (#82 part 1, PR #87). Screens do not call these directly: the
 * customer adapters in `src/features/customer/real/` convert them
 * (docs/architecture/api-mapping.md). If the contract changes, update these
 * types in the same PR.
 */

import type { Page } from './adminOrders'
import { apiClient, type ApiClient } from './client'

/**
 * `GET /me/profile`. No email, photo, message switches or points: the pilot
 * leaves them out (customer-account.md, decisions 1-3 and 12).
 */
export interface CustomerProfileRead {
  name: string
  /** E.164, e.g. `+2348000000001`. */
  phone: string
  phone_verified: boolean
  /** `users.created_at`, UTC ISO timestamp. */
  customer_since: string
  stats: { orders: number; addresses: number }
}

/** The area (service zone) of a saved address; `is_active` is read live. */
export interface AddressZoneRead {
  id: string
  name: string
  is_active: boolean
}

export interface AddressRead {
  id: string
  label: string
  address: string
  landmark: string | null
  zone: AddressZoneRead
  is_default: boolean
  created_at: string
  updated_at: string
}

/** Body of `POST /me/addresses` and `PATCH /me/addresses/{id}`. */
export interface AddressInput {
  /** Trimmed, 1–50 characters (decision 13). */
  label: string
  /** Trimmed, 5–500 characters. */
  address: string
  /** Up to 200 characters; empty becomes `null`. */
  landmark: string | null
  /** Required: an address is saved only with an area (FR-020). */
  zone_id: string
  /** The first address is the default whatever this says. */
  make_default: boolean
}

/** Query parameters of `GET /me/addresses`. */
export interface AddressListParams {
  /** 1–100. */
  limit: number
  offset: number
}

/**
 * The signed-in customer's profile (`GET /api/v1/me/profile`).
 *
 * @throws {ApiError} 401 `not_authenticated`; 403 `forbidden` for staff and drivers.
 */
export function getProfile(signal?: AbortSignal, client: ApiClient = apiClient) {
  return client.request<CustomerProfileRead>('/api/v1/me/profile', { signal })
}

/** Saved addresses, default first, then newest (`GET /api/v1/me/addresses`). */
export function listAddresses(params: AddressListParams, signal?: AbortSignal, client: ApiClient = apiClient) {
  const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) })
  return client.request<Page<AddressRead>>(`/api/v1/me/addresses?${query}`, { signal })
}

/**
 * Save a new address (`POST /api/v1/me/addresses`).
 *
 * @throws {ApiError} 404 `service_zone_not_found`, 409 `address_limit_reached`
 *   (20 per customer), 422 `validation_error`.
 */
export function addAddress(input: AddressInput, client: ApiClient = apiClient) {
  return client.request<AddressRead>('/api/v1/me/addresses', { method: 'POST', body: input })
}

/**
 * Change a saved address (`PATCH /api/v1/me/addresses/{id}`).
 *
 * @throws {ApiError} 404 `address_not_found` or `service_zone_not_found`, 422 `validation_error`.
 */
export function updateAddress(id: string, input: AddressInput, client: ApiClient = apiClient) {
  return client.request<AddressRead>(`/api/v1/me/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
}

/**
 * Make an address the default (`POST /api/v1/me/addresses/{id}/default`).
 *
 * @throws {ApiError} 404 `address_not_found`.
 */
export function setDefaultAddress(id: string, client: ApiClient = apiClient) {
  return client.request<AddressRead>(`/api/v1/me/addresses/${encodeURIComponent(id)}/default`, { method: 'POST' })
}

/**
 * Remove a saved address (`DELETE /api/v1/me/addresses/{id}`, 204).
 *
 * @throws {ApiError} 404 `address_not_found`; 409 `default_address` for the
 *   default while other addresses exist (the last one may be removed, decision 5).
 */
export async function removeAddress(id: string, client: ApiClient = apiClient): Promise<void> {
  await client.request<null>(`/api/v1/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
