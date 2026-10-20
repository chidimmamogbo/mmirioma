/**
 * Mock handlers for the customer app. Each mirrors what a backend endpoint
 * would do: it checks the session, validates input, applies business rules
 * (prices only from `quoteFor`, idempotent order creation, FR-026) and returns
 * copies so screens cannot mutate stored data.
 */
import type {
  CustomerNotification,
  CustomerOrder,
  CustomerProfile,
  PointsSummary,
  ProblemType,
  Quote,
  SavedAddress,
  SupportTicket,
  WaterChoice,
} from '../domain/orders'
import type { IssueType } from '../domain/admin'
import { PROBLEM_LABEL } from '../domain/orders'
import { normalizeNigerianPhone } from '../lib/format/phone'
import { requireUserId } from './authMock'
import { mutate, read } from './db'
import { alertPartnersOfNewJob, applyDelivered, jobForNewOrder } from './orderSync'
import { addActivity, addAdminNotification, currentPrices, nextIssueNumber, stationForAddress } from './adminState'
import { areaForAddress, quoteFor } from './pricing'
import type { CustomerData, MockState } from './seed'
import { clone, delay, mockError, newDeliveryCode, newId, newReference } from './store'

function data(): CustomerData {
  const id = requireUserId()
  const d = read().customers[id]
  if (!d) throw mockError(403, 'forbidden', 'This account is not a customer account')
  return d
}

function change<T>(fn: (d: CustomerData & { idempotency?: Record<string, string> }, s: MockState) => T): T {
  const id = requireUserId()
  return mutate((s) => fn(s.customers[id], s))
}

function findOrder(d: CustomerData, reference: string): CustomerOrder {
  const order = d.orders.find((o) => o.reference === reference)
  // Same 404 for "not yours" and "does not exist", so references cannot be probed (orders.md).
  if (!order) throw mockError(404, 'order_not_found', 'Order not found')
  return order
}

/* ---------- Profile ---------- */

export async function getProfile(): Promise<CustomerProfile> {
  await delay(null)
  const id = requireUserId()
  const s = read()
  const user = s.users.find((u) => u.id === id)!
  const d = data()
  return clone({
    name: user.name,
    phone: user.phone,
    phone_verified: user.phone_verified,
    ...d.profile,
    stats: { orders: d.orders.length, points: d.points.balance, addresses: d.addresses.length },
  })
}

export interface ProfileUpdate {
  email?: string | null
  photo_url?: string | null
  preferences?: Partial<CustomerProfile['preferences']>
}

export async function updateProfile(update: ProfileUpdate): Promise<CustomerProfile> {
  await delay(null)
  if (update.email !== undefined && update.email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)) {
    throw mockError(422, 'validation_error', 'Request validation failed', [{ loc: ['body', 'email'], msg: 'Enter a valid email address', type: 'value_error' }])
  }
  change((d) => {
    if (update.email !== undefined) d.profile.email = update.email
    if (update.photo_url !== undefined) d.profile.photo_url = update.photo_url
    if (update.preferences) d.profile.preferences = { ...d.profile.preferences, ...update.preferences }
  })
  return getProfile()
}

/* ---------- Addresses ---------- */

export async function listAddresses(): Promise<SavedAddress[]> {
  await delay(null)
  return clone(data().addresses)
}

export interface AddressInput {
  label: string
  address: string
  landmark: string | null
  make_default: boolean
}

function validateAddress(input: AddressInput) {
  const details = []
  if (input.label.trim().length < 1 || input.label.trim().length > 40) details.push({ loc: ['body', 'label'], msg: 'Give the address a name', type: 'value_error' })
  if (input.address.trim().length < 5 || input.address.trim().length > 500) details.push({ loc: ['body', 'address'], msg: 'Enter the full address', type: 'value_error' })
  if (details.length) throw mockError(422, 'validation_error', 'Request validation failed', details)
}

