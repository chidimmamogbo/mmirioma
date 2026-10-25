import { describe, expect, it, vi } from 'vitest'
import cashDaySample from '../../../../docs/api/examples/admin-cash-day.json'
import driverSample from '../../../../docs/api/examples/admin-cash-driver.json'
import reconciliationSample from '../../../../docs/api/examples/cash-reconciliation.json'
import remittanceSample from '../../../../docs/api/examples/cash-remittance.json'
import { correctCollection, getCashDay, getDriverCash, receiveCash, reconcileCollections } from './adminCash'
import { createApiClient } from './client'

const BASE_URL = 'http://api.test'

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0]
    return { url: String(url), method: (init as RequestInit).method ?? 'GET', body: (init as RequestInit).body }
  }
  return { client, sent }
}

/** An `AdminCashCollection` as payments.md describes it (no example file exists yet). */
const collection = {
  id: '4d0b7a1e-9c2f-4e3a-8b5d-6f7a8b9c0d1e',
  order_reference: 'MO-7KQ2M9XH4T',
  amount_minor_units: 4_500_000,
  amount_due_minor_units: 4_500_000,
  note: null,
  status: 'remitted',
  collected_at: '2026-10-27T13:15:00Z',
  remittance_due_at: '2026-10-27T17:00:00Z',
  overdue: false,
  remitted_at: '2026-10-27T16:40:00Z',
  received_by: { id: 'a1', name: 'Sample Administrator' },
  reconciled_at: null,
  driver: { id: 'd1', name: 'Sample Driver' },
  customer: { name: 'Sample Customer', phone: '+2348000000001' },
  payment_status: 'paid',
  outstanding_balance_minor_units: 0,
  overpaid_minor_units: 0,
  remittance_id: 'c1d2',
  reconciled_by: null,
}

const cashDay = {
  date: '2026-10-27',
  totals: {
    recorded_minor_units: 18_250_000,
    received_minor_units: 9_000_000,
    reconciled_minor_units: 4_500_000,
    with_drivers_minor_units: 9_250_000,
    differences: 1,
  },
  drivers: [
    {
      driver: { id: 'd1', name: 'Sample Driver', vehicle: 'Tanker ENU-123-XY' },
      held_minor_units: 9_250_000,
      ready_minor_units: 4_750_000,
      remittance_due_at: '2026-10-27T17:00:00Z',
      overdue: false,
      last_received_at: '2026-10-26T16:40:00Z',
    },
  ],
  awaiting_reconciliation: [collection],
}

describe('the backend’s contract samples (#135) parse with the client schemas', () => {
  it('day, driver cash, remittance and reconciliation', async () => {
    const day = await getCashDay('2026-10-27', undefined, setup(cashDaySample).client)
    expect(day.drivers[0].driver.vehicle).toBe('Tanker truck')
    expect(day.awaiting_reconciliation[0].status).toBe('remitted')
    const driver = await getDriverCash('d1', undefined, setup(driverSample).client)
    expect(driver.collections[0].status).toBe('awaiting_remittance')
    const remittance = await receiveCash(
      { driver_id: 'd1', collection_ids: ['a'], counted_minor_units: 0, note: null },
      setup(remittanceSample, 201).client,
    )
    expect(remittance.orders[1]).toMatchObject({ payment_status: 'partially_paid', sms_status: 'failed' })
    const reconciled = await reconcileCollections({ collection_ids: ['a'], note: null }, setup(reconciliationSample).client)
    expect(reconciled[0].status).toBe('reconciled')
  })
})

describe('admin cash API functions (payments.md, "Admin endpoints")', () => {
  it('reads one Lagos day; a collection never corrected reads its correction fields as null', async () => {
    const { client, sent } = setup(cashDay)
    const day = await getCashDay('2026-10-27', undefined, client)
    expect(sent().url).toBe(`${BASE_URL}/api/v1/admin/cash?date=2026-10-27`)
    expect(day.totals.differences).toBe(1)
    expect(day.awaiting_reconciliation[0]).toMatchObject({ original_amount_minor_units: null, correction_reason: null })
  })

  it('reports an unknown collection status as invalid_response, never shown as a known step', async () => {
    const { client } = setup({ ...cashDay, awaiting_reconciliation: [{ ...collection, status: 'lost' }] })
    await expect(getCashDay('2026-10-27', undefined, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('reads a driver’s cash on hand', async () => {
    const { client, sent } = setup({ driver: { id: 'd1', name: 'Sample Driver' }, collections: [{ ...collection, status: 'collected' }] })
    const cash = await getDriverCash('d 1', undefined, client)
    expect(sent().url).toBe(`${BASE_URL}/api/v1/admin/cash/drivers/d%201`)
    expect(cash.collections[0].status).toBe('collected')
  })

  it('posts a correction, a receipt and a reconciliation with the agreed bodies', async () => {
    const corrected = { ...collection, status: 'collected', original_amount_minor_units: 450_000, corrected_at: '2026-10-27T15:00:00Z' }
    const correction = setup(corrected)
    const result = await correctCollection('c-1', { amount_minor_units: 4_500_000, reason: 'Typing mistake' }, correction.client)
    expect(correction.sent()).toMatchObject({ url: `${BASE_URL}/api/v1/admin/cash-collections/c-1/correction`, method: 'POST' })
    expect(JSON.parse(String(correction.sent().body))).toEqual({ amount_minor_units: 4_500_000, reason: 'Typing mistake' })
    expect(result.original_amount_minor_units).toBe(450_000)

    const remittance = {
      id: 'c1d2',
      driver: { id: 'd1', name: 'Sample Driver' },
      recorded_minor_units: 9_250_000,
      counted_minor_units: 9_050_000,
      difference_minor_units: -200_000,
      note: 'Short',
      received_by: { id: 'a1', name: 'Sample Administrator' },
      remitted_at: '2026-10-27T16:40:00Z',
      orders: [
        { reference: 'MO-7KQ2M9XH4T', payment_status: 'paid', outstanding_balance_minor_units: 0, overpaid_minor_units: 0, sms_status: 'accepted' },
        { reference: 'MO-3HF8P2LQ6D', payment_status: 'partially_paid', outstanding_balance_minor_units: 500_000, overpaid_minor_units: 0, sms_status: null },
      ],
    }
    const receipt = setup(remittance, 201)
    const request = { driver_id: 'd1', collection_ids: ['a', 'b'], counted_minor_units: 9_050_000, note: 'Short' }
    const received = await receiveCash(request, receipt.client)
    expect(receipt.sent()).toMatchObject({ url: `${BASE_URL}/api/v1/admin/cash-remittances`, method: 'POST' })
    expect(JSON.parse(String(receipt.sent().body))).toEqual(request)
    expect(received.orders[1].sms_status).toBeNull()

    const reconciliation = setup({ collections: [{ ...collection, status: 'reconciled' }] })
    const reconciled = await reconcileCollections({ collection_ids: ['a'], note: null }, reconciliation.client)
    expect(reconciliation.sent()).toMatchObject({ url: `${BASE_URL}/api/v1/admin/cash-reconciliations`, method: 'POST' })
    expect(reconciled[0].status).toBe('reconciled')
  })
})
