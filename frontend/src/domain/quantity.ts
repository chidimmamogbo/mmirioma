/**
 * Water quantities in litres and local gallons (SRS v0.3 FR-021).
 *
 * The local gallon is exactly 4 litres, so every conversion here is exact and
 * no screen shows an estimate. The server stores litres and converts gallons
 * itself; these functions are for display only (FR-021), and the server's
 * value wins (docs/architecture/api-mapping.md, "Quantities").
 */

/** Litres in one local gallon (FR-021; backend `LITRES_PER_LOCAL_GALLON`). */
export const LITRES_PER_LOCAL_GALLON = 4

/** Litres in a whole number of local gallons. */
export function litresFromGallons(gallons: number): number {
  return gallons * LITRES_PER_LOCAL_GALLON
}

/** Local gallons in a number of litres, rounded to two decimals (601 L = 150.25 gal). */
export function gallonsFromLitres(litres: number): number {
  return Math.round((litres / LITRES_PER_LOCAL_GALLON) * 100) / 100
}

/** "2,000" or "150.25": Nigerian grouping, at most two decimals. */
function amount(n: number): string {
  return n.toLocaleString('en-NG', { maximumFractionDigits: 2 })
}

/**
 * A quantity in both units, so a customer who knows only litres or only
 * gallons can read it.
 *
 * @param litres - The quantity in litres.
 * @param lead - The unit shown first: `gallons` for tankers, which are sized
 *   in gallons; `litres` for jerrycans.
 * @param style - `long` spells the units ("2,000 litres (500 gallons)");
 *   `short` abbreviates them for tight rows ("2,000 L · 500 gal").
 * @returns The text, e.g. "500 gallons (2,000 litres)".
 */
export function describeQuantity(litres: number, lead: 'litres' | 'gallons' = 'litres', style: 'long' | 'short' = 'long'): string {
  const l = amount(litres)
  const g = amount(gallonsFromLitres(litres))
  if (style === 'short') return lead === 'litres' ? `${l} L · ${g} gal` : `${g} gal · ${l} L`
  return lead === 'litres' ? `${l} litres (${g} gallons)` : `${g} gallons (${l} litres)`
}
