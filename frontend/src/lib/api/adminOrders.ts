/**
 * Types and typed calls for the admin order endpoints, mirroring
 * docs/api/orders.md (agreed in S1-16).
 *
 * The endpoints are being built in S1-03 part 2. The admin UI reads through an
 * `AdminOrdersSource` (src/features/admin-orders/source.ts): the mock source
 * until the endpoints exist, then the API source built on these functions
 * (S1-10). If the contract changes, update these types in the same PR.
 */

import { apiClient, ApiError, type ApiClient } from './client'
import { orderHoldSchema, type OrderHold } from './holdTypes'
import type { DeliveryType, KekeDetails, OrderQuoteRead, TankerDetails, WaterSourcePreference } from './orders'

/**
 * Order statuses from FR-033 that the customer screens can show. Terminal:
 * `delivered`, `cancelled`, `failed`. The four SRS v0.2 statuses are in
 * `AdminOrderStatus` only: their customer wording is still "Pending design"
 * in docs/api/orders.md.
 */
export type OrderStatus =
  | 'quote_requested'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'assigned'
  | 'accepted'
  | 'collected'
  | 'en_route'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'disputed'

/**
 * Every order status staff can see: `OrderStatus` plus the four SRS v0.2
 * statuses (docs/api/deliveries.md). No endpoint returns the new four yet;
 * their staff labels come from the admin dispatch design (Decision 1).
 */
export type AdminOrderStatus = OrderStatus | 'awaiting_payment' | 'departed' | 'arrived' | 'unloading'

/** Customer account behind an order (admin view only). */
export interface AdminOrderCustomer {
  id: string
  name: string
  /** E.164, e.g. `+2348000000001`. */
  phone: string
  /** Whether the phone was verified (FR-003). */
  phone_verified: boolean
}

/**
 * `AdminOrderRead`. Sprint 1 orders carry no price: they are manual quote
 * requests until the quotes module exists (FR-021, FR-022).
 */
export interface AdminOrderRead {
  id: string
  /** Public-safe reference, e.g. `MO-7KQ2M9XH4T` (FR-027). */
  reference: string
  status: AdminOrderStatus
  quantity_litres: number
  /** Person receiving the delivery; may differ from the account holder. */
  contact_name: string
  contact_phone: string
  delivery_address: string
  landmark: string | null
  delivery_instructions: string | null
  /** Lagos calendar date `YYYY-MM-DD`. A preference, not a booked slot. */
  preferred_delivery_date: string | null
  /** UTC ISO timestamp. */
  created_at: string
  updated_at: string
  customer: AdminOrderCustomer
  /** Demo/test record, excluded from real metrics (BR-09). */
  is_simulated: boolean
  /**
   * The open hold on the order's current job, or `null` (admin hold review,
   * R0). A hold is not a status: the order keeps its status while it is open.
   */
  hold: OrderHold | null
  /** Delivery details (#21): `null` on orders sent before them (quantity only). */
  delivery_type: DeliveryType | null
  keke: KekeDetails | null
  tanker: TankerDetails | null
  water_source: WaterSourcePreference | null
  /** The zone the customer picked (FR-020), or `null`. */
  service_zone: { id: string; name: string } | null
  /** The quote the order was placed with (FR-024), or `null` for a quote request. */
  quote: AdminOrderQuoteRead | null
}

/**
 * The order's quote as staff see it: the customer's view plus the category's
 * `id`, which a quoted order is confirmed with (deliveries.md, amendment #72).
 * Optional: an older server does not send it.
 */
export type AdminOrderQuoteRead = OrderQuoteRead & {
  water_category: OrderQuoteRead['water_category'] & { id?: string }
}

/** Standard list envelope (docs/api/README.md "Pagination"). */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/** Query parameters of `GET /admin/orders`. */
export interface AdminOrderListParams {
  /** Any of these statuses; empty means all. Sent as repeated `status=`. */
  status: AdminOrderStatus[]
  /** Inclusive Lagos calendar date `YYYY-MM-DD`. */
  created_from?: string
  /** Inclusive Lagos calendar date `YYYY-MM-DD`. */
  created_to?: string
  /** `true`: only demo records; `false`: only real orders; omitted: both (BR-09). */
  is_simulated?: boolean
  /** `true`: only orders whose job has an open hold (any kind); omitted: all (R0). */
  on_hold?: boolean
  /** 1–100. */
  limit: number
  offset: number
}

/**
 * Build the query string of `GET /admin/orders`.
 *
 * `status` is repeated once per value; optional filters are left out when
 * unset, so the server applies its defaults (all statuses, all dates, both
 * real and simulated records).
 *
 * @param params - Filters and paging.
 * @returns The query string without the leading `?`.
 */
export function adminOrderListQuery(params: AdminOrderListParams): string {
  const query = new URLSearchParams()
  params.status.forEach((status) => query.append('status', status))
  if (params.created_from) query.set('created_from', params.created_from)
  if (params.created_to) query.set('created_to', params.created_to)
  if (params.is_simulated !== undefined) {
    query.set('is_simulated', String(params.is_simulated))
  }
  if (params.on_hold !== undefined) query.set('on_hold', String(params.on_hold))
  query.set('limit', String(params.limit))
  query.set('offset', String(params.offset))
  return query.toString()
}

/**
 * List orders for staff, newest first (`GET /api/v1/admin/orders`).
 *
 * Each order's `hold` drives the On hold tag, so it is checked with Zod like
 * the detail's (`adminDispatch.ts`); a missing field reads as no hold.
 *
 * @param params - Filters and paging.
 * @param signal - Cancels the request (TanStack Query passes one).
 * @param client - Override for tests; defaults to the shared client.
 * @throws {ApiError} `validation_error` (422) for bad filters;
 *   `invalid_response` for an unknown hold; shared 401/403.
 */
export async function listAdminOrders(
  params: AdminOrderListParams,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<Page<AdminOrderRead>> {
  const page = await client.request<Page<AdminOrderRead>>(
    `/api/v1/admin/orders?${adminOrderListQuery(params)}`,
    { signal },
  )
  return { ...page, items: page.items.map((order) => ({ ...order, hold: checkedHold(order.hold) })) }
}

function checkedHold(value: unknown): OrderHold | null {
  const result = orderHoldSchema.nullable().safeParse(value ?? null)
  if (!result.success) {
    throw new ApiError({
      kind: 'parse',
      status: 200,
      code: 'invalid_response',
      message: 'The server returned an unexpected response.',
      cause: result.error,
    })
  }
  return result.data
}

// One order (`GET /admin/orders/{reference}`) now returns `AdminOrderDetail`,
// with its assignment: see `getAdminOrderDetail` in adminDispatch.ts.
