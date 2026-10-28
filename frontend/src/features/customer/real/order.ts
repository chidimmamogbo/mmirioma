/**
 * Customer order adapters (#9): the real-API side of `createOrder`,
 * `listOrders` and `getOrder` in `customerApi.ts`.
 *
 * Conversions follow docs/architecture/api-mapping.md and the agreed
 * contracts (docs/api/orders.md, docs/api/order-details-and-price.md). A
 * field the backend does not send becomes the screen's empty state, never an
 * invented value.
 */
import {
  STAGE_LABEL,
  TANK_SIZES,
  type CustomerOrder,
  type DeliveryStage,
  type TankSizeGallons,
  type TimelineEvent,
  type WaterChoice,
} from '../../../domain/orders'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import {
  createOrder as postOrder,
  getOrder as fetchOrder,
  getOrderHistory as fetchOrderHistory,
  listOrders as fetchOrders,
  putOrderFeedback,
  type OrderCreate,
  type OrderHistoryEntry,
  type OrderRead,
} from '../../../lib/api/orders'
import type { CreateOrderInput } from '../../../mocks/customerMock'
import { customerStageFromStatus } from './orderStage'

/** Page size when loading every order: the contract's maximum (docs/api/README.md, Pagination). */
const PAGE_LIMIT = 100

function isStandardTankSize(gallons: number): gallons is TankSizeGallons {
  return (TANK_SIZES as number[]).includes(gallons)
}

/**
 * The design's water choice for a backend order, or `null` when the order
 * has no delivery details (sent before #21) or they are incomplete.
 */
export function choiceFromRead(read: Pick<OrderRead, 'delivery_type' | 'keke' | 'tanker' | 'water_source'>): WaterChoice | null {
  if (read.delivery_type === 'keke' && read.keke) {
    return { delivery_type: 'keke', can_size_litres: read.keke.can_size_litres, can_count: read.keke.can_count }
  }
  if (read.delivery_type === 'tanker' && read.tanker && read.water_source) {
    const gallons = read.tanker.quantity_local_gallons
    return {
      delivery_type: 'tanker',
      tank_type: read.tanker.tank_type,
      // Any other size is a custom one; its litres stay in `quantity_litres`.
      tank_size_gallons: isStandardTankSize(gallons) ? gallons : null,
      source: read.water_source,
    }
  }
  return null
}

/**
 * The price the order shows: the confirmed price once a dispatcher has
 * confirmed it (#99), else the quote the order was placed with, else `null`
 * for a quote request still waiting for its price (FR-022 manual fallback).
 * Total only, never a breakdown (order-details-and-price.md, decision 6).
 */
export function priceFromRead(read: Pick<OrderRead, 'quote' | 'price' | 'water_category'>): CustomerOrder['quote'] {
  if (read.price) {
    return {
      currency: read.price.currency,
      total_minor_units: read.price.total_minor_units,
      water: null,
      delivery: null,
      is_sample: false,
      // The label frozen with the confirmed price (FR-014, FR-024).
      category_label: read.water_category?.label ?? read.quote?.water_category.label ?? null,
    }
  }
  if (read.quote) {
    return {
      currency: read.quote.currency,
      total_minor_units: read.quote.total_minor_units,
      water: null,
      delivery: null,
      is_sample: false,
      // The category accepted with the price (FR-023), shown on "Order placed".
      category_label: read.quote.water_category.label,
    }
  }
  return null
}

/** Backend order to the design's order (docs/architecture/api-mapping.md). */
export function customerOrderFromRead(read: OrderRead): CustomerOrder {
  return {
    reference: read.reference,
    created_at: read.created_at,
    choice: choiceFromRead(read),
    quantity_litres: read.quantity_litres,
    // The order stores the address text only, not the saved address's name.
    address_label: null,
    address: read.delivery_address,
    landmark: read.landmark,
    receiver_name: read.contact_name,
    receiver_phone: read.contact_phone,
    instructions: read.delivery_instructions,
    // Unknown status: the neutral "Order update" stage (docs/api/orders.md, #82).
    stage: customerStageFromStatus(read.status) ?? 'order_update',
    // Every pilot order is pay on delivery (F4); customers are not sent a
    // payment status yet (docs/api/orders.md, decided question 3).
    payment: { method: 'pay_on_delivery', status: null },
    quote: priceFromRead(read),
    // Not in OrderRead: the screens leave these out.
    partner: null,
    station_name: null,
    eta_minutes: null,
    // Sent by SMS after unloading (FR-035), never through this API.
    delivery_code: null,
    timeline: [{ label: 'Order placed', at: read.created_at }],
    delivered_at: null,
    delivered_quantity: null,
    points_earned: null,
    // Since #82 part 3 (FR-051); the screen shows the two answers it asks for.
    feedback: read.feedback ? { rating: read.feedback.rating, poured_by_partner: read.feedback.poured_by_partner } : null,
  }
}

