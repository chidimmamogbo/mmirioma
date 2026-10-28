/**
 * Pricing adapters (#173): the real-API side of the Pricing screen's calls in
 * `adminApi.ts`, against docs/api/admin-directory.md, "Price lists" (built in
 * #37) and the water categories list (#161). The design is
 * docs/design/admin-pricing.md (#44).
 *
 * The screen works in the contract's own shape (`PriceList`, `PriceRule`):
 * there is nothing to convert except "no price list yet" (404).
 */
import type { PriceList, PriceListDraft, WaterCategoryOption } from '../../../domain/admin'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import {
  createPriceList,
  getCurrentPriceList as fetchCurrent,
  listPriceLists,
  listWaterCategories as fetchWaterCategories,
} from '../../../lib/api/priceLists'
import { listAdminServiceZones } from '../../../lib/api/serviceZones'

/**
 * The current price list, or `null` when none has been saved yet
 * (404 `price_list_not_found`: the design's "No price list yet").
 *
 * @throws {ApiError} Other errors unchanged.
 */
export async function getCurrentPriceList(client: ApiClient = apiClient): Promise<PriceList | null> {
  try {
    return await fetchCurrent(undefined, client)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'price_list_not_found') return null
    throw error
  }
}

/** The newest 20 versions, newest first, for the version history. */
export async function priceListHistory(client: ApiClient = apiClient): Promise<PriceList[]> {
  return (await listPriceLists({ limit: 20 }, undefined, client)).items
}

/**
 * Save the whole set of rules as the next version.
 *
 * @throws {ApiError} 409 `price_list_changed` / `price_list_unchanged`, 422
 *   `price_rules_overlap` / `validation_error`, 404 `service_zone_not_found` /
 *   `water_category_not_found`, as the server sends them.
 */
export async function savePriceList(draft: PriceListDraft, client: ApiClient = apiClient): Promise<PriceList> {
  return createPriceList(draft, client)
}

/** Every water category, active or not, for the Water picker. */
export async function waterCategories(client: ApiClient = apiClient): Promise<WaterCategoryOption[]> {
  return fetchWaterCategories(undefined, client)
}

/** The areas the Area picker offers: every service zone, active or not, by name. */
export async function priceAreas(client: ApiClient = apiClient): Promise<{ id: string; name: string; is_active: boolean }[]> {
  return (await listAdminServiceZones(undefined, client)).items.map((z) => ({ id: z.id, name: z.name, is_active: z.is_active }))
}
