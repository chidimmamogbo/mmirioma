import { describe, expect, it, vi } from 'vitest'
import priceListSample from '../../../../../docs/api/examples/admin-price-list.json'
import waterCategoriesSample from '../../../../../docs/api/examples/admin-water-categories.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { getCurrentPriceList, HISTORY_LIMIT, listPriceListHistory, listWaterCategories } from './prices'

/** A client whose `fetch` answers every request with `body` and `status`, recording what was sent. */
function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0]
    return { url: String(url), method: (init as RequestInit).method ?? 'GET' }
  }
  return { client, sent }
}

const envelope = (code: string) => ({ error: { code, message: `Sample ${code}`, details: null } })

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('admin price list adapters (#173)', () => {
  it('getCurrentPriceList reads the contract example', async () => {
    const { client, sent } = setup(priceListSample)
    const list = await getCurrentPriceList(client)
    expect(sent()).toEqual({ url: 'http://api.test/api/v1/admin/price-lists/current', method: 'GET' })
    expect(list?.version).toBe(3)
    expect(list?.rules).toHaveLength(3)
    expect(list?.rules[1].margin).toEqual({ type: 'percentage', basis_points: 1000 })
    expect(list?.created_by.name).toBe('Sample Dispatcher')
  })

  it('getCurrentPriceList answers null when no price list is saved yet', async () => {
    const { client } = setup(envelope('price_list_not_found'), 404)
    expect(await getCurrentPriceList(client)).toBeNull()
  })

  it('getCurrentPriceList passes a 403 through', async () => {
    const error = await rejection(getCurrentPriceList(setup(envelope('forbidden'), 403).client))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })

  it('getCurrentPriceList reports an unexpected shape as invalid_response', async () => {
    const error = await rejection(getCurrentPriceList(setup({ ...priceListSample, rules: [{ id: 'x' }] }).client))
    expect(error.code).toBe('invalid_response')
  })

  it('getCurrentPriceList refuses a margin of an unknown type', async () => {
    const rule = { ...priceListSample.rules[0], margin: { type: 'free' } }
    const error = await rejection(getCurrentPriceList(setup({ ...priceListSample, rules: [rule] }).client))
    expect(error.code).toBe('invalid_response')
  })

  it('listPriceListHistory asks for the newest versions and returns the items', async () => {
    const { client, sent } = setup({ items: [priceListSample], total: 1, limit: HISTORY_LIMIT, offset: 0 })
    const versions = await listPriceListHistory(client)
    expect(sent()).toEqual({ url: `http://api.test/api/v1/admin/price-lists?limit=${HISTORY_LIMIT}&offset=0`, method: 'GET' })
    expect(versions.map((v) => v.version)).toEqual([3])
  })

  it('listPriceListHistory passes a 422 through', async () => {
    const error = await rejection(listPriceListHistory(setup(envelope('validation_error'), 422).client))
    expect([error.status, error.code]).toEqual([422, 'validation_error'])
  })

  it('listWaterCategories reads the contract example, with no code', async () => {
    const { client, sent } = setup(waterCategoriesSample)
    const categories = await listWaterCategories(client)
    expect(sent()).toEqual({ url: 'http://api.test/api/v1/admin/water-categories', method: 'GET' })
    expect(categories).toEqual(waterCategoriesSample.items)
    expect(categories.every((c) => !('code' in c))).toBe(true)
  })

  it('listWaterCategories passes a 401 through', async () => {
    const error = await rejection(listWaterCategories(setup(envelope('not_authenticated'), 401).client))
    expect([error.status, error.code]).toEqual([401, 'not_authenticated'])
  })
})
