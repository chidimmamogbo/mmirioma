import { describe, expect, it, vi } from 'vitest'
import detailSample from '../../../../../docs/api/examples/admin-order-detail.json'
import pageSample from '../../../../../docs/api/examples/admin-orders-page.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import type { AdminOrderDetail } from '../../../lib/api/adminDispatch'
import type { AdminOrderRead, Page } from '../../../lib/api/adminOrders'
import { adminOrderFromRead, adminStatusFromBackend, getOrder, listOrders } from './orders'

/** The agreed contract's examples (docs/api/orders.md, deliveries.md). */
const DETAIL = detailSample as unknown as AdminOrderDetail
const PAGE = pageSample as unknown as Page<AdminOrderRead>
const ROW = PAGE.items[0]

const NOT_FOUND = { error: { code: 'order_not_found', message: 'Order not found', details: null } }
const FORBIDDEN = { error: { code: 'forbidden', message: 'Not allowed', details: null } }

/** A fetch that answers by URL, so parallel requests (the pill counts) get the right body. */
function clientByUrl(route: (url: string) => { body: unknown; status?: number }) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const { body, status = 200 } = route(String(input))
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

const page = (items: AdminOrderRead[], total = items.length) => ({ items, total, limit: 100, offset: 0 })

describe('adminStatusFromBackend', () => {
  it('follows api-mapping.md, with failed and disputed as their own statuses', () => {
    expect(adminStatusFromBackend('quote_requested')).toBe('awaiting_rider')
    expect(adminStatusFromBackend('confirmed')).toBe('awaiting_rider')
    expect(adminStatusFromBackend('accepted')).toBe('assigned')
    expect(adminStatusFromBackend('departed')).toBe('loading')
    expect(adminStatusFromBackend('unloading')).toBe('on_the_way')
    expect(adminStatusFromBackend('failed')).toBe('failed')
    expect(adminStatusFromBackend('disputed')).toBe('disputed')
  })

  it('never hides an order with a status the app does not know', () => {
    expect(adminStatusFromBackend('rescheduling')).toBe('awaiting_rider')
  })
})

describe('adminOrderFromRead', () => {
  it('converts the detail example: live partner, source, confirmed price; nothing invented', () => {
    const order = adminOrderFromRead(DETAIL)
    expect(order.reference).toBe(DETAIL.reference)
    expect(order.status).toBe('assigned')
    expect(order.customer_name).toBe(DETAIL.customer.name)
    expect(order.partner).toEqual({ id: DETAIL.assignment!.driver.id, name: 'Sample Driver One', code: null, vehicle: null, plate: null })
    expect(order.assigned_by).toBe(DETAIL.assignment!.offered_by.name)
    expect(order.station_name).toBe('Sample Borehole A')
    expect(order.total_minor_units).toBe(4_500_000)
    // pending_collection shows as "Cash to collect" (decided on PR #92).
    expect(order.payment).toEqual({ method: 'pay_on_delivery', status: 'pending_collection' })
    expect(order.timeline).toEqual([{ label: 'Order placed', at: DETAIL.created_at }])
  })

  it('shows a payment status without a label yet as no chip, never a guessed one', () => {
    expect(adminOrderFromRead({ ...DETAIL, payment: { ...DETAIL.payment!, status: 'partially_refunded' } }).payment.status).toBeNull()
  })

  it('shows an ended assignment as no partner', () => {
    const ended = { ...DETAIL, assignment: { ...DETAIL.assignment!, status: 'declined' as const } }
    expect(adminOrderFromRead(ended).partner).toBeNull()
  })

  it('maps an exact payment status, and a Keke choice when the order has one', () => {
    const order = adminOrderFromRead({
      ...DETAIL,
      payment: { ...DETAIL.payment!, status: 'paid' },
      delivery_type: 'keke',
      keke: { can_size_litres: 25, can_count: 24 },
      tanker: null,
      water_source: null,
      service_zone: { id: 'z1', name: 'Independence Layout' },
    })
    expect(order.payment.status).toBe('paid')
    expect(order.choice).toEqual({ delivery_type: 'keke', can_size_litres: 25, can_count: 24 })
    expect(order.area).toBe('Independence Layout')
    expect(order.tank_note).toBeNull()
  })

  it('keeps a list row honest: litres only, no area, payment status or partner', () => {
    const order = adminOrderFromRead({ ...ROW, delivery_type: null, keke: null, tanker: null, water_source: null, service_zone: null, quote: null })
    expect(order.choice).toBeNull()
    expect(order.quantity).toContain('L')
    expect(order.area).toBeNull()
    expect(order.payment.status).toBeNull()
    expect(order.partner).toBeNull()
    expect(order.station_name).toBeNull()
    expect(order.total_minor_units).toBeNull()
  })
})

