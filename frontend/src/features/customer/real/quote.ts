/**
 * Live price adapters (#121): the real-API side of `listServiceZones` and
 * `getQuote` in `customerApi.ts`, against `GET /service-zones` and `POST
 * /quotes` (docs/api/order-details-and-price.md, built in #21 and #30).
 *
 * Total only: the server never sends a breakdown to customers (decision 6),
 * so nothing here adds one.
 */
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { createQuote, listServiceZones as fetchServiceZones, type QuoteCreate, type QuoteRead } from '../../../lib/api/quotes'
import type { AreaOption, PriceQuote, PriceRequest } from '../order/livePrice'

/** Backend quote to the screen's price (order-details-and-price.md, "Mapping to the design types"). */
export function priceFromRead(read: QuoteRead): PriceQuote {
  if (read.status === 'manual_quote_required') return { status: 'manual_quote_required', reason: read.reason }
  return {
    status: 'quote_available',
    quote_id: read.quote_id,
    total_minor_units: read.total_minor_units,
    price_valid_until: read.price_valid_until,
    quantity_litres: read.quantity_litres,
    category: { label: read.water_category.label, supported_uses: read.water_category.supported_uses },
    is_sample: false,
  }
}

/**
 * The `POST /quotes` body for a price request. Its delivery details match
 * what `orderCreateFromInput` sends, so the order matches the quote
 * (order-details-and-price.md, "When a quote matches the order").
 *
 * @throws {ApiError} `validation_error` for a custom tank size with no
 *   gallons, which the Tanker screen already prevents.
 */
export function quoteCreateFromRequest(request: PriceRequest): QuoteCreate {
  const body: QuoteCreate = { delivery_type: request.choice.delivery_type, delivery_address: request.address }
  if (request.choice.delivery_type === 'keke') {
    body.keke = { can_size_litres: request.choice.can_size_litres, can_count: request.choice.can_count }
  } else {
    const gallons = request.choice.tank_size_gallons ?? request.custom_gallons
    if (gallons === null) {
      throw new ApiError({ kind: 'config', status: null, code: 'validation_error', message: 'Enter your tank size in gallons.' })
    }
    body.tanker = { tank_type: request.choice.tank_type, quantity_local_gallons: gallons }
    body.water_source = request.choice.source
  }
  if (request.zone_id) body.service_zone_id = request.zone_id
  return body
}

/** The areas a customer can pick, by name. */
export async function listServiceZones(client: ApiClient = apiClient): Promise<AreaOption[]> {
  const list = await fetchServiceZones(undefined, client)
  return list.items.map((z) => ({ id: z.id, name: z.name }))
}

/**
 * A price for the order, or the reason there is none in the app.
 *
 * @throws {ApiError} 404 `service_zone_not_found`; 422 `validation_error`;
 *   429 `too_many_attempts`.
 */
export async function getQuote(request: PriceRequest, client: ApiClient = apiClient): Promise<PriceQuote> {
  return priceFromRead(await createQuote(quoteCreateFromRequest(request), client))
}
