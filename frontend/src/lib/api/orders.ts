/**
 * Customer order endpoints, mirroring docs/api/orders.md and the order
 * details and price contract (docs/api/order-details-and-price.md, agreed in
 * #42, built in #21). Screens do not call these directly: the customer
 * adapters in `src/features/customer/real/` convert them to the design's
 * types (docs/architecture/api-mapping.md). If a contract changes, update
 * these types in the same PR.
 */

import type { AdminOrderStatus, Page } from './adminOrders'
import { apiClient, type ApiClient } from './client'

export type { OrderStatus, Page } from './adminOrders'

export type DeliveryType = 'keke' | 'tanker'
export type TankType = 'ground' | 'overhead'
/** The customer's source preference, Tanker only; never a quality claim (FR-014). */
export type WaterSourcePreference = 'ninth_mile' | 'borehole'

export interface KekeDetails {
  can_size_litres: 25 | 50
  /** At least 1; `can_size_litres × can_count` must reach 600 L (FR-021). */
  can_count: number
}

export interface TankerDetails {
  tank_type: TankType
  /** 150–25000; the server stores × 4 litres (FR-021). */
  quantity_local_gallons: number
}

/** The quote an order was placed with (FR-024): the total only, never a breakdown. */
export interface OrderQuoteRead {
  currency: 'NGN'
  /** Integer kobo, a whole number of naira (FR-022). */
  total_minor_units: number
  /** The category accepted at checkout; `label` is frozen with the quote. */
  water_category: { label: string; supported_uses: string | null }
}

/**
 * `OrderRead`, the customer's view of their own order. The delivery details
 * are `null` on orders sent before #21 (quantity only), and `quote` is `null`
 * for a quote request (FR-022 manual fallback).
 */
export interface OrderRead {
  /** Public-safe reference, e.g. `MO-7KQ2M9XH4T` (FR-027). */
  reference: string
  /**
   * Any order status (docs/api/deliveries.md). The server may add one the app
   * does not know yet; clients must never fail on it (docs/api/orders.md).
   */
  status: AdminOrderStatus
  /** Whole litres, always (FR-021). */
  quantity_litres: number
  /** Person receiving the delivery; may differ from the account holder. */
  contact_name: string
  /** E.164, e.g. `+2348000000001`. */
  contact_phone: string
  delivery_address: string
  landmark: string | null
  delivery_instructions: string | null
  /** Lagos calendar date `YYYY-MM-DD`. A preference, not a booked slot. */
  preferred_delivery_date: string | null
  /** UTC ISO timestamp. */
  created_at: string
  updated_at: string
  delivery_type: DeliveryType | null
  keke: KekeDetails | null
  tanker: TankerDetails | null
  water_source: WaterSourcePreference | null
  service_zone: { id: string; name: string } | null
  quote: OrderQuoteRead | null
  /**
   * The customer's feedback on the order (FR-051), or `null`. Sent since #82
   * part 3; absent from an older server, so read it as missing then.
   */
  feedback?: FeedbackRead | null
}

/**
 * Body of `PUT /orders/{reference}/feedback` (customer-account.md, "Order
 * feedback"). The design asks for `rating` and `poured_by_partner`; the
 * other answers stay optional (decision 7).
 */
export interface FeedbackInput {
  /** 1-5. */
  rating: number
  /** Did the rider or driver unload the water (FR-051, BR-04). */
  poured_by_partner: boolean
  on_time?: boolean | null
  quantity_as_ordered?: boolean | null
  would_reorder?: boolean | null
  /** Up to 500 characters. */
  message?: string | null
}

/** One order's feedback, as stored. */
export interface FeedbackRead {
  rating: number
  poured_by_partner: boolean
  on_time: boolean | null
  quantity_as_ordered: boolean | null
  would_reorder: boolean | null
  message: string | null
  /** UTC ISO timestamps. */
  submitted_at: string
  updated_at: string
}