export async function addAddress(input: AddressInput): Promise<SavedAddress> {
  await delay(null)
  validateAddress(input)
  return clone(
    change((d) => {
      const first = d.addresses.length === 0
      if (input.make_default || first) d.addresses.forEach((a) => (a.is_default = false))
      const created: SavedAddress = {
        id: newId('addr'),
        label: input.label.trim(),
        address: input.address.trim(),
        landmark: input.landmark?.trim() || null,
        is_default: input.make_default || first,
      }
      d.addresses.push(created)
      return created
    }),
  )
}

export async function updateAddress(id: string, input: AddressInput): Promise<SavedAddress> {
  await delay(null)
  validateAddress(input)
  return clone(
    change((d) => {
      const a = d.addresses.find((x) => x.id === id)
      if (!a) throw mockError(404, 'address_not_found', 'Address not found')
      a.label = input.label.trim()
      a.address = input.address.trim()
      a.landmark = input.landmark?.trim() || null
      if (input.make_default) {
        d.addresses.forEach((x) => (x.is_default = x.id === id))
      }
      return a
    }),
  )
}

export async function setDefaultAddress(id: string): Promise<void> {
  await delay(null)
  change((d) => {
    if (!d.addresses.some((a) => a.id === id)) throw mockError(404, 'address_not_found', 'Address not found')
    d.addresses.forEach((a) => (a.is_default = a.id === id))
  })
}

export async function removeAddress(id: string): Promise<void> {
  await delay(null)
  change((d) => {
    const a = d.addresses.find((x) => x.id === id)
    if (!a) throw mockError(404, 'address_not_found', 'Address not found')
    if (a.is_default) throw mockError(409, 'default_address', 'Choose another default address before removing this one')
    d.addresses = d.addresses.filter((x) => x.id !== id)
  })
}

/* ---------- Quotes and orders ---------- */

/**
 * Quote with the current price list. `address` null leaves out the delivery
 * fee; with an address the fee follows admin's delivery fee methods for the
 * address's service area (decision 10a).
 */
export async function getQuote(choice: WaterChoice, address: string | null): Promise<Quote> {
  await delay(null, 150)
  requireUserId()
  const s = read()
  return quoteFor(choice, address === null ? null : { area: areaForAddress(address, s.admin.areas) }, currentPrices(s))
}

export interface CreateOrderInput {
  /** One UUID per checkout attempt, reused on every retry (FR-026). */
  idempotency_key: string
  choice: WaterChoice
  address_label: string
  address: string
  landmark: string | null
  receiver_name: string
  receiver_phone: string
  instructions: string | null
}

