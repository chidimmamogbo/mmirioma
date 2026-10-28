/**
 * Live prices for customers, mirroring the order details and price contract
 * (docs/api/order-details-and-price.md, "POST /quotes", agreed in #42, built
 * in #21) and the area list (docs/api/admin-directory.md, "GET
 * /service-zones"). Screens do not call these directly: the customer adapter
 * in `src/features/customer/real/quote.ts` converts them (#121).
 */
import { apiClient, type ApiClient } from './client'
import type { DeliveryType, KekeDetails, TankerDetails, WaterSourcePreference } from './orders'

/** An area someone can pick (FR-020): active zones only, sorted by name. */
export interface ServiceZoneOption {
  id: string
  name: string
}

/** Body of `GET /service-zones`. */
export interface ServiceZoneOptionList {
  items: ServiceZoneOption[]
}

/**
 * `QuoteCreate`, the body of `POST /quotes`: the same delivery details as
 * `OrderCreate`, with the address required (no price without it, #42). No
 * category field: the server prices the pilot category.
 */
export interface QuoteCreate {
  delivery_type: DeliveryType
  keke?: KekeDetails
  tanker?: TankerDetails
  /** Required for Tanker, absent for Keke. */
  water_source?: WaterSourcePreference
  /** 5–500 characters after trimming. */
  delivery_address: string
  /** The picked zone, or absent when the address is in no listed zone (answers `outside_service_zone`). */
  service_zone_id?: string
}

/** The pilot category's label and supported uses (FR-023). */
export interface QuoteCategoryRead {
  label: string
  supported_uses: string | null
}

/** A server price: the payable total only (decision 6), valid until a time. */
export interface QuoteAvailableRead {
  status: 'quote_available'
  quote_id: string
  currency: 'NGN'
  /** The server's conversion (FR-021); the screen shows this, not its own. */
  quantity_litres: number
  water_category: QuoteCategoryRead
  /** Integer kobo, a whole number of naira (FR-022). */
  total_minor_units: number
  /** UTC ISO timestamp; after it the quote cannot be ordered (SRS §8). */
  price_valid_until: string
}

/** No reliable price (SRS §6): a reason code, never a number. */
export interface QuoteManualRead {
  status: 'manual_quote_required'
  quote_id: null
  quantity_litres: number
  /**
   * `outside_service_zone`, `category_unavailable`, `no_eligible_source`,
   * `no_vehicle_plan`, `delivery_cost_unavailable` or `no_price_rule`. Typed
   * as a string: the server may add one, and the app shows a generic message.
   */
  reason: string
}

export type QuoteRead = QuoteAvailableRead | QuoteManualRead

/** The areas a customer can pick (`GET /api/v1/service-zones`); no sign-in needed. */
export function listServiceZones(signal?: AbortSignal, client: ApiClient = apiClient) {
  return client.request<ServiceZoneOptionList>('/api/v1/service-zones', { signal })
}

/**
 * Price a choice on the server (`POST /api/v1/quotes`, FR-022). A manual
 * quote is a 200 answer, not an error. Every call counts toward the limit of
 * 30 per customer per 10 minutes (NFR-002).
 *
 * @throws {ApiError} 404 `service_zone_not_found`; 422 `validation_error`;
 *   429 `too_many_attempts` (`details.retry_after_seconds`).
 */
export function createQuote(input: QuoteCreate, client: ApiClient = apiClient) {
  return client.request<QuoteRead>('/api/v1/quotes', { method: 'POST', body: input })
}
