/**
 * Mock of the server's quote calculation (FR-022). The rules are set by admin
 * on the pricing pages and saved as versions (FR-024: an order keeps the
 * quote it was placed with). Every value is a SAMPLE: the first list is the
 * design's admin pricing page (`a-pricing`, v3), plus sample Ninth Mile tanker
 * prices (decision 10b: Ninth Mile costs more, admin sets how much). Keke has
 * no water source choice, so jerrycans have one price per size.
 *
 * All money is integer kobo. The only fractional step is the per-km fee
 * (rate × distance with one decimal place), rounded to the nearest whole naira.
 */
import type { SamplePriceTable } from '../domain/admin'
import type { MockServiceArea } from './adminSeed'
import type { Quote, QuoteLine, WaterChoice } from '../domain/orders'
import { formatNaira } from '../lib/format/money'

/** The design's price list (a-pricing v3), the first version in the mock. */
export const DEFAULT_PRICE_LIST: SamplePriceTable = {
  version: 3,
  created_at: '2026-10-10T09:00:00Z',
  created_by: 'Chidimma M.',
  note: 'Tanker 750 gal ₦24,000 → ₦25,000',
  keke: { can_minor_units: { 25: 25_000, 50: 45_000 }, delivery_minor_units: 50_000, rider_pay_minor_units: 250_000 },
  tanker: {
    500: { water_minor_units: { borehole: 1_800_000, ninth_mile: 2_200_000 }, delivery_minor_units: 200_000, driver_pay_minor_units: 650_000 },
    750: { water_minor_units: { borehole: 2_500_000, ninth_mile: 3_000_000 }, delivery_minor_units: 200_000, driver_pay_minor_units: 800_000 },
    1000: { water_minor_units: { borehole: 3_200_000, ninth_mile: 3_900_000 }, delivery_minor_units: 200_000, driver_pay_minor_units: 950_000 },
  },
  delivery_fee: { per_km_enabled: false, per_km_minor_units: 15_000, per_area_enabled: false },
  points: { naira_per_point: 200, round_to: 5, welcome_bonus: 100, naira_per_redeemed_point: 1 },
}

/** Where an order goes, for the delivery fee. `area` is null when the address matches no service area. */
export interface DeliveryPlace {
  area: Pick<MockServiceArea, 'name' | 'distance_km' | 'fixed_fee_minor_units'> | null
}

/** Any address, for callers that do not know the area (seed data, tests). */
export const ANY_PLACE: DeliveryPlace = { area: null }

/** The service area an address belongs to: the first enabled area whose name appears in it. */
export function areaForAddress(address: string, areas: MockServiceArea[]): MockServiceArea | null {
  const a = address.toLowerCase()
  return areas.find((x) => x.enabled && a.includes(x.name.toLowerCase())) ?? null
}

/** Points for a total, by the list's rule (sample: 1 point per ₦200, down to a multiple of 5). */
export function pointsFor(totalKobo: number, prices: SamplePriceTable = DEFAULT_PRICE_LIST): number {
  const { naira_per_point, round_to } = prices.points
  return Math.floor(totalKobo / (naira_per_point * 100) / round_to) * round_to
}

/**
 * The delivery fee for a choice and place (decision 10a):
 * 1. "Fixed fee per area" on and the area has a fee: that fee.
 * 2. Otherwise "rate per km" on and the area has a distance: rate × km,
 *    rounded to whole naira.
 * 3. Otherwise the flat fee for the delivery type and size in the tables.
 */
export function deliveryFeeFor(choice: WaterChoice, place: DeliveryPlace, prices: SamplePriceTable = DEFAULT_PRICE_LIST): number {
  const { per_area_enabled, per_km_enabled, per_km_minor_units } = prices.delivery_fee
  const area = place.area
  if (per_area_enabled && area?.fixed_fee_minor_units != null) return area.fixed_fee_minor_units
  if (per_km_enabled && area?.distance_km != null) return Math.round((per_km_minor_units * area.distance_km) / 100) * 100
  if (choice.delivery_type === 'keke') return prices.keke.delivery_minor_units
  return choice.tank_size_gallons === null ? 0 : prices.tanker[choice.tank_size_gallons].delivery_minor_units
}

/**
 * Price a choice. Without a place (`null`) the quote has no delivery line and
 * the total is the water price only.
 */
export function quoteFor(choice: WaterChoice, place: DeliveryPlace | null, prices: SamplePriceTable = DEFAULT_PRICE_LIST, now = new Date()): Quote {
  let water: QuoteLine
  if (choice.delivery_type === 'keke') {
    const each = prices.keke.can_minor_units[choice.can_size_litres]
    water = {
      label: `Water (${choice.can_count} × ${formatNaira(each)})`,
      amount_minor_units: each * choice.can_count,
      unit_minor_units: each,
    }
  } else {
    if (choice.tank_size_gallons === null) {
      return {
        status: 'manual_quote_required',
        reason: 'Custom tank sizes are priced by our team. We will call you with a quote.',
      }
    }
    water = { label: 'Water', amount_minor_units: prices.tanker[choice.tank_size_gallons].water_minor_units[choice.source] }
  }
  const delivery: QuoteLine | null = place
    ? {
        label: choice.delivery_type === 'keke' ? 'Delivery and pouring' : 'Delivery',
        amount_minor_units: deliveryFeeFor(choice, place, prices),
      }
    : null
  const total = water.amount_minor_units + (delivery?.amount_minor_units ?? 0)
  return {
    status: 'quote_available',
    currency: 'NGN',
    water,
    delivery,
    total_minor_units: total,
    points_estimate: pointsFor(total, prices),
    price_valid_until: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    is_sample: true,
  }
}

/** Partner pay for a trip, from the price list (sample rider pay, decision 16). Custom tanker sizes: set by admin later. */
export function riderPayFor(choice: WaterChoice, prices: SamplePriceTable = DEFAULT_PRICE_LIST): number {
  if (choice.delivery_type === 'keke') return prices.keke.rider_pay_minor_units
  return choice.tank_size_gallons === null ? 0 : prices.tanker[choice.tank_size_gallons].driver_pay_minor_units
}
