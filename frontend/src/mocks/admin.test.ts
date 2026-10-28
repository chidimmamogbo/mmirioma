// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  assignOrder,
  cancelOrder,
  confirmPayment,
  createOrderForCustomer,
  getDashboard,
  listEligibleRiders,
  listOrders,
  listPriceLists,
  refundAsPoints,
  resolveIssue,
  saveArea,
  savePriceList,
  setRiderApproval,
  setStationOpen,
  uploadStationPapers,
  verifyCustomerPhone,
} from './adminMock'
import { DEMO_ADMIN_ID } from './adminSeed'
import { mockLogin, mockLogout } from './authMock'
import { createOrder, getOrder, getQuote } from './customerMock'
import { mutate, read, resetMockDb } from './db'
import { DANIEL_ID, DEMO_RIDER_ID, IFEANYI_ID, SUNDAY_ID } from './partnerSeed'
import { DEMO_PASSWORD } from './seed'

const ADMIN = { phone: '0800 000 0100', password: DEMO_PASSWORD }
const CUSTOMER = { phone: '0803 123 4567', password: DEMO_PASSWORD }
const RIDER = { phone: '0800 000 0101', password: DEMO_PASSWORD }

const KEKE = { delivery_type: 'keke', can_size_litres: 25, can_count: 24 } as const

beforeEach(async () => {
  resetMockDb()
  await mockLogin(ADMIN)
})

