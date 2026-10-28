/**
 * Types and typed calls for the admin price list and water category
 * endpoints, mirroring docs/api/admin-directory.md, "Price lists" (agreed
 * 2026-10-26, built in #37) and "Amendment (#160): the list of water
 * categories" (agreed 2026-10-28, built in #161).
 *
 * Responses are checked at runtime with Zod, so an unexpected shape is
 * reported as `ApiError` `invalid_response` instead of showing a wrong price.
 * Reading only for now: saving a version is added with the rule sheet.
 *
 * If the contract changes, update these schemas and `PriceList` in
 * `domain/admin.ts` in the same PR.
 */

import { z } from 'zod'
import type { PriceList, PriceListPage, WaterCategoryOption } from '../../domain/admin'
import { apiClient, ApiError, type ApiClient } from './client'

const PRICE_LISTS_PATH = '/api/v1/admin/price-lists'
const WATER_CATEGORIES_PATH = '/api/v1/admin/water-categories'

/** Amounts are integer kobo, at least 0 (BR-01). */
const kobo = z.number().int().min(0)

/** `rules[].margin`: a fixed amount in kobo, or a percentage in basis points (1 % = 100). */
const marginSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed'), amount_minor_units: kobo }),
  z.object({ type: z.literal('percentage'), basis_points: z.number().int().min(0).max(10_000) }),
])

const priceRuleSchema = z.object({
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

/** `PriceList` (admin-directory.md, "Object"). */
export const priceListSchema: z.ZodType<PriceList> = z.object({
  version: z.number().int(),
  effective_from: z.string(),
  created_by: z.object({ id: z.string(), name: z.string() }),
  reason: z.string().nullable(),
  rules: z.array(priceRuleSchema),
  changes: z.array(z.object({ path: z.string(), from: z.unknown(), to: z.unknown() })),
})

const priceListPageSchema: z.ZodType<PriceListPage> = z.object({
  items: z.array(priceListSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

/** `AdminWaterCategory`: no `code`, no description, no price. */
const waterCategoryListSchema: z.ZodType<{ items: WaterCategoryOption[] }> = z.object({
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
 * @throws {ApiError} `price_list_not_found` (404) when none is saved yet;
 *   shared 401/403; `invalid_response`; `network_error`.
 */
export async function getCurrentPriceList(signal?: AbortSignal, client: ApiClient = apiClient): Promise<PriceList> {
  return parse(priceListSchema, await client.request<unknown>(`${PRICE_LISTS_PATH}/current`, { signal }))
}

/**
 * A page of price list versions, newest first (`GET /admin/price-lists`).
 *
 * @param params - `limit` (1-100) and `offset`.
 * @throws {ApiError} `validation_error` (422) for a limit or offset out of range;
 *   shared 401/403; `invalid_response`; `network_error`.
 */
export async function listPriceListVersions(
  params: { limit: number; offset: number },
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PriceListPage> {
  const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) })
  return parse(priceListPageSchema, await client.request<unknown>(`${PRICE_LISTS_PATH}?${query}`, { signal }))
}

/**
 * Every water category, active or not, by label (`GET /admin/water-categories`).
 *
 * @throws {ApiError} shared 401/403; `invalid_response`; `network_error`.
 */
export async function listWaterCategories(signal?: AbortSignal, client: ApiClient = apiClient): Promise<WaterCategoryOption[]> {
  return parse(waterCategoryListSchema, await client.request<unknown>(WATER_CATEGORIES_PATH, { signal })).items
}
