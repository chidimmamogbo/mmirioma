/**
 * Admin order adapters (#15): the real-API side of `listOrders` and
 * `getOrder` in `adminApi.ts`.
 *
 * Statuses follow docs/architecture/api-mapping.md ("Admin order status"),
 * with `failed` and `disputed` as their own admin statuses (open question 5,
 * decided in #15). What the backend does not send is left out, never filled
 * in: the list has no payment status or partner, and a partner's fleet code
 * and plate are never sent.
 */
import type { AdminOrder, AdminOrderFilter, AdminOrderStatus, AdminPaymentStatus } from '../../../domain/admin'
import { describeChoice } from '../../../domain/orders'
import { describeQuantity } from '../../../domain/quantity'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { getAdminOrderDetail, getOrderHistory, type AdminOrderDetail, type AdminOrderEvent } from '../../../lib/api/adminDispatch'
import { listAdminOrders, type AdminOrderRead, type AdminOrderStatus as BackendStatus } from '../../../lib/api/adminOrders'
import type { OrderList } from '../../../mocks/adminMock'
import { choiceFromRead } from '../../customer/real/order'
import { confirmationLine } from '../confirm/logic'

const STATUS_BY_BACKEND: Record<BackendStatus, AdminOrderStatus> = {
  // Not confirmed yet, so no rider can be assigned (admin-confirm-order.md, decision 3).
  quote_requested: 'awaiting_confirmation',
  awaiting_confirmation: 'awaiting_confirmation',
  confirmed: 'awaiting_rider',
  awaiting_payment: 'awaiting_rider',
  assigned: 'assigned',
  accepted: 'assigned',
  departed: 'loading',
  collected: 'on_the_way',
  en_route: 'on_the_way',
  arrived: 'on_the_way',
  unloading: 'on_the_way',
  delivered: 'delivered',
  cancelled: 'cancelled',
  failed: 'failed',
  disputed: 'disputed',
}

/**
 * Backend payment statuses the admin screens show: the exact design
 * equivalents, plus `pending_collection` as "Cash to collect" (decided on PR
 * #92) and `partially_paid` as "Part paid" (the approved cash design). The
 * others (`disputed`, `partially_refunded`) have no label yet, so the order
 * shows no payment chip rather than a wrong one; the cash pages show them in
 * full (#19).
 */
const PAYMENT_BY_BACKEND: Partial<Record<string, AdminPaymentStatus>> = {
  pending_collection: 'pending_collection',
  unpaid: 'unpaid',
  awaiting_verification: 'awaiting_verification',
  paid: 'paid',
  partially_paid: 'partially_paid',
  refunded: 'refunded',
}

/** The backend statuses behind each pill of the order list (`a-orders`). `all` sends none. */
export const STATUSES_BY_FILTER: Record<AdminOrderFilter, BackendStatus[]> = {
  all: [],
  awaiting_confirmation: ['quote_requested', 'awaiting_confirmation'],
  awaiting_rider: ['confirmed', 'awaiting_payment'],
  in_progress: ['assigned', 'accepted', 'departed', 'collected', 'en_route', 'arrived', 'unloading'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
}

const FILTERS = Object.keys(STATUSES_BY_FILTER) as AdminOrderFilter[]

/** The newest orders a text search looks through: the contract's page maximum. */
const SEARCH_LIMIT = 100

/** A public order reference (FR-027): `MO-` and 10 characters. */
const REFERENCE = /^MO-[0-9A-Z]{10}$/i

/**
 * The admin status for a backend status. An unknown one can only come from a
 * newer backend; it shows as "Awaiting rider" so the order is not hidden.
 */
export function adminStatusFromBackend(status: string): AdminOrderStatus {
  return Object.hasOwn(STATUS_BY_BACKEND, status) ? STATUS_BY_BACKEND[status as BackendStatus] : 'awaiting_rider'
}

/** Whether an order matches a pill, by its admin status. */
function inFilter(order: AdminOrder, filter: AdminOrderFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'in_progress') return order.status === 'assigned' || order.status === 'loading' || order.status === 'on_the_way'
  return order.status === filter
}

/** Free-text match on what staff see in a row, as the mock does (names, phones, references, addresses). */
function matchesText(order: AdminOrder, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const text = [order.reference, order.customer_name, order.customer_phone, order.address, order.area ?? ''].join(' ')
  const digits = q.replace(/\D/g, '')
  return text.toLowerCase().includes(q) || (digits.length >= 4 && text.replace(/\D/g, '').includes(digits))
}

/**
 * Backend order (list row or detail) to the design's admin order.
 *
 * @param read - `AdminOrderRead` from the list, or `AdminOrderDetail`, which
 *   adds the live assignment, the confirmed source and price, and payment.
 */
export function adminOrderFromRead(read: AdminOrderRead | AdminOrderDetail): AdminOrder {
  const detail = 'assignment' in read ? read : null
  const choice = choiceFromRead(read)
  // Only a live offer or acceptance names the order's partner; an ended one does not.
  const live = detail?.assignment && (detail.assignment.status === 'offered' || detail.assignment.status === 'accepted') ? detail.assignment : null
  const vehicleType = live?.vehicle?.type
  return {
    reference: read.reference,
    created_at: read.created_at,
    customer_id: read.customer.id,
    customer_name: read.customer.name,
    customer_phone: read.customer.phone,
    area: read.service_zone?.name ?? null,
    address: read.delivery_address,
    landmark: read.landmark,
    choice,
    quantity: choice ? describeChoice(choice, 'short') : describeQuantity(read.quantity_litres, 'litres', 'short'),
    // The confirmed price wins; before confirmation, the quote the order was placed with.
    total_minor_units: detail?.price?.total_minor_units ?? read.quote?.total_minor_units ?? null,
    // Every pilot order is pay on delivery (F4); the status comes with the detail only.
    payment: { method: 'pay_on_delivery', status: (detail?.payment && PAYMENT_BY_BACKEND[detail.payment.status]) ?? null },
    status: adminStatusFromBackend(read.status),
    partner: live
      ? {
          id: live.driver.id,
          name: live.driver.name,
          code: null,
          vehicle: vehicleType === 'keke' || vehicleType === 'tanker' ? vehicleType : null,
          plate: null,
        }
      : null,
    assigned_by: live?.offered_by.name ?? null,
    station_name: detail?.source?.name ?? null,
    // The history is a separate endpoint; `getOrder` adds its assignment events (#16).
    timeline: [{ label: 'Order placed', at: read.created_at }],
    instructions: read.delivery_instructions,
    tank_note: read.tanker ? (read.tanker.tank_type === 'overhead' ? 'Overhead tank' : 'Ground tank') : null,
  }
}

