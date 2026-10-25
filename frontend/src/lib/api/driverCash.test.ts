import { describe, expect, it, vi } from 'vitest'
import cashCollectionRequestExample from '../../../../docs/api/examples/cash-collection-request.json'
import cashCollectionExample from '../../../../docs/api/examples/cash-collection.json'
import driverCashExample from '../../../../docs/api/examples/driver-cash.json'
import alreadyRecordedExample from '../../../../docs/api/examples/error-cash-already-recorded.json'
import { ApiError, createApiClient, CSRF_HEADER } from './client'
import { getMyCash, handOverCash, recordCash, type DriverCash } from './driverCash'

const BASE_URL = 'http://api.test'
const CASH = `${BASE_URL}/api/v1/driver/cash`

/** Shaped as in docs/api/payments.md, "GET /driver/cash". */
const DRIVER_CASH: DriverCash = {
  on_hand_minor_units: 9250000,
  ready_minor_units: 4750000,
  remittance_due_at: '2026-10-27T17:00:00Z',
  overdue: false,
  collections: [
    {
      id: '4d0b7a1e-9c2f-4e3a-8b5d-6f7a8b9c0d1e',
      order_reference: 'MO-7KQ2M9XH4T',
      amount_minor_units: 4500000,
      amount_due_minor_units: 4500000,
      note: null,
      status: 'collected',
      collected_at: '2026-10-27T13:15:00Z',
      remittance_due_at: '2026-10-27T17:00:00Z',
      overdue: false,
      remitted_at: null,
      received_by: null,
      reconciled_at: null,
    },
  ],
}

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  return { fetchMock, client }
}

function sent(fetchMock: ReturnType<typeof setup>['fetchMock']) {
  const [url, init] = fetchMock.mock.calls[0]
  const request = init as RequestInit
  return {
    url: String(url),
    method: request.method ?? 'GET',
    body: request.body ? JSON.parse(String(request.body)) : null,
    csrf: new Headers(request.headers).get(CSRF_HEADER),
  }
}

describe('driver cash calls', () => {
  it('reads the driver cash', async () => {
    const { fetchMock, client } = setup(DRIVER_CASH)
    await expect(getMyCash(undefined, client)).resolves.toEqual(DRIVER_CASH)
    expect(sent(fetchMock)).toMatchObject({ url: CASH, method: 'GET' })
  })

  it('accepts the contract example the backend is tested against (#123)', async () => {
    const { client } = setup(driverCashExample)
    const cash = await getMyCash(undefined, client)
    expect(cash.collections.map((collection) => collection.status)).toEqual(['collected', 'awaiting_remittance', 'remitted'])
    expect(cash.collections[2].received_by?.name).toBe('Sample Administrator')
  })

  it('reports an unknown collection status as invalid_response', async () => {
    const { client } = setup({ ...DRIVER_CASH, collections: [{ ...DRIVER_CASH.collections[0], status: 'lost' }] })
    await expect(getMyCash(undefined, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('hands over the chosen records with POST and the CSRF token', async () => {
    const { fetchMock, client } = setup(DRIVER_CASH)
    await handOverCash(['a', 'b'], client)
    expect(sent(fetchMock)).toEqual({
      url: `${CASH}/handover`,
      method: 'POST',
      body: { collection_ids: ['a', 'b'] },
      csrf: 'csrf-token',
    })
  })

  it('passes cash_collection_changed through with its details', async () => {
    const { client } = setup(
      {
        error: {
          code: 'cash_collection_changed',
          message: 'This cash record has changed.',
          details: { collection_ids: ['a'] },
        },
      },
      409,
    )
    const error = await handOverCash(['a'], client).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'cash_collection_changed', details: { collection_ids: ['a'] } })
  })
})

describe('recording cash (K1)', () => {
  const REQUEST = { amount_minor_units: 4000000, note: 'Customer paid N40,000 and will pay the rest to the office.' }

  it('posts the amount and note with the CSRF token, reference encoded', async () => {
    const { fetchMock, client } = setup(cashCollectionExample, 201)
    await recordCash('MO 1/2', REQUEST, client)
    expect(sent(fetchMock)).toEqual({
      url: `${BASE_URL}/api/v1/driver/jobs/MO%201%2F2/cash-collection`,
      method: 'POST',
      body: REQUEST,
      csrf: 'csrf-token',
    })
  })

  it('accepts the contract example and the request example matches the body sent', async () => {
    const { client } = setup(cashCollectionExample, 201)
    const collection = await recordCash('MO-7KQ2M9XH4T', cashCollectionRequestExample, client)
    expect(collection).toMatchObject({ status: 'collected', amount_minor_units: 4000000, amount_due_minor_units: 4500000 })
    expect(cashCollectionRequestExample).toEqual(REQUEST)
  })

  it('passes cash_already_recorded through with the recorded amount', async () => {
    const { client } = setup(alreadyRecordedExample, 409)
    const error = await recordCash('MO-7KQ2M9XH4T', REQUEST, client).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'cash_already_recorded', details: { amount_minor_units: 4000000 } })
  })

  it('reports a fractional amount as invalid_response', async () => {
    const { client } = setup({ ...cashCollectionExample, amount_minor_units: 4000000.5 }, 201)
    await expect(recordCash('MO-7KQ2M9XH4T', REQUEST, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
