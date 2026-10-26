import { describe, expect, it, vi } from 'vitest'
import adminOrderDetail from '../../../../docs/api/examples/admin-order-detail.json'
import adminOrderHistory from '../../../../docs/api/examples/admin-order-history.json'
import adminOrderHistoryCash from '../../../../docs/api/examples/admin-order-history-cash.json'
import dispatchDrivers from '../../../../docs/api/examples/dispatch-drivers.json'
import {
  assignDriver,
  getAdminOrderDetail,
  getOrderHistory,
  listDispatchDrivers,
  refusalReasons,
  withdrawAssignment,
} from './adminDispatch'
import { ApiError, createApiClient, CSRF_HEADER } from './client'

const BASE_URL = 'http://api.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body, status))
  const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  return { fetchMock, client }
}

function sent(fetchMock: ReturnType<typeof setup>['fetchMock']) {
  const [url, init] = fetchMock.mock.calls[0]
  return { url: String(url), init: init as RequestInit }
}

describe('cash on the order detail and history (payments.md, amendment 1; #135 samples)', () => {
  it('reads the cash history entries with their cash details', async () => {
    const { client } = setup(adminOrderHistoryCash)
    const [received, corrected, recorded] = await getOrderHistory('MO-7KQ2M9XH4T', undefined, client)
    expect(received.kind).toBe('cash_received')
    expect(received.cash).toMatchObject({ payment_status: 'paid', sms_status: 'accepted' })
    expect(corrected.cash).toMatchObject({ amount_minor_units: 4_500_000, previous_amount_minor_units: 4_000_000 })
    expect(recorded.cash?.amount_minor_units).toBe(4_000_000)
  })

  it('reads the payment on the order detail; an older server without it reads as none', async () => {
    const order = await getAdminOrderDetail('MO-7KQ2M9XH4T', undefined, setup(adminOrderDetail).client)
    expect(order.payment).toMatchObject({ method: 'pay_on_delivery', status: 'pending_collection', cash_collection: null })
    const older: Record<string, unknown> = { ...adminOrderDetail }
    delete older.payment
    expect((await getAdminOrderDetail('MO-7KQ2M9XH4T', undefined, setup(older).client)).payment).toBeNull()
  })
})

