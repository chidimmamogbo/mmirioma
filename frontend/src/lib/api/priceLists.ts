/**
 * Types and typed calls for the admin price list endpoints, mirroring
 * docs/api/admin-directory.md, "Price lists" (agreed 2026-10-26, built in
 * #37), and the water categories list for the Pricing screen's Water picker
 * ("Amendment (#160)", built in #161).
 *
 * Responses are checked at runtime with Zod, so an unexpected shape is
 * reported as `ApiError` `invalid_response` instead of showing a wrong price.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import type { PriceList, PriceListDraft, WaterCategoryOption } from '../../domain/admin'
import { apiClient, ApiError, type ApiClient } from './client'

const PRICE_LISTS_PATH = '/api/v1/admin/price-lists'
const WATER_CATEGORIES_PATH = '/api/v1/admin/water-categories'

const kobo = z.number().int().min(0)

const marginSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percentage'), basis_points: z.number().int().min(0).max(10_000) }),
  z.object({ type: z.literal('fixed'), amount_minor_units: kobo }),
])

/** A rule as stored (admin-directory.md, "Object"). */
const ruleSchema = z.object({
  id: z.string(),
  zone_id: z.string().nullable(),
  water_category_id: z.string().nullable(),
  min_litres: z.number().int(),
  max_litres: z.number().int().nullable(),
  base_delivery_fee_minor_units: kobo,
  distance_rate_minor_units_per_km: kobo,
  additional_trip_minor_units: kobo,
  handling_minor_units: kobo,
  margin: marginSchema,
})

/** `PriceList`. */
export const priceListSchema: z.ZodType<PriceList> = z.object({
  version: z.number().int(),
  effective_from: z.string(),
  created_by: z.object({ id: z.string(), name: z.string() }),
  reason: z.string().nullable(),
  rules: z.array(ruleSchema),
  changes: z.array(z.object({ path: z.string(), from: z.unknown(), to: z.unknown() })),
})

const priceListPageSchema = z.object({
  items: z.array(priceListSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})
export type PriceListPage = z.infer<typeof priceListPageSchema>

const waterCategoryListSchema = z.object({
  items: z.array(z.object({ id: z.string(), label: z.string(), is_active: z.boolean() })),
})

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError({
      kind: 'parse',
      status: 200,
      code: 'invalid_response',
      message: 'The server returned an unexpected response.',
      cause: result.error,
    })
  }
  return result.data
}

/**
 * The current price list (`GET /admin/price-lists/current`).
 *
 * @throws {ApiError} 404 `price_list_not_found` when none has been saved yet;
 *   `invalid_response`; shared 401/403; `network_error`.
 */
export async function getCurrentPriceList(signal?: AbortSignal, client: ApiClient = apiClient): Promise<PriceList> {
  return parse(priceListSchema, await client.request<unknown>(`${PRICE_LISTS_PATH}/current`, { signal }))
}

/**
 * Saved versions, newest first (`GET /admin/price-lists`), for the history.
 *
 * @throws {ApiError} 422 `validation_error`; `invalid_response`; shared 401/403.
 */
export async function listPriceLists(
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PriceListPage> {
  const query = new URLSearchParams({ limit: String(page.limit ?? 20), offset: String(page.offset ?? 0) })
  return parse(priceListPageSchema, await client.request<unknown>(`${PRICE_LISTS_PATH}?${query}`, { signal }))
}

/**
 * Save the whole set of rules as the next version (`POST /admin/price-lists`).
 *
 * @throws {ApiError} 409 `price_list_changed` (`details.current_version`),
 *   409 `price_list_unchanged`, 422 `price_rules_overlap` (`details[].loc`
 *   `["body","rules",i]`), 422 `validation_error`, 404
 *   `service_zone_not_found` or `water_category_not_found`.
 */
export async function createPriceList(draft: PriceListDraft, client: ApiClient = apiClient): Promise<PriceList> {
  return parse(priceListSchema, await client.request<unknown>(PRICE_LISTS_PATH, { method: 'POST', body: draft }))
}

/**
 * Every water category, active or not, by label (`GET /admin/water-categories`).
 *
 * @throws {ApiError} `invalid_response`; shared 401/403; `network_error`.
 */
export async function listWaterCategories(signal?: AbortSignal, client: ApiClient = apiClient): Promise<WaterCategoryOption[]> {
  return parse(waterCategoryListSchema, await client.request<unknown>(WATER_CATEGORIES_PATH, { signal })).items
}
