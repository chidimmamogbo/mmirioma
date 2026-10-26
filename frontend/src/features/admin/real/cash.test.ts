import { describe, expect, it, vi } from 'vitest'
import cashDaySample from '../../../../../docs/api/examples/admin-cash-day.json'
import driverSample from '../../../../../docs/api/examples/admin-cash-driver.json'
import reconciliationSample from '../../../../../docs/api/examples/cash-reconciliation.json'
import remittanceSample from '../../../../../docs/api/examples/cash-remittance.json'
import changedSample from '../../../../../docs/api/examples/error-cash-collection-changed.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { correctCollection, getCashDay, getDriverCash, receiveCash, reconcileCollections } from './cash'

/** A client whose `fetch` answers every request with `body` and `status`, recording what was sent. */
function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0]
    const request = init as RequestInit
    return { url: String(url), method: request.method ?? 'GET', body: request.body ? JSON.parse(String(request.body)) : null }
  }
  return { client, sent }
}

function envelope(code: string, details: unknown = null) {
  return { error: { code, message: `Sample ${code}`, details } }
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

/** A received record from the contract sample, to correct. */
const collection = reconciliationSample.collections[0]

describe('admin cash adapters (#19)', () => {
  it('getCashDay asks for the Lagos day and returns the contract shape', async () => {
    const { client, sent } = setup(cashDaySample)
    const day = await getCashDay('2026-10-27', client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/cash?date=2026-10-27', method: 'GET' })
    expect(day.totals.recorded_minor_units).toBe(cashDaySample.totals.recorded_minor_units)
    expect(day.drivers).toHaveLength(cashDaySample.drivers.length)
  })

  it('getCashDay passes a 422 through', async () => {
    const error = await rejection(getCashDay('27-10-2026', setup(envelope('validation_error'), 422).client))
    expect([error.status, error.code]).toEqual([422, 'validation_error'])
  })

  it('getDriverCash returns the driver and records', async () => {
    const { client, sent } = setup(driverSample)
    const cash = await getDriverCash('d1', client)
    expect(sent().url).toBe('http://api.test/api/v1/admin/cash/drivers/d1')
    expect(cash.collections[0].status).toBe('awaiting_remittance')
  })

  it('getDriverCash passes driver_not_found through', async () => {
    const error = await rejection(getDriverCash('nobody', setup(envelope('driver_not_found'), 404).client))
    expect([error.status, error.code]).toEqual([404, 'driver_not_found'])
  })

  it('correctCollection posts the amount and reason', async () => {
    const corrected = { ...collection, status: 'collected', amount_minor_units: 4_500_000, original_amount_minor_units: 450_000 }
    const { client, sent } = setup(corrected)
    const result = await correctCollection('c1', { amount_minor_units: 4_500_000, reason: 'Typing mistake' }, client)
    expect(sent()).toMatchObject({
      url: 'http://api.test/api/v1/admin/cash-collections/c1/correction',
      method: 'POST',
      body: { amount_minor_units: 4_500_000, reason: 'Typing mistake' },
    })
    expect(result.original_amount_minor_units).toBe(450_000)
  })

  it('correctCollection passes cash_collection_changed through', async () => {
    const error = await rejection(correctCollection('c1', { amount_minor_units: 100, reason: 'x' }, setup(changedSample, 409).client))
    expect([error.status, error.code]).toEqual([409, 'cash_collection_changed'])
  })

  it('receiveCash posts the handover and returns each order’s payment and SMS outcome', async () => {
    const { client, sent } = setup(remittanceSample, 201)
    const request = { driver_id: 'd1', collection_ids: ['a', 'b'], counted_minor_units: 9_050_000, note: 'Short' }
    const result = await receiveCash(request, client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/cash-remittances', method: 'POST', body: request })
    expect(result.orders.map((o) => o.payment_status)).toEqual(remittanceSample.orders.map((o) => o.payment_status))
  })

  it('receiveCash passes cash_collection_changed with its ids through', async () => {
    const error = await rejection(receiveCash({ driver_id: 'd1', collection_ids: ['a'], counted_minor_units: 0, note: null }, setup(changedSample, 409).client))
    expect(error.code).toBe('cash_collection_changed')
    expect(error.details).toEqual(changedSample.error.details)
  })

  it('reconcileCollections posts the ids and returns the records', async () => {
    const { client, sent } = setup(reconciliationSample)
    const records = await reconcileCollections({ collection_ids: ['a'], note: null }, client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/cash-reconciliations', method: 'POST', body: { collection_ids: ['a'], note: null } })
    expect(records[0].status).toBe('reconciled')
  })

  it('reconcileCollections passes csrf_failed through', async () => {
    const error = await rejection(reconcileCollections({ collection_ids: ['a'], note: null }, setup(envelope('csrf_failed'), 403).client))
    expect([error.status, error.code]).toEqual([403, 'csrf_failed'])
  })
})
