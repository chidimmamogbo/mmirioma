import { describe, expect, it, vi } from 'vitest'
import orderSample from '../../../../../docs/api/examples/order-with-details.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import type { OrderRead } from '../../../lib/api/orders'
import type { CreateOrderInput } from '../../../mocks/customerMock'
import { createOrder, customerOrderFromRead, getOrder, listOrders, orderCreateFromInput, submitFeedback } from './order'

/** The agreed contract's example order (docs/api/order-details-and-price.md). */
const SAMPLE = orderSample as unknown as OrderRead

/** A quantity-only order, as orders sent before #21 come back. */
const OLD_ORDER: OrderRead = {
  ...SAMPLE,
  reference: 'MO-3HF8P2LQ6D',
  status: 'delivered',
  quantity_litres: 1200,
  delivery_type: null,
  keke: null,
  tanker: null,
  water_source: null,
  service_zone: null,
  quote: null,
}

function clientReturning(...responses: { body: unknown; status?: number }[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const { body, status = 200 } of responses) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  }
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

const NOT_VERIFIED = { error: { code: 'phone_not_verified', message: 'Verify your phone number first', details: null } }

const KEKE_INPUT: CreateOrderInput = {
  idempotency_key: '5b0e2c3a-7d1f-4e8a-b6c9-0a1b2c3d4e5f',
  choice: { delivery_type: 'keke', can_size_litres: 25, can_count: 24 },
  address_label: 'Home',
  address: '12 Sample Close, Independence Layout, Enugu',
  landmark: null,
  receiver_name: 'Sample Customer',
  receiver_phone: '+2348000000001',
  instructions: 'Call on arrival',
}

describe('customerOrderFromRead', () => {
  it('converts the contract example: the tanker choice, the total only, nothing invented', () => {
    const order = customerOrderFromRead(SAMPLE)
    expect(order.choice).toEqual({ delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: 750, source: 'borehole' })
    expect(order.quantity_litres).toBe(3000)
    expect(order.stage).toBe('waiting_rider')
    expect(order.quote).toEqual({ currency: 'NGN', total_minor_units: 2_000_000, water: null, delivery: null, is_sample: false })
    expect(order.receiver_name).toBe('Sample Customer')
    expect(order.address).toBe('12 Sample Close, Independence Layout, Enugu')
    expect(order.address_label).toBeNull()
    expect(order.payment).toEqual({ method: 'pay_on_delivery', status: null })
    expect(order.delivery_code).toBeNull()
    expect(order.timeline).toEqual([{ label: 'Order placed', at: SAMPLE.created_at }])
  })

  it('keeps a custom tank size as a custom choice, with its litres', () => {
    const order = customerOrderFromRead({ ...SAMPLE, quantity_litres: 2400, tanker: { tank_type: 'overhead', quantity_local_gallons: 600 } })
    expect(order.choice).toMatchObject({ delivery_type: 'tanker', tank_size_gallons: null })
    expect(order.quantity_litres).toBe(2400)
  })

  it('leaves the choice and price empty for an old quantity-only quote request', () => {
    const order = customerOrderFromRead(OLD_ORDER)
    expect(order.choice).toBeNull()
    expect(order.quote).toBeNull()
    expect(order.quantity_litres).toBe(1200)
    expect(order.stage).toBe('delivered')
  })

  it('shows a status the app does not know as the neutral "Order update" stage', () => {
    const order = customerOrderFromRead({ ...SAMPLE, status: 'rescheduling' as OrderRead['status'] })
    expect(order.stage).toBe('order_update')
  })

  it('never reveals an assignment the driver has not accepted (FR-032)', () => {
    expect(customerOrderFromRead({ ...SAMPLE, status: 'assigned' }).stage).toBe('waiting_rider')
  })
})

describe('orderCreateFromInput', () => {
  it('sends a Keke order as a quote request: cans, no quantity, no quote or zone', () => {
    expect(orderCreateFromInput(KEKE_INPUT)).toEqual({
      idempotency_key: KEKE_INPUT.idempotency_key,
      delivery_type: 'keke',
      keke: { can_size_litres: 25, can_count: 24 },
      contact_name: 'Sample Customer',
      contact_phone: '+2348000000001',
      delivery_address: '12 Sample Close, Independence Layout, Enugu',
      delivery_instructions: 'Call on arrival',
    })
  })

  it('sends a Tanker order in local gallons with the source, using the typed gallons for a custom size', () => {
    const body = orderCreateFromInput({
      ...KEKE_INPUT,
      choice: { delivery_type: 'tanker', tank_type: 'overhead', tank_size_gallons: null, source: 'ninth_mile' },
      custom_gallons: 600,
      landmark: 'Blue gate',
      instructions: null,
    })
    expect(body).toMatchObject({ delivery_type: 'tanker', tanker: { tank_type: 'overhead', quantity_local_gallons: 600 }, water_source: 'ninth_mile', landmark: 'Blue gate' })
    expect(body).not.toHaveProperty('keke')
    expect(body).not.toHaveProperty('delivery_instructions')
  })

  it('refuses a custom tank size with no gallons instead of guessing one', () => {
    const input: CreateOrderInput = { ...KEKE_INPUT, choice: { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: null, source: 'borehole' } }
    expect(() => orderCreateFromInput(input)).toThrow(ApiError)
  })
})

