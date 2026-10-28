/**
 * SAMPLE price list versions in the contract's shape (FR-022), for mock mode
 * only. Every rate, name and date here is a sample, not an agreed price.
 *
 * Three versions, oldest first: v1 the first list (two bands for every area),
 * v2 a higher handling cost for the first band, v3 a rule of GRA's own for
 * utility water. The area ids are the mock service areas' (`adminSeed.ts`).
 */
import type { PriceList, PriceRule, WaterCategoryOption } from '../domain/admin'

/** The two categories the mock offers, by label (as `GET /admin/water-categories`). */
export const SAMPLE_WATER_CATEGORIES: WaterCategoryOption[] = [
  { id: 'wc-potable', label: 'Potable Water', is_active: false },
  { id: 'wc-utility', label: 'Utility Water', is_active: true },
]

const SAMPLE_ADMIN = { id: 'user-admin', name: 'Chidimma M.' }

function rule(id: string, over: Partial<PriceRule>): PriceRule {
  return {
    id,
    zone_id: null,
    water_category_id: null,
    min_litres: 600,
    max_litres: null,
    base_delivery_fee_minor_units: 200_000,
    distance_rate_minor_units_per_km: 15_000,
    additional_trip_minor_units: 150_000,
    handling_minor_units: 40_000,
    margin: { type: 'percentage', basis_points: 1000 },
    ...over,
  }
}

/** Sample versions, oldest first; the last one is current. */
export function samplePriceVersions(): PriceList[] {
  const small = rule('pr-small', { max_litres: 1999 })
  const large = rule('pr-large', { min_litres: 2000, handling_minor_units: 50_000, margin: { type: 'fixed', amount_minor_units: 50_000 } })
  const v1: PriceList = {
    version: 1,
    effective_from: '2026-09-01T09:00:00Z',
    created_by: SAMPLE_ADMIN,
    reason: null,
    rules: [small, large],
    changes: [],
  }
  const smallV2 = { ...small, handling_minor_units: 50_000 }
  const v2: PriceList = {
    version: 2,
    effective_from: '2026-10-01T09:00:00Z',
    created_by: SAMPLE_ADMIN,
    reason: 'Diesel price rise',
    rules: [smallV2, large],
    changes: [{ path: 'rules[0].handling_minor_units', from: 40_000, to: 50_000 }],
  }
  const gra = rule('pr-gra', { zone_id: 'ar-gra', water_category_id: 'wc-utility', max_litres: 1999, handling_minor_units: 45_000 })
  const v3: PriceList = {
    version: 3,
    effective_from: '2026-10-20T09:00:00Z',
    created_by: SAMPLE_ADMIN,
    reason: null,
    rules: [smallV2, large, gra],
    changes: [{ path: 'rules[2]', from: null, to: gra }],
  }
  return [v1, v2, v3]
}
