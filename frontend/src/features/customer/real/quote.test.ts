import { describe, expect, it, vi } from 'vitest'
import availableSample from '../../../../../docs/api/examples/quote-available.json'
import manualSample from '../../../../../docs/api/examples/quote-manual.json'
import zonesSample from '../../../../../docs/api/examples/service-zones.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import type { QuoteRead } from '../../../lib/api/quotes'
import type { PriceRequest } from '../order/livePrice'
import { getQuote, listServiceZones, priceFromRead, quoteCreateFromRequest } from './quote'

/** The agreed contract's examples (docs/api/order-details-and-price.md, admin-directory.md). */
const AVAILABLE = availableSample as QuoteRead
const MANUAL = manualSample as QuoteRead

function clientReturning(...responses: { body: unknown; status?: number }[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const { body, status = 200 } of responses) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  }
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

const TANKER: PriceRequest = {
  choice: { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: 750, source: 'borehole' },
  address: '12 Sample Close, Independence Layout, Enugu',
  zone_id: '9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b',
  custom_gallons: null,
}

describe('priceFromRead', () => {
  it('keeps the total, validity, litres and category, and nothing else (total only)', () => {
    expect(priceFromRead(AVAILABLE)).toEqual({
      status: 'quote_available',
      quote_id: 'c7e1b9a2-4d3f-4a6b-8e05-9f2d1c0b3a74',
      total_minor_units: 2_000_000,
      price_valid_until: '2026-10-26T13:30:00Z',
      quantity_litres: 3000,
      category: { label: 'Utility Water', supported_uses: null },
      is_sample: false,
    })
  })

  it('keeps a manual quote as its reason code', () => {
    expect(priceFromRead(MANUAL)).toEqual({ status: 'manual_quote_required', reason: 'no_vehicle_plan' })
  })
})

describe('quoteCreateFromRequest', () => {
  it('matches the contract example request for a Tanker', () => {
    expect(quoteCreateFromRequest(TANKER)).toEqual({
      delivery_type: 'tanker',
      tanker: { tank_type: 'ground', quantity_local_gallons: 750 },
      water_source: 'borehole',
      delivery_address: '12 Sample Close, Independence Layout, Enugu',
      service_zone_id: '9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b',
    })
  })

  it('sends cans for Keke, the typed gallons for a custom size, and no zone for "not listed"', () => {
    const keke = quoteCreateFromRequest({ ...TANKER, choice: { delivery_type: 'keke', can_size_litres: 25, can_count: 24 }, zone_id: null })
    expect(keke).toEqual({ delivery_type: 'keke', keke: { can_size_litres: 25, can_count: 24 }, delivery_address: TANKER.address })
    const custom = quoteCreateFromRequest({ ...TANKER, choice: { ...TANKER.choice, tank_size_gallons: null } as PriceRequest['choice'], custom_gallons: 2000 })
    expect(custom.tanker).toEqual({ tank_type: 'ground', quantity_local_gallons: 2000 })
  })

  it('refuses a custom tank size with no gallons instead of guessing one', () => {
    expect(() => quoteCreateFromRequest({ ...TANKER, choice: { ...TANKER.choice, tank_size_gallons: null } as PriceRequest['choice'] })).toThrow(ApiError)
  })
})

describe('getQuote (real)', () => {
  it('posts the request and converts the price', async () => {
    const { fetch, client } = clientReturning({ body: AVAILABLE })
    const price = await getQuote(TANKER, client)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://api.test/api/v1/quotes')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toMatchObject({ service_zone_id: TANKER.zone_id })
    expect(price.status).toBe('quote_available')
  })

  it('passes 429 too_many_attempts through with its wait', async () => {
    const limited = { error: { code: 'too_many_attempts', message: 'Too many attempts', details: { retry_after_seconds: 240 } } }
    const { client } = clientReturning({ body: limited, status: 429 })
    await expect(getQuote(TANKER, client)).rejects.toMatchObject({ status: 429, code: 'too_many_attempts', details: { retry_after_seconds: 240 } })
  })

  it('passes 404 service_zone_not_found through', async () => {
    const { client } = clientReturning({ body: { error: { code: 'service_zone_not_found', message: 'Service zone not found', details: null } }, status: 404 })
    await expect(getQuote(TANKER, client)).rejects.toMatchObject({ status: 404, code: 'service_zone_not_found' } satisfies Partial<ApiError>)
  })
})

describe('listServiceZones (real)', () => {
  it('loads the areas from the contract example, id and name only', async () => {
    const { fetch, client } = clientReturning({ body: zonesSample })
    const zones = await listServiceZones(client)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/service-zones')
    expect(zones).toEqual(zonesSample.items.map((z: { id: string; name: string }) => ({ id: z.id, name: z.name })))
  })

  it('passes a 503 through', async () => {
    const { client } = clientReturning({ body: { error: { code: 'service_unavailable', message: 'Try again later', details: null } }, status: 503 })
    await expect(listServiceZones(client)).rejects.toMatchObject({ status: 503 } satisfies Partial<ApiError>)
  })
})