export async function createOrder(input: CreateOrderInput): Promise<CustomerOrder> {
  await delay(null, 500)
  const phone = normalizeNigerianPhone(input.receiver_phone)
  if (!phone) {
    throw mockError(422, 'validation_error', 'Request validation failed', [{ loc: ['body', 'receiver_phone'], msg: 'Enter a Nigerian mobile number', type: 'value_error' }])
  }
  const s0 = read()
  const quote = quoteFor(input.choice, { area: areaForAddress(input.address, s0.admin.areas) }, currentPrices(s0))
  if (quote.status !== 'quote_available') {
    throw mockError(422, 'manual_quote_required', quote.reason)
  }
  // FR-012: no order without an open station with valid water-source papers.
  if (!stationForAddress(s0, input.address)) {
    throw mockError(409, 'no_station_open', 'No refill station is open for this area right now. Please try again later or contact support.')
  }
  return clone(
    change((d, s) => {
      d.idempotency ??= {}
      const existing = d.idempotency[input.idempotency_key]
      if (existing) return findOrder(d, existing)
      const now = new Date().toISOString()
      const order: CustomerOrder = {
        reference: newReference(),
        created_at: now,
        choice: input.choice,
        address_label: input.address_label,
        address: input.address,
        landmark: input.landmark,
        receiver_name: input.receiver_name.trim(),
        receiver_phone: phone,
        instructions: input.instructions,
        stage: 'waiting_rider',
        payment: { method: 'pay_on_delivery', status: 'unpaid' },
        quote,
        partner: null,
        station_name: null,
        eta_minutes: null,
        delivery_code: newDeliveryCode(),
        timeline: [{ label: 'Order placed', at: now }],
        delivered_at: null,
        delivered_quantity: null,
        points_earned: null,
        feedback: null,
      }
      d.orders.unshift(order)
      d.idempotency[input.idempotency_key] = order.reference
      // The order is now offered to eligible partners (shared mock pool).
      const owner = s.users.find((u) => u.id === s.sessionUserId)
      const job = jobForNewOrder(s, order, owner?.name ?? '')
      s.jobs.unshift(job)
      alertPartnersOfNewJob(s, job, now)
      addActivity(s, 'new_order', `New order ${order.reference.slice(0, 7)} from a customer`, order.reference, now)
      addAdminNotification(s, 'New order waiting for a rider', `${order.reference.slice(0, 7)} · ${job.customer.area}`, '/admin/orders')
      d.notifications.unshift({
        id: newId('n'),
        kind: 'order_received',
        title: 'Order received',
        body: `We are finding a rider for ${order.reference.slice(0, 7)}.`,
        at: now,
        read: false,
        reference: order.reference,
      })
      return order
    }),
  )
}

export async function listOrders(): Promise<CustomerOrder[]> {
  await delay(null)
  return clone(data().orders)
}

export async function getOrder(reference: string): Promise<CustomerOrder> {
  await delay(null)
  return clone(findOrder(data(), reference))
}

/**
 * Demo only: move an order to the next delivery stage, as partner and admin
 * actions would. Lets the mock-mode customer app show tracking and the
 * delivered screen without the rider app.
 */
export async function demoAdvanceOrder(reference: string, to: 'delivered' | 'next' = 'next'): Promise<CustomerOrder> {
  await delay(null)
  return clone(
    change((d, s) => {
      const o = findOrder(d, reference)
      const now = new Date().toISOString()
      const sequence = ['waiting_rider', 'rider_assigned', 'picked_up', 'on_the_way', 'delivered'] as const
      const idx = sequence.indexOf(o.stage as (typeof sequence)[number])
      const target = to === 'delivered' ? 'delivered' : sequence[Math.min(idx + 1, sequence.length - 1)]
      if (o.stage === 'cancelled' || idx === -1) return o
      o.stage = target
      if (!o.partner && target !== 'waiting_rider') {
        o.partner =
          o.choice.delivery_type === 'keke'
            ? { name: 'Chinedu Okafor', vehicle: 'keke', plate: 'ENU 482 KK', rating: 4.8, phone: '+2348000000101' }
            : { name: 'Emeka David', vehicle: 'tanker', plate: 'ENU 115 XA', rating: 4.7, phone: '+2348000000102' }
        o.timeline.push({ label: `${o.partner.name} accepted`, at: now })
      }
      if (target === 'picked_up' || target === 'on_the_way') {
        o.station_name ??= 'GRA Refill Station'
        if (!o.timeline.some((t) => t.label.startsWith('Collected'))) o.timeline.push({ label: `Collected at ${o.station_name}`, at: now })
      }
      if (target === 'delivered') {
        applyDelivered(s, o.reference, now)
      }
      const job = s.jobs.find((j) => j.reference === o.reference)
      if (job) {
        job.stage = target === 'delivered' ? 'delivered' : target === 'waiting_rider' ? job.stage : target === 'rider_assigned' ? 'accepted' : 'collected'
        if (target === 'delivered') job.delivered_at = now
      }
      return o
    }),
  )
}

