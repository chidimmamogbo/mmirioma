/**
 * Admin price list adapters (#173, part 1): the real-API side of the read
 * functions in `adminApi.ts`, against docs/api/admin-directory.md, "Price
 * lists" and the water categories amendment (#160). The backend's shape is the
 * design type's (`PriceList` in `domain/admin.ts`), so nothing is converted:
 * the adapter only turns "no price list yet" into `null` for the screen.
 *
 * Saving a version is added with the rule sheet (part 2).
 */
import type { PriceList, WaterCategoryOption } from '../../../domain/admin'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import { getCurrentPriceList as getCurrent, listPriceListVersions, listWaterCategories as listCategories } from '../../../lib/api/priceLists'

/** How many versions the history shows (the newest first); the server allows up to 100. */
export const HISTORY_LIMIT = 20

/**
 * The current price list, or `null` when none is saved yet.
 *
 * @throws {ApiError} As the server sends it (401, 403, network), but never
 *   `price_list_not_found`: that is the `null` answer.
 */
export async function getCurrentPriceList(client: ApiClient = apiClient): Promise<PriceList | null> {
  try {
    return await getCurrent(undefined, client)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'price_list_not_found') return null
    throw error
  }
}

/**
 * The latest versions, newest first, for the history.
 *
 * @throws {ApiError} As the server sends it (401, 403, network).
 */
export async function listPriceListHistory(client: ApiClient = apiClient): Promise<PriceList[]> {
  return (await listPriceListVersions({ limit: HISTORY_LIMIT, offset: 0 }, undefined, client)).items
}

/**
 * Every water category, active or not, by label, for the Water picker and the
 * names in the rules.
 *
 * @throws {ApiError} As the server sends it (401, 403, network).
 */
export async function listWaterCategories(client: ApiClient = apiClient): Promise<WaterCategoryOption[]> {
  return listCategories(undefined, client)
}
