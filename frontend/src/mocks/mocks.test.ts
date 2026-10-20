// @vitest-environment jsdom
// jsdom provides sessionStorage, which the mock store uses.
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api/client'
import { mockGetMe, mockLogin, mockLogout, mockRegister } from './authMock'
import { addAddress, createOrder, demoAdvanceOrder, getOrder, getPoints, listAddresses, removeAddress, submitFeedback } from './customerMock'
import { resetMockDb } from './db'
import { ANY_PLACE, deliveryFeeFor, DEFAULT_PRICE_LIST, pointsFor, quoteFor } from './pricing'
import { DEMO_PASSWORD } from './seed'

async function signInDemo() {
  await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
}

beforeEach(() => {
  resetMockDb()
})

describe('quoteFor (mock server pricing)', () => {
  it('prices Keke per can, with no water source', () => {
    const q = quoteFor({ delivery_type: 'keke', can_size_litres: 25, can_count: 24 }, ANY_PLACE)
    expect(q.status).toBe('quote_available')
    if (q.status !== 'quote_available') return
    expect(q.water.amount_minor_units).toBe(600_000)
    expect(q.water.unit_minor_units).toBe(25_000)
    expect(q.delivery?.amount_minor_units).toBe(50_000)
    expect(q.total_minor_units).toBe(650_000)
    expect(Number.isInteger(q.total_minor_units)).toBe(true)
  })

  it('leaves out the delivery fee until an address is known', () => {
    const q = quoteFor({ delivery_type: 'keke', can_size_litres: 50, can_count: 12 }, null)
    if (q.status !== 'quote_available') throw new Error('expected a quote')
    expect(q.delivery).toBeNull()
    expect(q.total_minor_units).toBe(q.water.amount_minor_units)
  })

  it('charges more for Ninth Mile tanker water than borehole', () => {
    const base = { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: 750 } as const
    const bore = quoteFor({ ...base, source: 'borehole' }, ANY_PLACE)
    const ninth = quoteFor({ ...base, source: 'ninth_mile' }, ANY_PLACE)
    if (bore.status !== 'quote_available' || ninth.status !== 'quote_available') throw new Error('expected quotes')
    expect(ninth.total_minor_units).toBeGreaterThan(bore.total_minor_units)
  })

  it('needs a manual quote for a custom tank size (FR-021)', () => {
    const q = quoteFor({ delivery_type: 'tanker', tank_type: 'overhead', tank_size_gallons: null, source: 'borehole' }, ANY_PLACE)
    expect(q.status).toBe('manual_quote_required')
  })

  it('uses the sample points rule', () => {
    expect(pointsFor(650_000)).toBe(30)
  })

  it('follows the delivery fee methods admin switches on (decision 10a)', () => {
    const keke = { delivery_type: 'keke', can_size_litres: 25, can_count: 24 } as const
    const area = { name: 'GRA', distance_km: 2.5, fixed_fee_minor_units: 70_000 }
    const prices = structuredClone(DEFAULT_PRICE_LIST)
    // Both off: the flat fee in the table.
    expect(deliveryFeeFor(keke, { area }, prices)).toBe(50_000)
    // Per km: ₦150 × 2.5 km = ₦375.
    prices.delivery_fee.per_km_enabled = true
    expect(deliveryFeeFor(keke, { area }, prices)).toBe(37_500)
    // Per area wins when the area has a fee.
    prices.delivery_fee.per_area_enabled = true
    expect(deliveryFeeFor(keke, { area }, prices)).toBe(70_000)
    // No fee for the area: back to per km.
    expect(deliveryFeeFor(keke, { area: { ...area, fixed_fee_minor_units: null } }, prices)).toBe(37_500)
    // Unknown area: the flat fee.
    expect(deliveryFeeFor(keke, ANY_PLACE, prices)).toBe(50_000)
  })
})