describe('getOrder (real)', () => {
  it('loads and converts the order', async () => {
    const { fetch, client } = clientReturning({ body: SAMPLE })
    const order = await getOrder('MO-7KQ2M9XH4T', client)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/orders/MO-7KQ2M9XH4T')
    expect(order.reference).toBe('MO-7KQ2M9XH4T')
    expect(order.quote?.total_minor_units).toBe(2_000_000)
  })

  it('passes 404 order_not_found through as an ApiError', async () => {
    const { client } = clientReturning({ body: { error: { code: 'order_not_found', message: 'Order not found', details: null } }, status: 404 })
    await expect(getOrder('MO-0000000000', client)).rejects.toMatchObject({ status: 404, code: 'order_not_found' } satisfies Partial<ApiError>)
  })
})

describe('listOrders (real)', () => {
  it('loads every page, newest first as the server sends them', async () => {
    const { fetch, client } = clientReturning(
      { body: { items: [SAMPLE], total: 2, limit: 100, offset: 0 } },
      { body: { items: [OLD_ORDER], total: 2, limit: 100, offset: 1 } },
    )
    const orders = await listOrders(client)
    expect(orders.map((o) => o.reference)).toEqual(['MO-7KQ2M9XH4T', 'MO-3HF8P2LQ6D'])
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'http://api.test/api/v1/orders?limit=100&offset=0',
      'http://api.test/api/v1/orders?limit=100&offset=1',
    ])
  })

  it('stops on an empty page even if the total says more', async () => {
    const { fetch, client } = clientReturning({ body: { items: [], total: 5, limit: 100, offset: 0 } })
    expect(await listOrders(client)).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('passes 401 not_authenticated through as an ApiError', async () => {
    const { client } = clientReturning({ body: { error: { code: 'not_authenticated', message: 'Sign in', details: null } }, status: 401 })
    await expect(listOrders(client)).rejects.toMatchObject({ status: 401, code: 'not_authenticated' } satisfies Partial<ApiError>)
  })
})

describe('createOrder (real)', () => {
  it('posts the quote request and converts the created order', async () => {
    const created: OrderRead = { ...OLD_ORDER, status: 'quote_requested', delivery_type: 'keke', keke: { can_size_litres: 25, can_count: 24 }, quantity_litres: 600 }
    const { fetch, client } = clientReturning({ body: created, status: 201 })
    const order = await createOrder(KEKE_INPUT, client)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://api.test/api/v1/orders')
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('quote_id')
    expect(order.choice).toEqual({ delivery_type: 'keke', can_size_litres: 25, can_count: 24 })
    expect(order.quote).toBeNull()
  })

  it('passes 403 phone_not_verified through, so Review shows "Verify your phone number first"', async () => {
    const { client } = clientReturning({ body: NOT_VERIFIED, status: 403 })
    await expect(createOrder(KEKE_INPUT, client)).rejects.toMatchObject({ status: 403, code: 'phone_not_verified' } satisfies Partial<ApiError>)
  })
})

const FEEDBACK = {
  rating: 4,
  poured_by_partner: true,
  on_time: null,
  quantity_as_ordered: null,
  would_reorder: null,
  message: null,
  submitted_at: '2026-10-27T15:00:00Z',
  updated_at: '2026-10-27T15:00:00Z',
}

describe('order feedback (#88 part 3)', () => {
  it('reads the feedback on an order, and none when the server sends none', () => {
    expect(customerOrderFromRead({ ...OLD_ORDER, feedback: FEEDBACK }).feedback).toEqual({ rating: 4, poured_by_partner: true })
    expect(customerOrderFromRead({ ...OLD_ORDER, feedback: null }).feedback).toBeNull()
    expect(customerOrderFromRead(OLD_ORDER).feedback).toBeNull()
  })

  it('sends the two answers with PUT, then returns the order with its feedback', async () => {
    const { fetch, client } = clientReturning({ body: FEEDBACK, status: 201 }, { body: { ...OLD_ORDER, feedback: FEEDBACK } })
    const order = await submitFeedback(OLD_ORDER.reference, { rating: 4, poured_by_partner: true }, client)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`http://api.test/api/v1/orders/${OLD_ORDER.reference}/feedback`)
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({ rating: 4, poured_by_partner: true })
    expect(fetch.mock.calls[1][0]).toBe(`http://api.test/api/v1/orders/${OLD_ORDER.reference}`)
    expect(order.feedback).toEqual({ rating: 4, poured_by_partner: true })
  })

  it('passes 409 order_not_delivered through', async () => {
    const { client } = clientReturning({ body: { error: { code: 'order_not_delivered', message: 'Rate after delivery', details: null } }, status: 409 })
    await expect(submitFeedback('MO-7KQ2M9XH4T', { rating: 5, poured_by_partner: false }, client)).rejects.toMatchObject({
      status: 409,
      code: 'order_not_delivered',
    } satisfies Partial<ApiError>)
  })
})