describe('admin dispatch API functions (docs/api/deliveries.md, "Admin dispatch endpoints")', () => {
  it('loads an order detail with its assignment (contract sample)', async () => {
    const { fetchMock, client } = setup(adminOrderDetail)
    const order = await getAdminOrderDetail('MO-7KQ2M9XH4T', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/orders/MO-7KQ2M9XH4T`)
    expect(order.assignment?.status).toBe('offered')
    expect(order.assignment?.driver.name).toBe('Sample Driver One')
  })

  it('reads a missing assignment as never offered', async () => {
    const withoutAssignment: Record<string, unknown> = { ...adminOrderDetail }
    delete withoutAssignment.assignment
    const { client } = setup(withoutAssignment)
    expect((await getAdminOrderDetail('MO-7KQ2M9XH4T', undefined, client)).assignment).toBeNull()
  })

  it('rejects an assignment status the screens do not know (Zod)', async () => {
    const { client } = setup({ ...adminOrderDetail, assignment: { ...adminOrderDetail.assignment, status: 'paused' } })
    const error = await getAdminOrderDetail('MO-7KQ2M9XH4T', undefined, client).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'parse', code: 'invalid_response' })
  })

  it('lists drivers with their eligibility reasons (contract sample)', async () => {
    const { fetchMock, client } = setup(dispatchDrivers)
    const drivers = await listDispatchDrivers('MO-7KQ2M9XH4T', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/orders/MO-7KQ2M9XH4T/drivers`)
    expect(drivers.map((driver) => driver.reasons)).toEqual([[], ['over_payload'], ['unavailable', 'busy'], ['no_driver_profile']])
  })

  it('lists a partner awaiting approval with not_approved (docs/api/partners.md)', async () => {
    const reasons = ['not_approved', 'no_driver_profile', 'unavailable']
    const { client } = setup({ items: [{ ...dispatchDrivers.items[0], reasons }] })
    const drivers = await listDispatchDrivers('MO-7KQ2M9XH4T', undefined, client)
    expect(drivers[0].reasons).toEqual(reasons)
  })

  it('rejects an unknown eligibility reason', async () => {
    const { client } = setup({ items: [{ ...dispatchDrivers.items[0], reasons: ['tired'] }] })
    await expect(listDispatchDrivers('MO-7KQ2M9XH4T', undefined, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('offers with POST, the driver id and the CSRF header', async () => {
    const { fetchMock, client } = setup(adminOrderDetail, 201)
    await assignDriver('MO-7KQ2M9XH4T', 'driver-1', client)
    const { url, init } = sent(fetchMock)
    expect(url).toBe(`${BASE_URL}/api/v1/admin/orders/MO-7KQ2M9XH4T/assign`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ driver_id: 'driver-1' })
    expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe('csrf-token')
  })

  it('withdraws with expected_status and the note', async () => {
    const { fetchMock, client } = setup({ ...adminOrderDetail, status: 'confirmed' })
    await withdrawAssignment('MO-7KQ2M9XH4T', { expected_status: 'accepted', note: 'Taken back.' }, client)
    const { url, init } = sent(fetchMock)
    expect(url).toBe(`${BASE_URL}/api/v1/admin/orders/MO-7KQ2M9XH4T/withdraw`)
    expect(JSON.parse(String(init.body))).toEqual({ expected_status: 'accepted', note: 'Taken back.' })
  })

  it('passes driver_not_eligible through with its reasons', async () => {
    const { client } = setup(
      { error: { code: 'driver_not_eligible', message: 'This driver cannot take this order.', details: { reasons: ['busy'] } } },
      409,
    )
    const error = (await assignDriver('MO-7KQ2M9XH4T', 'driver-1', client).catch((caught: unknown) => caught)) as ApiError
    expect(error.code).toBe('driver_not_eligible')
    expect(refusalReasons(error)).toEqual(['busy'])
  })

  it('reads no reasons from a malformed refusal', () => {
    const error = new ApiError({ kind: 'http', status: 409, code: 'driver_not_eligible', message: 'x', details: { reasons: 'busy' } })
    expect(refusalReasons(error)).toEqual([])
  })

  it('loads the history newest first (contract sample)', async () => {
    const { fetchMock, client } = setup(adminOrderHistory)
    const items = await getOrderHistory('MO-7KQ2M9XH4T', undefined, client)
    // Hold entries are asked for (contract decision 8).
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/orders/MO-7KQ2M9XH4T/history?include=holds`)
    expect(items[0].to_status).toBe('assigned')
    expect(items[1].assignment?.decline_reason).toBe('vehicle_cannot_carry')
  })

  it('accepts the row 26 manual_quote entry a confirmation writes (#113)', async () => {
    const entry = {
      id: 'e26',
      from_status: 'quote_requested',
      to_status: 'awaiting_confirmation',
      actor: { id: 'a1', role: 'admin', name: 'Sample Dispatcher' },
      reason_code: 'manual_quote',
      note: null,
      created_at: '2026-10-26T13:21:00Z',
      assignment: null,
    }
    const { client } = setup({ items: [entry] })
    const items = await getOrderHistory('MO-7KQ2M9XH4T', undefined, client)
    expect(items[0].reason_code).toBe('manual_quote')
  })

  it('accepts the five cash events before the backend sends them (#125), with or without the status fields', async () => {
    const at = '2026-10-27T16:00:00Z'
    const actor = { id: 'd1', role: 'driver', name: 'Sample Driver One' }
    const items = [
      { id: 'c1', kind: 'cash_recorded', from_status: null, to_status: null, actor, reason_code: null, note: null, created_at: at, assignment: null },
      // A cash event that leaves out the fields only status changes use.
      { id: 'c2', kind: 'cash_handed_over', actor, created_at: at },
      { id: 'c3', kind: 'cash_corrected', actor, note: 'Driver miscounted', created_at: at },
      { id: 'c4', kind: 'cash_received', actor, created_at: at },
      { id: 'c5', kind: 'cash_reconciled', actor, created_at: at },
    ]
    const { client } = setup({ items })
    const parsed = await getOrderHistory('MO-7KQ2M9XH4T', undefined, client)
    expect(parsed.map((entry) => entry.kind)).toEqual([
      'cash_recorded',
      'cash_handed_over',
      'cash_corrected',
      'cash_received',
      'cash_reconciled',
    ])
    expect(parsed[1]).toMatchObject({ from_status: null, to_status: null, reason_code: null, note: null, assignment: null })
    expect(parsed[2].note).toBe('Driver miscounted')
  })

  it('reads an event kind it does not know as "other" instead of failing the whole history', async () => {
    const { client } = setup({
      items: [{ id: 'x1', kind: 'payment_refunded', actor: null, created_at: '2026-10-27T16:00:00Z' }],
    })
    const [entry] = await getOrderHistory('MO-7KQ2M9XH4T', undefined, client)
    expect(entry.kind).toBe('other')
  })

  it('encodes the reference in every path', async () => {
    const { fetchMock, client } = setup({ items: [] })
    await getOrderHistory('MO 1/2', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/orders/MO%201%2F2/history?include=holds`)
  })
})