describe('listOrders (real)', () => {
  it('loads the pill from the server and every pill count from its total', async () => {
    const { fetch, client } = clientByUrl((url) => {
      if (url.includes('limit=1&')) return { body: page([], url.includes('status=delivered') ? 7 : 3) }
      return { body: page([ROW]) }
    })
    const result = await listOrders('awaiting_rider', undefined, client)
    expect(result.orders.map((o) => o.reference)).toEqual([ROW.reference])
    expect(result.counts.delivered).toBe(7)
    expect(result.counts.all).toBe(3)
    const listCall = fetch.mock.calls.map((c) => String(c[0])).find((u) => u.includes('limit=100'))!
    expect(listCall).toContain('status=quote_requested')
    expect(listCall).toContain('status=awaiting_confirmation')
    expect(listCall).toContain('status=confirmed')
  })

  it('looks a reference up directly', async () => {
    const { fetch, client } = clientByUrl(() => ({ body: DETAIL }))
    const result = await listOrders('all', ` ${DETAIL.reference.toLowerCase()} `, client)
    expect(result.orders.map((o) => o.reference)).toEqual([DETAIL.reference])
    expect(String(fetch.mock.calls[0][0])).toBe(`http://api.test/api/v1/admin/orders/${DETAIL.reference}`)
  })

  it('treats an unknown reference as no match, not an error', async () => {
    const { client } = clientByUrl(() => ({ body: NOT_FOUND, status: 404 }))
    expect(await listOrders('all', 'MO-0000000000', client)).toEqual({
      orders: [],
      counts: { all: 0, awaiting_rider: 0, in_progress: 0, delivered: 0, cancelled: 0 },
    })
  })

  it('matches other text against the newest orders only', async () => {
    const other = {
      ...ROW,
      reference: 'MO-ZZZZZZZZZZ',
      customer: { ...ROW.customer, name: 'Somebody Else', phone: '+2348099999999' },
      delivery_address: '9 Other Road, GRA, Enugu',
    }
    const { client } = clientByUrl(() => ({ body: page([ROW, other]) }))
    const result = await listOrders('all', ROW.customer.name, client)
    expect(result.orders.map((o) => o.reference)).toEqual([ROW.reference])
    expect(result.counts.all).toBe(1)
  })

  it('passes 403 forbidden through as an ApiError', async () => {
    const { client } = clientByUrl(() => ({ body: FORBIDDEN, status: 403 }))
    await expect(listOrders('all', undefined, client)).rejects.toMatchObject({ status: 403, code: 'forbidden' } satisfies Partial<ApiError>)
  })
})

describe('getOrder (real)', () => {
  it('loads and converts the detail', async () => {
    const { client } = clientByUrl(() => ({ body: DETAIL }))
    expect((await getOrder(DETAIL.reference, client)).station_name).toBe('Sample Borehole A')
  })

  it('passes 404 order_not_found through', async () => {
    const { client } = clientByUrl(() => ({ body: NOT_FOUND, status: 404 }))
    await expect(getOrder('MO-0000000000', client)).rejects.toMatchObject({ status: 404, code: 'order_not_found' } satisfies Partial<ApiError>)
  })
})