/**
 * `OrderCreate`, the body of `POST /orders`. It has no price, status,
 * customer or simulated fields: the server sets them, and the quantity comes
 * from the delivery details. Optional fields are left out when empty. Without
 * a `quote_id` the order is a quote request (`quote_requested`).
 */
export interface OrderCreate {
  /**
   * One UUID per request form, reused on every retry so a request is never
   * created twice (FR-026, T-06; customer design Decision 9).
   */
  idempotency_key: string
  delivery_type: DeliveryType
  keke?: KekeDetails
  tanker?: TankerDetails
  /** Required for Tanker, absent for Keke. */
  water_source?: WaterSourcePreference
  /** The zone the customer picked (FR-020); absent when they picked none. */
  service_zone_id?: string
  /** A valid quote from `POST /quotes`; absent for a quote request. */
  quote_id?: string
  /** 1–100 characters after trimming. */
  contact_name: string
  /** Any Nigerian mobile format; the server normalizes it. */
  contact_phone: string
  /** 5–500 characters after trimming. */
  delivery_address: string
  /** Up to 200 characters. */
  landmark?: string
  /** Up to 500 characters. */
  delivery_instructions?: string
  /** `YYYY-MM-DD`, today or later in Africa/Lagos. */
  preferred_delivery_date?: string
}

/** Query parameters of `GET /orders`. */
export interface OrderListParams {
  /** 1–100. */
  limit: number
  offset: number
}

/**
 * Send a water request (`POST /api/v1/orders`).
 *
 * @returns The order: 201 when created, 200 when the same key and body were
 *   already stored (an idempotent retry).
 * @throws {ApiError} 403 `phone_not_verified` (FR-003), 409
 *   `idempotency_key_reused` (the key was stored with a different body), 422
 *   `validation_error`, 403 `csrf_failed`, 401 `not_authenticated`.
 */
export function createOrder(input: OrderCreate, client: ApiClient = apiClient) {
  return client.request<OrderRead>('/api/v1/orders', { method: 'POST', body: input })
}

/**
 * List the signed-in customer's own orders, newest first (`GET /api/v1/orders`).
 *
 * @throws {ApiError} 422 `validation_error` for an out-of-range `limit`.
 */
export function listOrders(
  params: OrderListParams,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
) {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  })
  return client.request<Page<OrderRead>>(`/api/v1/orders?${query}`, { signal })
}

/**
 * Rate a delivered order (`PUT /api/v1/orders/{reference}/feedback`, FR-051).
 * One feedback per order: 201 the first time, 200 when it replaces the
 * earlier one, so a double tap never adds a second.
 *
 * @throws {ApiError} 404 `order_not_found`; 409 `order_not_delivered`; 422 `validation_error`.
 */
export function putOrderFeedback(reference: string, input: FeedbackInput, client: ApiClient = apiClient) {
  return client.request<FeedbackRead>(`/api/v1/orders/${encodeURIComponent(reference)}/feedback`, { method: 'PUT', body: input })
}

/**
 * Load one of the customer's orders (`GET /api/v1/orders/{reference}`).
 *
 * @throws {ApiError} 404 `order_not_found`, also for another customer's
 *   order, so references cannot be probed (FR-001, T-07).
 */
export function getOrder(reference: string, signal?: AbortSignal, client: ApiClient = apiClient) {
  return client.request<OrderRead>(`/api/v1/orders/${encodeURIComponent(reference)}`, {
    signal,
  })
}

/** One status change of the customer's order (#155): the new status (any, as `OrderRead.status`) and when (UTC). */
export interface OrderHistoryEntry {
  status: AdminOrderStatus
  at: string
}

/**
 * Every status change of one of the customer's orders, oldest first
 * (`GET /api/v1/orders/{reference}/history`, #155).
 *
 * @throws {ApiError} 404 `order_not_found`, also for another customer's order (T-07).
 */
export function getOrderHistory(reference: string, signal?: AbortSignal, client: ApiClient = apiClient) {
  return client.request<{ items: OrderHistoryEntry[] }>(`/api/v1/orders/${encodeURIComponent(reference)}/history`, { signal })
}