/** How many orders each pill holds: one small request per pill, reading `total`. */
async function serverCounts(client: ApiClient): Promise<Record<AdminOrderFilter, number>> {
  const totals = await Promise.all(
    FILTERS.map((f) => listAdminOrders({ status: STATUSES_BY_FILTER[f], limit: 1, offset: 0 }, undefined, client).then((p) => p.total)),
  )
  return Object.fromEntries(FILTERS.map((f, i) => [f, totals[i]])) as Record<AdminOrderFilter, number>
}

function localCounts(orders: AdminOrder[]): Record<AdminOrderFilter, number> {
  return Object.fromEntries(FILTERS.map((f) => [f, orders.filter((o) => inFilter(o, f)).length])) as Record<AdminOrderFilter, number>
}

/**
 * The order list with its pill counts.
 *
 * - No search: the pill's orders from the server (newest 100) and every pill's
 *   count from the server.
 * - A reference (`MO-…`): that one order, looked up directly.
 * - Other text: matched against the newest 100 orders only, because the
 *   backend has no text search; the counts are then of those matches.
 *
 * @throws {ApiError} The backend's errors unchanged.
 */
export async function listOrders(filter: AdminOrderFilter = 'all', query?: string, client: ApiClient = apiClient): Promise<OrderList> {
  const q = (query ?? '').trim()
  if (REFERENCE.test(q)) {
    let found: AdminOrder[] = []
    try {
      found = [adminOrderFromRead(await getAdminOrderDetail(q.toUpperCase(), undefined, client))]
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'order_not_found')) throw error
    }
    return { orders: found.filter((o) => inFilter(o, filter)), counts: localCounts(found) }
  }
  if (q) {
    const page = await listAdminOrders({ status: [], limit: SEARCH_LIMIT, offset: 0 }, undefined, client)
    const found = page.items.map(adminOrderFromRead).filter((o) => matchesText(o, q))
    return { orders: found.filter((o) => inFilter(o, filter)), counts: localCounts(found) }
  }
  const [page, counts] = await Promise.all([
    listAdminOrders({ status: STATUSES_BY_FILTER[filter], limit: SEARCH_LIMIT, offset: 0 }, undefined, client),
    serverCounts(client),
  ])
  return { orders: page.items.map(adminOrderFromRead), counts }
}

type TimelineEntry = AdminOrder['timeline'][number]

/**
 * The line for an assignment event, in the contract's words (deliveries.md,
 * "AdminOrderEvent"), or `null` for every other event: their wording is not
 * decided yet (#16), so they are left out rather than guessed.
 */
function assignmentLine(event: AdminOrderEvent): string | null {
  if (!event.assignment) return null
  const driver = event.assignment.driver.name
  if (event.reason_code === 'driver_declined') return `Declined by ${driver}`
  if (event.reason_code === 'reassigned') {
    if (event.from_status === 'assigned') return `Offer to ${driver} withdrawn`
    if (event.from_status === 'accepted') return `Job withdrawn from ${driver}`
    return null
  }
  if (event.to_status === 'assigned') return `Offered to ${driver}`
  if (event.from_status === 'assigned' && event.to_status === 'accepted') return `Accepted by ${driver}`
  return null
}

/**
 * The order's timeline: "Order placed", then its confirmation (#136, design
 * Q5) and assignment events, oldest first (the history comes newest first).
 * An assignment event's note is its detail; a confirmation line carries its
 * own (category, source, window, price, who, note).
 */
export function timelineFromHistory(createdAt: string, history: AdminOrderEvent[]): TimelineEntry[] {
  const lines = [...history].reverse().flatMap((event): TimelineEntry[] => {
    const confirmation = confirmationLine(event)
    if (confirmation) return [{ label: confirmation.label, at: event.created_at, detail: confirmation.detail }]
    const label = assignmentLine(event)
    return label ? [{ label, at: event.created_at, ...(event.note ? { detail: event.note } : {}) }] : []
  })
  return [{ label: 'Order placed', at: createdAt }, ...lines]
}

/**
 * One order with its live assignment, confirmation, payment and assignment
 * history.
 *
 * The history is a separate read that can fail on its own (deliveries.md,
 * H1). The detail page has no state for that, so a failed history leaves
 * the timeline at "Order placed" and the order still shows.
 *
 * @throws {ApiError} 404 `order_not_found`.
 */
export async function getOrder(reference: string, client: ApiClient = apiClient): Promise<AdminOrder> {
  const [detail, history] = await Promise.all([
    getAdminOrderDetail(reference, undefined, client),
    getOrderHistory(reference, undefined, client).catch(() => null),
  ])
  const order = adminOrderFromRead(detail)
  return history ? { ...order, timeline: timelineFromHistory(detail.created_at, history) } : order
}
