/**
 * Keeps the customer's view of an order and the partner's job in step inside
 * the mock backend, as one database would. Pure functions over MockState;
 * callers wrap them in `mutate`.
 */
import { describeChoice, type CustomerOrder, type DeliveryPartner } from '../domain/orders'
import type { PartnerJob } from '../domain/partner'
import type { CustomerData, MockState, PartnerData, StoredJob } from './seed'
import { eligible } from './eligibility'
import { newId } from './store'
import { addActivity, currentPrices, stationForAddress } from './adminState'
import { riderPayFor } from './pricing'

/** The customer order with this reference, and its owner's data, if any. */
export function findCustomerOrder(s: MockState, reference: string): { data: CustomerData; order: CustomerOrder } | null {
  for (const data of Object.values(s.customers)) {
    const order = data.orders.find((o) => o.reference === reference)
    if (order) return { data, order }
  }
  return null
}

/** Partner details shown to the customer once a partner accepts. */
export function partnerForCustomer(s: MockState, partnerId: string): DeliveryPartner | null {
  const user = s.users.find((u) => u.id === partnerId)
  const p = s.partners[partnerId]
  if (!user || !p) return null
  return { name: user.name, vehicle: p.profile.vehicle.type, plate: p.profile.vehicle.plate, rating: p.rating, phone: user.phone }
}

export function applyAccepted(s: MockState, reference: string, partnerId: string, now = new Date().toISOString()): void {
  const found = findCustomerOrder(s, reference)
  if (!found) return
  const { order, data } = found
  const partner = partnerForCustomer(s, partnerId)
  addActivity(s, 'accepted', `${reference.slice(0, 7)} accepted by ${partner?.name ?? 'a partner'}`, reference, now)
  order.stage = 'rider_assigned'
  order.partner = partner
  order.timeline.push({ label: `${partner?.name ?? 'Your rider'} accepted`, at: now, detail: partner ? `${partner.vehicle === 'keke' ? 'Keke' : 'Tanker'} ${partner.plate}` : undefined })
  data.notifications.unshift({
    id: newId('n'),
    kind: 'rider_assigned',
    title: order.choice.delivery_type === 'keke' ? 'Rider assigned' : 'Driver assigned',
    body: `${partner?.name ?? 'A partner'} accepted ${reference.slice(0, 7)}.`,
    at: now,
    read: false,
    reference,
  })
}

export function applyCollected(s: MockState, job: PartnerJob, now = new Date().toISOString()): void {
  const found = findCustomerOrder(s, job.reference)
  if (!found) return
  const { order, data } = found
  const qty = describeChoice(order.choice, 'short')
  order.stage = 'on_the_way'
  order.station_name = job.station.name
  // The partner's estimate for the drive to the customer (decision 14: only shown when one exists).
  order.eta_minutes = job.customer.minutes
  order.timeline.push({ label: `Collected at ${job.station.name}`, at: now, detail: qty })
  data.notifications.unshift({
    id: newId('n'),
    kind: 'on_the_way',
    title: 'Your water is on the way',
    body: `${order.partner?.name.split(' ')[0] ?? 'Your rider'} collected ${qty} and is heading to ${order.address_label}.`,
    at: now,
    read: false,
    reference: job.reference,
  })
}

/** Mark the customer's order delivered and credit their sample points. */
export function applyDelivered(s: MockState, reference: string, now = new Date().toISOString()): void {
  const found = findCustomerOrder(s, reference)
  if (!found) return
  const { order: o, data } = found
  addActivity(s, 'delivered', `${reference.slice(0, 7)} delivered, code verified`, reference, now)
  o.stage = 'delivered'
  o.delivered_at = now
  o.delivered_quantity =
    o.choice.delivery_type === 'keke' ? `${o.choice.can_size_litres * o.choice.can_count} L` : `${o.choice.tank_size_gallons?.toLocaleString('en-NG')} gallons`
  o.points_earned = o.quote.points_estimate
  o.delivery_code = null
  o.eta_minutes = null
  o.timeline.push({ label: 'Delivered, code verified', at: now })
  data.points.balance += o.points_earned
  data.points.history.unshift({ id: newId('p'), kind: 'earned', label: `Earned · ${o.reference.slice(0, 7)} delivered`, at: 'Today', points: o.points_earned })
  data.notifications.unshift({
    id: newId('n'),
    kind: 'delivered',
    title: 'Water delivered',
    body: `${o.delivered_quantity} delivered to ${o.address_label}. You earned ${o.points_earned} points.`,
    at: now,
    read: false,
    reference,
  })
}

