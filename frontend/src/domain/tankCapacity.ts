/**
 * How much a tanker carries, typed in by the driver at sign-up (most carry
 * enough to fill four 1,000 gallon tanks, so fixed size choices did not fit).
 * Shared by the sign-up form and the mock server so both apply one rule.
 */

/** Smallest tanker order (500 gal); a tanker must carry at least that. */
export const MIN_TANKER_GALLONS = 500
/** Sanity limit against typos (an extra zero); not a business rule. */
export const MAX_TANKER_GALLONS = 20_000

/** Whole gallons from what the driver typed ("4,000", "4000 "), or null if it is not a whole number. */
export function parseGallons(text: string): number | null {
  const clean = text.replace(/[\s,]/g, '')
  if (!/^\d{1,6}$/.test(clean)) return null
  return Number(clean)
}

/** Why a typed capacity is not accepted, or null when it is fine. */
export function tankCapacityError(gallons: number | null): string | null {
  if (gallons === null) return 'Enter how many gallons your tanker carries, e.g. 4,000.'
  if (gallons < MIN_TANKER_GALLONS) return `A tanker must carry at least ${MIN_TANKER_GALLONS.toLocaleString('en-NG')} gallons.`
  if (gallons > MAX_TANKER_GALLONS) return `That is more than ${MAX_TANKER_GALLONS.toLocaleString('en-NG')} gallons. Check the number.`
  return null
}