export async function submitFeedback(reference: string, feedback: { rating: number; poured_by_partner: boolean }): Promise<CustomerOrder> {
  await delay(null)
  if (!Number.isInteger(feedback.rating) || feedback.rating < 1 || feedback.rating > 5) {
    throw mockError(422, 'validation_error', 'Request validation failed', [{ loc: ['body', 'rating'], msg: 'Choose 1 to 5 stars', type: 'value_error' }])
  }
  return clone(
    change((d) => {
      const o = findOrder(d, reference)
      if (o.stage !== 'delivered') throw mockError(409, 'order_not_delivered', 'You can rate an order after it is delivered')
      // One feedback per order: a second submission updates it instead of adding spam (FR-051).
      o.feedback = feedback
      return o
    }),
  )
}

/* ---------- Notifications ---------- */

export async function listNotifications(): Promise<CustomerNotification[]> {
  await delay(null)
  return clone(data().notifications)
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await delay(null, 100)
  change((d) => d.notifications.forEach((n) => (!ids || ids.includes(n.id) ? (n.read = true) : null)))
}

/* ---------- Points ---------- */

export async function getPoints(): Promise<PointsSummary> {
  await delay(null)
  const p = data().points
  return clone({
    balance: p.balance,
    // Sample rule: 1 point = ₦1 off.
    balance_value_minor_units: p.balance * 100,
    next_reward: { label: '₦500 off', target: 300 },
    history: p.history,
    is_sample: true,
  })
}

/* ---------- Support ---------- */

/** How a customer's problem type shows in the admin support queue. */
const CUSTOMER_ISSUE_TYPE: Record<ProblemType, IssueType> = {
  late: 'late',
  wrong_quantity: 'wrong_quantity',
  payment: 'other',
  rider: 'other',
  other: 'other',
}

export async function listTickets(): Promise<SupportTicket[]> {
  await delay(null)
  return clone(data().tickets)
}

export async function createTicket(input: { type: ProblemType; message: string; reference: string | null }): Promise<SupportTicket> {
  await delay(null)
  if (input.message.trim().length < 3) {
    throw mockError(422, 'validation_error', 'Request validation failed', [{ loc: ['body', 'message'], msg: 'Tell us what happened', type: 'value_error' }])
  }
  return clone(
    change((d, s) => {
      const number = nextIssueNumber(s)
      const ticket: SupportTicket = {
        id: newId('t'),
        number,
        title: PROBLEM_LABEL[input.type],
        at: new Date().toISOString(),
        note: input.reference ? `About ${input.reference.slice(0, 7)}` : null,
        status: 'open',
        kind: 'problem',
      }
      d.tickets.unshift(ticket)
      // The same report goes to the admin support queue (a-support).
      const owner = s.users.find((u) => u.id === s.sessionUserId)
      s.admin.issues.unshift({
        id: ticket.id,
        number,
        type: CUSTOMER_ISSUE_TYPE[input.type],
        title: PROBLEM_LABEL[input.type],
        message: input.message.trim(),
        reference: input.reference,
        reported_by: 'customer',
        reporter_name: owner?.name ?? 'Customer',
        at: ticket.at,
        urgent: false,
        status: 'open',
        resolution: null,
      })
      addActivity(s, 'complaint', `Complaint: ${PROBLEM_LABEL[input.type].toLowerCase()}${input.reference ? ` on ${input.reference.slice(0, 7)}` : ''}`, input.reference)
      addAdminNotification(s, 'New support issue', `${number} · ${PROBLEM_LABEL[input.type]}`, '/admin/support')
      return ticket
    }),
  )
}

/** Account deletion is a request handled by staff, not an instant delete (NFR-005 retention). */
export async function requestAccountDeletion(reason: string): Promise<SupportTicket> {
  await delay(null)
  return clone(
    change((d, s) => {
      const ticket: SupportTicket = {
        id: newId('t'),
        number: nextIssueNumber(s),
        title: 'Delete my account',
        at: new Date().toISOString(),
        note: reason.trim() || null,
        status: 'open',
        kind: 'question',
      }
      d.tickets.unshift(ticket)
      return ticket
    }),
  )
}