/**
 * "New order near you" for every partner who could take `job` right now:
 * approved, online, new-order alerts on, and the job fits their vehicle.
 */
export function alertPartnersOfNewJob(s: MockState, job: StoredJob, now = new Date().toISOString()): void {
  for (const [partnerId, p] of Object.entries(s.partners)) {
    const prof = p.profile
    if (prof.approval !== 'approved' || !prof.online || !prof.preferences.new_order_alerts) continue
    if (!eligible(job, partnerId, p)) continue
    const qty = job.choice.delivery_type === 'tanker' ? `${job.choice.tank_size_gallons?.toLocaleString('en-NG')} gal` : `${job.choice.can_count} × ${job.choice.can_size_litres} L`
    p.notifications.unshift({
      id: newId('n'),
      kind: 'new_orders',
      title: 'New order near you',
      body: `${qty} for ${job.customer.area}. Open orders to accept it.`,
      at: now,
      read: false,
      reference: job.reference,
    })
  }
}

/**
 * Put a newly placed customer order into the partner pool. The station is an
 * open one with valid papers (FR-012, chosen by the caller with
 * `stationForAddress`); pay comes from the current price list.
 */
export function jobForNewOrder(s: MockState, order: CustomerOrder, customerName: string): StoredJob {
  const area = s.admin.areas.find((x) => order.address.toLowerCase().includes(x.name.toLowerCase()))?.name ?? order.address.split(',').map((x) => x.trim())[1] ?? order.address_label
  const station = stationForAddress(s, order.address)
  if (!station) throw new Error('jobForNewOrder needs an open station; check stationForAddress first')
  const km = s.admin.areas.find((x) => x.name === area)?.distance_km ?? 3
  return {
    reference: order.reference,
    created_at: order.created_at,
    choice: order.choice,
    tank_note: order.choice.delivery_type === 'tanker' ? (order.choice.tank_type === 'overhead' ? 'Overhead tank. Bring the pump hose.' : 'Ground tank.') : null,
    station: { name: station.name, address: station.address, area: station.area, distance_km: 1.5, minutes: 6 },
    customer: {
      name: order.address,
      address: order.address,
      area,
      distance_km: km,
      minutes: Math.round(km * 3),
      landmark: order.landmark,
      contact_name: order.receiver_name || customerName,
      phone: order.receiver_phone,
    },
    instructions: order.instructions,
    earning_minor_units: riderPayFor(order.choice, currentPrices(s)),
    stage: 'available',
    assigned_by: null,
    payment_status: order.payment.status,
    code_tries_left: 3,
    code_resend_at: null,
    accepted_at: null,
    collected_at: null,
    delivered_at: null,
    pickup: null,
    partner_id: null,
    declined_by: [],
    mock_code: null,
    remaining: null,
  }
}

/**
 * Finish a collected job: the partner is paid (sample pay into the wallet)
 * and the customer's order is delivered. Used when the customer's code is
 * verified, and when admin confirms a delivery without the code after
 * checking with both people (a-support, with a reason in the audit log).
 */
export function completeDelivery(s: MockState, job: StoredJob, partner: PartnerData, now = new Date().toISOString()): void {
  job.stage = 'delivered'
  job.delivered_at = now
  job.payment_status = findCustomerOrder(s, job.reference)?.order.payment.status ?? job.payment_status
  partner.wallet_minor_units += job.earning_minor_units
  partner.today_minor_units += job.earning_minor_units
  partner.deliveries_today += 1
  partner.week[6] += job.earning_minor_units
  partner.earnings.unshift({
    reference: job.reference,
    at: now,
    amount_minor_units: job.earning_minor_units,
    status: 'pending',
    label: describeChoice(job.choice, 'short'),
  })
  applyDelivered(s, job.reference, now)
}