describe('mock auth', () => {
  it('signs in with any accepted phone format and keeps the session', async () => {
    const s = await mockLogin({ phone: '+2348031234567', password: DEMO_PASSWORD })
    expect(s.user.role).toBe('customer')
    expect((await mockGetMe()).user.id).toBe(s.user.id)
    await mockLogout()
    await expect(mockGetMe()).rejects.toMatchObject({ status: 401, code: 'not_authenticated' })
  })

  it('gives the same error for a wrong password and an unknown phone', async () => {
    await expect(mockLogin({ phone: '08031234567', password: 'nope-nope' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    await expect(mockLogin({ phone: '08099999999', password: 'nope-nope' })).rejects.toMatchObject({ code: 'invalid_credentials' })
  })

  it('registers new customers unverified and rejects a used phone', async () => {
    const s = await mockRegister({ name: ' New Person ', phone: '0809 000 0002', password: 'long-enough' })
    expect(s.user).toMatchObject({ name: 'New Person', phone: '+2348090000002', phone_verified: false, role: 'customer' })
    await expect(mockRegister({ name: 'X', phone: '08031234567', password: 'long-enough' })).rejects.toMatchObject({
      status: 409,
      code: 'phone_already_registered',
    })
  })
})

describe('mock orders', () => {
  const input = {
    idempotency_key: 'key-1',
    choice: { delivery_type: 'keke', can_size_litres: 25, can_count: 12 } as const,
    address_label: 'Home',
    address: '12 Lakeview Street, GRA, Enugu',
    landmark: null,
    receiver_name: 'Adaeze Nwosu',
    receiver_phone: '0803 123 4567',
    instructions: null,
  }

  it('creates one order per idempotency key (FR-026)', async () => {
    await signInDemo()
    const first = await createOrder(input)
    const retry = await createOrder(input)
    expect(retry.reference).toBe(first.reference)
    expect(first.reference).toMatch(/^MO-[0-9A-HJKMNP-TV-Z]{10}$/)
    expect(first.stage).toBe('waiting_rider')
    expect(first.payment.status).toBe('unpaid')
    const other = await createOrder({ ...input, idempotency_key: 'key-2' })
    expect(other.reference).not.toBe(first.reference)
  })

  it('refuses orders for a custom tank size', async () => {
    await signInDemo()
    await expect(
      createOrder({ ...input, idempotency_key: 'k', choice: { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: null, source: 'borehole' } }),
    ).rejects.toMatchObject({ code: 'manual_quote_required' })
  })

  it("hides other customers' orders behind the same 404", async () => {
    await mockRegister({ name: 'Other', phone: '0809 000 0003', password: 'long-enough' })
    await expect(getOrder('MO-7KQ2M9XH4T')).rejects.toMatchObject({ status: 404, code: 'order_not_found' })
  })

  it('adds points only when an order is delivered, and accepts feedback after', async () => {
    await signInDemo()
    const before = (await getPoints()).balance
    const order = await createOrder(input)
    await expect(submitFeedback(order.reference, { rating: 5, poured_by_partner: true })).rejects.toMatchObject({ code: 'order_not_delivered' })
    const done = await demoAdvanceOrder(order.reference, 'delivered')
    expect(done.delivery_code).toBeNull()
    expect((await getPoints()).balance).toBe(before + (done.points_earned ?? 0))
    expect((await submitFeedback(order.reference, { rating: 4, poured_by_partner: false })).feedback).toEqual({ rating: 4, poured_by_partner: false })
  })

  it('needs a signed-in user', async () => {
    await expect(createOrder(input)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('mock addresses', () => {
  it('makes the first address the default and protects the default from removal', async () => {
    await mockRegister({ name: 'Fresh', phone: '0809 000 0004', password: 'long-enough' })
    const a = await addAddress({ label: 'Home', address: '1 New Road, Enugu', landmark: null, make_default: false })
    expect(a.is_default).toBe(true)
    await expect(removeAddress(a.id)).rejects.toMatchObject({ code: 'default_address' })
    const b = await addAddress({ label: 'Shop', address: '2 Market Road, Enugu', landmark: null, make_default: true })
    const list = await listAddresses()
    expect(list.find((x) => x.id === b.id)?.is_default).toBe(true)
    expect(list.filter((x) => x.is_default)).toHaveLength(1)
  })
})