/**
 * The `POST /orders` body for the order form. With a `quote_id` the order is
 * placed at that price; without one it is a quote request and the office
 * calls with the price (FR-022 manual fallback). The area goes with it either
 * way (FR-020, #121).
 *
 * @throws {ApiError} `validation_error` for a custom tank size with no
 *   gallons, which the Tanker screen already prevents.
 */
export function orderCreateFromInput(input: CreateOrderInput): OrderCreate {
  const body: OrderCreate = {
    idempotency_key: input.idempotency_key,
    delivery_type: input.choice.delivery_type,
    contact_name: input.receiver_name,
    contact_phone: input.receiver_phone,
    delivery_address: input.address,
  }
  if (input.choice.delivery_type === 'keke') {
    body.keke = { can_size_litres: input.choice.can_size_litres, can_count: input.choice.can_count }
  } else {
    const gallons = input.choice.tank_size_gallons ?? input.custom_gallons ?? null
    if (gallons === null) {
      throw new ApiError({
        kind: 'config',
        status: null,
        code: 'validation_error',
        message: 'Enter your tank size in gallons.',
      })
    }
    body.tanker = { tank_type: input.choice.tank_type, quantity_local_gallons: gallons }
    body.water_source = input.choice.source
  }
  if (input.quote_id) body.quote_id = input.quote_id
  if (input.service_zone_id) body.service_zone_id = input.service_zone_id
  if (input.landmark) body.landmark = input.landmark
  if (input.instructions) body.delivery_instructions = input.instructions
  return body
}

/**
 * Place the order at its quoted price, or send it as a quote request.
 *
 * @throws {ApiError} The backend's errors unchanged, for example 403
 *   `phone_not_verified`, 409 `quote_expired`, 422 `quote_mismatch`, 409
 *   `no_eligible_source`, 404 `service_zone_not_found`, 409
 *   `idempotency_key_reused`, 422 `validation_error`.
 */
export async function createOrder(input: CreateOrderInput, client: ApiClient = apiClient): Promise<CustomerOrder> {
  return customerOrderFromRead(await postOrder(orderCreateFromInput(input), client))
}

/** Every order of the signed-in customer, newest first, across all pages. */
export async function listOrders(client: ApiClient = apiClient): Promise<CustomerOrder[]> {
  const orders: OrderRead[] = []
  for (;;) {
    const page = await fetchOrders({ limit: PAGE_LIMIT, offset: orders.length }, undefined, client)
    orders.push(...page.items)
    if (page.items.length === 0 || orders.length >= page.total) break
  }
  return orders.map(customerOrderFromRead)
}

/**
 * Rate a delivered order (FR-051) and return it with its feedback. Sending
 * again replaces the feedback; the design asks only for the two answers, so
 * the optional ones are left out (customer-account.md, decision 7).
 *
 * @throws {ApiError} 404 `order_not_found`; 409 `order_not_delivered`; 422 `validation_error`.
 */
export async function submitFeedback(
  reference: string,
  feedback: { rating: number; poured_by_partner: boolean },
  client: ApiClient = apiClient,
): Promise<CustomerOrder> {
  await putOrderFeedback(reference, { rating: feedback.rating, poured_by_partner: feedback.poured_by_partner }, client)
  return getOrder(reference, client)
}

/**
 * One of the customer's orders.
 *
 * @throws {ApiError} 404 `order_not_found`, also for another customer's order.
 */
export async function getOrder(reference: string, client: ApiClient = apiClient): Promise<CustomerOrder> {
  const [read, history] = await Promise.all([
    fetchOrder(reference, undefined, client),
    // A separate read that can fail on its own: the order still shows, with "Order placed" only.
    fetchOrderHistory(reference, undefined, client).catch(() => null),
  ])
  const order = customerOrderFromRead(read)
  return history ? { ...order, timeline: timelineFromHistory(read.created_at, history.items) } : order
}

/**
 * The order's timeline from its status changes (#155): "Order placed", then
 * each new customer stage with its agreed label (api-mapping.md, "Customer
 * order stage"), oldest first. A status that keeps the stage adds no step:
 * `assigned` stays "Waiting for rider" (FR-032), and `arrived` and
 * `unloading` stay "On the way". So no step shows what the order itself
 * would not.
 */
export function timelineFromHistory(createdAt: string, history: OrderHistoryEntry[]): TimelineEvent[] {
  const timeline: TimelineEvent[] = [{ label: 'Order placed', at: createdAt }]
  let previous: DeliveryStage | null = null
  for (const entry of history) {
    const stage = customerStageFromStatus(entry.status) ?? 'order_update'
    // The first entry is the order's creation, already "Order placed".
    if (previous !== null && stage !== previous) timeline.push({ label: STAGE_LABEL[stage], at: entry.at })
    previous = stage
  }
  return timeline
}
