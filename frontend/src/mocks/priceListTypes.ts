/**
 * The mock-era price list: flat prices per can and per tank, rider pay,
 * delivery switches and the points rule (a-pricing, a-loyalty).
 *
 * FR-022 rules this shape out for the real price list (#10); the real one is
 * `PriceList` in `domain/admin.ts`. The mock keeps this shape only because the
 * mock quote engine (`pricing.ts`), the Loyalty page and the Service areas
 * "Delivery fee now" notice still read it. It is never sent to a server.
 */
import type { CanSizeLitres, TankSizeGallons, WaterSource } from '../domain/orders'

export interface TankerPriceRow {
  water_minor_units: Record<WaterSource, number>
  delivery_minor_units: number
  driver_pay_minor_units: number
}

/**
 * One version of the mock price list (a-pricing). Every save creates a new
 * version; orders keep the quote they were placed with (FR-024).
 */
export interface MockPriceList {
  version: number
  created_at: string
  created_by: string
  /** Change summary for the log, e.g. "Tanker 750 gal ₦24,000 → ₦25,000". */
  note: string
  keke: { can_minor_units: Record<CanSizeLitres, number>; delivery_minor_units: number; rider_pay_minor_units: number }
  tanker: Record<TankSizeGallons, TankerPriceRow>
  /**
   * Delivery fee methods (decision 10a). With both off, each order pays the
   * delivery fee in the tables above. "Fixed fee per area" wins when the
   * area has a fee; otherwise "rate per km" uses the area's distance.
   */
  delivery_fee: { per_km_enabled: boolean; per_km_minor_units: number; per_area_enabled: boolean }
  /** Sample loyalty rule (decision 16). */
  points: { naira_per_point: number; round_to: number; welcome_bonus: number; naira_per_redeemed_point: number }
}

/** What the mock pricing forms edit; the mock adds version, time and author. */
export type MockPriceListInput = Omit<MockPriceList, 'version' | 'created_at' | 'created_by' | 'note'>