describe('admin access', () => {
  it('refuses customers and partners (403)', async () => {
    await mockLogout()
    await mockLogin(RIDER)
    await expect(listOrders()).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('lists every order with counts per filter, and finds by phone', async () => {
    const all = await listOrders()
    expect(all.counts.all).toBe(all.orders.length)
    expect(all.counts.awaiting_rider).toBeGreaterThan(0)
    const found = await listOrders('all', '0806 555 0192')
    expect(found.orders.map((o) => o.customer_name)).toContain('Ifeoma Eze')
  })

  it('works out the dashboard from the records', async () => {
    const d = await getDashboard()
    expect(d.orders.awaiting_rider).toBe((await listOrders('awaiting_rider')).orders.length)
    expect(d.riders_online.total).toBe(3)
    expect(d.stations).toEqual({ open: 4, closed: 1 })
    expect(d.is_sample).toBe(true)
  })
})

describe('assigning riders', () => {
  it('offers only approved riders who can take the order, online first', async () => {
    const riders = await listEligibleRiders('MO-6RTA2KXP9B')
    const ids = riders.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining([DEMO_RIDER_ID, IFEANYI_ID]))
    expect(ids).not.toContain(DANIEL_ID) // suspended
    expect(ids).not.toContain(SUNDAY_ID) // tanker, pending
  })

  it('assigns, tells the rider, and lets admin reassign before pickup', async () => {
    const o = await assignOrder('MO-6RTA2KXP9B', IFEANYI_ID)
    expect(o.status).toBe('assigned')
    expect(o.partner?.id).toBe(IFEANYI_ID)
    expect(read().partners[IFEANYI_ID].notifications[0]).toMatchObject({ kind: 'assigned', reference: 'MO-6RTA2KXP9B' })
    const moved = await assignOrder('MO-6RTA2KXP9B', DEMO_RIDER_ID)
    expect(moved.partner?.id).toBe(DEMO_RIDER_ID)
    expect(read().partners[IFEANYI_ID].notifications[0].kind).toBe('reassigned')
    expect(read().admin.audit[0].action).toBe('Reassigned MO-6RTA from Ifeanyi James to Chinedu Okafor')
  })

  it('cannot reassign water that is already on its way', async () => {
    await expect(assignOrder('MO-7KQ2M9XH4T', IFEANYI_ID)).rejects.toMatchObject({ code: 'already_collected' })
  })
})

describe('cancelling', () => {
  it('needs a reason, and a paid order becomes a refund due', async () => {
    await expect(cancelOrder('MO-6RTA2KXP9B', '')).rejects.toMatchObject({ code: 'validation_error' })
    await confirmPayment('MO-3HT8WQ2KZP')
    const o = await cancelOrder('MO-3HT8WQ2KZP', 'Customer asked by phone')
    expect(o.status).toBe('cancelled')
    expect(o.payment.status).toBe('refund_due')
    expect(read().partners[DEMO_RIDER_ID].notifications[0]).toMatchObject({ kind: 'reassigned', title: 'Order cancelled' })
  })

  it('pays a refund as points at the sample rate (1 point = ₦1)', async () => {
    const before = read().customers['user-kelechi'].points.balance
    await refundAsPoints('MO-4WQ9NC3RZF', 'Cancelled after a bank transfer')
    const order = read().customers['user-kelechi'].orders[0]
    expect(order.payment.status).toBe('refunded')
    expect(read().customers['user-kelechi'].points.balance - before).toBe(order.quote.total_minor_units / 100)
  })
})

describe('creating an order for a customer', () => {
  it('makes the same order and pool job as the customer app', async () => {
    const o = await createOrderForCustomer({ customer_id: 'user-ifeoma', choice: KEKE, address_id: 'addr-home', payment_method: 'pay_on_delivery', assign_to: null })
    expect(o.status).toBe('awaiting_rider')
    expect(o.timeline[0].detail).toMatch(/By support/)
    const job = read().jobs.find((j) => j.reference === o.reference)!
    expect(job.station.area).toBe('Independence Layout')
    expect(read().customers['user-ifeoma'].orders[0].reference).toBe(o.reference)
  })

  it('needs a quote for a custom tanker size', async () => {
    await expect(
      createOrderForCustomer({ customer_id: 'user-obinna', choice: { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: null, source: 'borehole' }, address_id: 'addr-home', payment_method: 'bank_transfer', assign_to: null }),
    ).rejects.toMatchObject({ code: 'manual_quote_required' })
  })
})

describe('stations (FR-012)', () => {
  it('blocks new orders when no station is open with valid papers', async () => {
    for (const st of read().admin.stations.filter((x) => x.open)) await setStationOpen(st.id, false)
    await mockLogout()
    await mockLogin(CUSTOMER)
    await expect(
      createOrder({ idempotency_key: 'k-x', choice: KEKE, address_label: 'Home', address: '12 Lakeview Street, GRA, Enugu', landmark: null, receiver_name: 'Adaeze Nwosu', receiver_phone: '0803 123 4567', instructions: null }),
    ).rejects.toMatchObject({ status: 409, code: 'no_station_open' })
  })

  it('will not open a station whose papers expired until new papers are uploaded', async () => {
    mutate((s) => {
      const st = s.admin.stations.find((x) => x.id === 'st-newhaven')!
      st.papers.valid_until = '2026-01-01'
    })
    await expect(setStationOpen('st-newhaven', true)).rejects.toMatchObject({ code: 'papers_not_valid' })
    await uploadStationPapers('st-newhaven', 'new-papers.pdf', '2099-12-31')
    expect((await setStationOpen('st-newhaven', true)).open).toBe(true)
  })

  it('tells partners when a station closes', async () => {
    await setStationOpen('st-gra', false)
    expect(read().partners[DEMO_RIDER_ID].notifications[0]).toMatchObject({ kind: 'station_closed' })
  })
})

describe('prices (FR-024)', () => {
  it('saves a new version that new quotes use, while placed orders keep their price', async () => {
    const [current] = await listPriceLists()
    const placed = read().customers['user-adaeze'].orders[0].quote.total_minor_units
    await savePriceList({ ...structuredClone(current), keke: { ...current.keke, can_minor_units: { 25: 30_000, 50: 45_000 } } })
    const [next] = await listPriceLists()
    expect(next.version).toBe(current.version + 1)
    expect(next.note).toBe('Keke 25 L can ₦250 → ₦300')
    await mockLogout()
    await mockLogin(CUSTOMER)
    const q = await getQuote(KEKE, null)
    if (q.status !== 'quote_available') throw new Error('expected a quote')
    expect(q.water.amount_minor_units).toBe(24 * 30_000)
    expect((await getOrder(read().customers['user-adaeze'].orders[0].reference)).quote?.total_minor_units).toBe(placed)
  })

  it('refuses a save with nothing changed', async () => {
    const [current] = await listPriceLists()
    await expect(savePriceList(structuredClone(current))).rejects.toMatchObject({ code: 'no_changes' })
  })

  it('uses the fixed area fee once admin switches it on (decision 10a)', async () => {
    const [current] = await listPriceLists()
    await saveArea('ar-gra', { name: 'GRA', enabled: true, centre: { latitude: 6.4584, longitude: 7.5464 }, fixed_fee_minor_units: 80_000 })
    await savePriceList({ ...structuredClone(current), delivery_fee: { ...current.delivery_fee, per_area_enabled: true } })
    await mockLogout()
    await mockLogin(CUSTOMER)
    const q = await getQuote(KEKE, '12 Lakeview Street, GRA, Enugu')
    if (q.status !== 'quote_available') throw new Error('expected a quote')
    expect(q.delivery?.amount_minor_units).toBe(80_000)
  })
})

describe('riders, customers and support', () => {
  it('needs a reason to suspend, and puts assigned orders back in the pool', async () => {
    await expect(setRiderApproval(DEMO_RIDER_ID, 'suspend', '')).rejects.toMatchObject({ code: 'validation_error' })
    const r = await setRiderApproval(DEMO_RIDER_ID, 'suspend', 'Papers out of date')
    expect(r).toMatchObject({ approval: 'suspended', online: false })
    expect(read().jobs.find((j) => j.reference === 'MO-3HT8WQ2KZP')!.stage).toBe('available')
    expect((await setRiderApproval(SUNDAY_ID, 'approve', '')).approval).toBe('approved')
  })

  it('marks a phone verified by hand (FR-003) and logs it', async () => {
    const c = await verifyCustomerPhone('user-ifeoma')
    expect(c.phone_verified).toBe(true)
    expect(read().admin.audit[0].action).toBe('Marked phone verified for Ifeoma Eze')
  })

  it('confirms a delivery without the code: the rider is paid and the order is delivered', async () => {
    const wallet = read().partners[DEMO_RIDER_ID].wallet_minor_units
    const issue = await resolveIssue('is-12', 'confirm_without_code', 'Called both; customer confirmed 600 L in the tank')
    expect(issue.status).toBe('resolved')
    expect(read().jobs.find((j) => j.reference === 'MO-7KQ2M9XH4T')!.stage).toBe('delivered')
    expect(read().partners[DEMO_RIDER_ID].wallet_minor_units).toBeGreaterThan(wallet)
    expect(read().customers['user-adaeze'].orders.find((o) => o.reference === 'MO-7KQ2M9XH4T')!.stage).toBe('delivered')
  })

  it('adds goodwill points to the customer on the order', async () => {
    const before = read().customers['user-adaeze'].points.balance
    await resolveIssue('is-11', 'goodwill_points', 'Late delivery, apologised by phone', 50)
    expect(read().customers['user-adaeze'].points.balance).toBe(before + 50)
  })

  it('keeps one admin account in the seed', () => {
    expect(read().users.filter((u) => u.role === 'admin').map((u) => u.id)).toEqual([DEMO_ADMIN_ID])
  })
})
