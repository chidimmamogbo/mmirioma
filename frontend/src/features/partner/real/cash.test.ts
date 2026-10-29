import { describe, expect, it, vi } from 'vitest'
import cashCollection from '../../../../../docs/api/examples/cash-collection.json'
import driverCash from '../../../../../docs/api/examples/driver-cash.json'
import alreadyRecorded from '../../../../../docs/api/examples/error-cash-already-recorded.json'
import collectionChanged from '../../../../../docs/api/examples/error-cash-collection-changed.json'
import orderNotFound from '../../../../../docs/api/examples/error-order-not-found.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { getMyCash, handOverCash, recordCash } from './cash'

type Reply = { body: unknown; status?: number }

/** A client whose `fetch` answers each request with the next reply, recording what was sent. */
function setup(...replies: Reply[]) {
  const queue = [...replies]
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const { body, status = 200 } = queue.shift() ?? { body: null, status: 500 }
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call]
    const request = init as RequestInit
    return { url: String(url), method: request.method ?? 'GET', body: request.body ? JSON.parse(String(request.body)) : null }
  }
  return { client, sent }
}

const envelope = (code: string, details: unknown = null) => ({ error: { code, message: `Sample ${code}`, details } })

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  if (!(error instanceof ApiError)) throw new Error('expected an ApiError')
  return error
}

describe('driver cash adapters (#20)', () => {
  it('reads the partner cash from GET /driver/cash', async () => {
    const { client, sent } = setup({ body: driverCash })
    const cash = await getMyCash(client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/driver/cash', method: 'GET' })
    expect(cash.on_hand_minor_units).toBe(driverCash.on_hand_minor_units)
    expect(cash.collections).toHaveLength(driverCash.collections.length)
  })

  it('reports an unexpected cash body as invalid_response, never as wrong amounts', async () => {
    const { client } = setup({ body: { ...driverCash, on_hand_minor_units: 'lots' } })
    expect((await rejection(getMyCash(client))).code).toBe('invalid_response')
  })

  it('records cash with the amount in kobo and the note', async () => {
    const { client, sent } = setup({ body: cashCollection, status: 201 })
    const row = await recordCash('MO-7KQ2M9XH4T', { amount_minor_units: 4_000_000, note: 'Paid part.' }, client)
    expect(sent()).toMatchObject({
      url: 'http://api.test/api/v1/driver/jobs/MO-7KQ2M9XH4T/cash-collection',
      method: 'POST',
      body: { amount_minor_units: 4_000_000, note: 'Paid part.' },
    })
    expect(row.id).toBe(cashCollection.id)
  })

  it('passes cash_already_recorded through with the recorded amount', async () => {
    const { client } = setup({ body: alreadyRecorded, status: 409 })
    const error = await rejection(recordCash('MO-7KQ2M9XH4T', { amount_minor_units: 650_000, note: null }, client))
    expect(error.code).toBe('cash_already_recorded')
    expect(error.status).toBe(409)
  })

  it('passes order_not_found and transition_requirements_unmet through', async () => {
    const { client } = setup({ body: orderNotFound, status: 404 }, { body: envelope('transition_requirements_unmet', { missing: ['unloading_completed'] }), status: 409 })
    expect((await rejection(recordCash('MO-GONE', { amount_minor_units: 0, note: 'x' }, client))).code).toBe('order_not_found')
    expect((await rejection(recordCash('MO-EARLY', { amount_minor_units: 0, note: 'x' }, client))).code).toBe('transition_requirements_unmet')
  })

  it('hands over the chosen records and returns the cash after the change', async () => {
    const { client, sent } = setup({ body: driverCash })
    const ids = [driverCash.collections[0].id]
    await handOverCash(ids, client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/driver/cash/handover', method: 'POST', body: { collection_ids: ids } })
  })

  it('passes cash_collection_changed through', async () => {
    const { client } = setup({ body: collectionChanged, status: 409 })
    expect((await rejection(handOverCash(['a'], client))).code).toBe('cash_collection_changed')
  })
})
