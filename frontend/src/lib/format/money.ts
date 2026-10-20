/**
 * Money display helpers. Amounts are always integer kobo (SRS §5, BR-01;
 * `*_minor_units` fields in docs/api). Naira exists only in what we show.
 */

const KOBO_PER_NAIRA = 100
/** U+2212 MINUS SIGN, as the design writes negative amounts ("−₦50,000"). */
const MINUS = '−'

const wholeNaira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 })
const nairaWithKobo = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format integer kobo as naira for display, e.g. `650000` → `₦6,500`.
 *
 * Whole-naira amounts show no decimals, as in the design. Amounts with kobo
 * show two decimals (`650050` → `₦6,500.50`), so nothing is rounded away.
 *
 * @param kobo - Amount in kobo. Must be a safe integer.
 * @param options.signed - Prefix `+` for positive amounts (negatives always get `−`).
 * @returns The display string.
 * @throws RangeError if `kobo` is not a safe integer (e.g. a float slipped in).
 */
export function formatNaira(kobo: number, options: { signed?: boolean } = {}): string {
  if (!Number.isSafeInteger(kobo)) {
    throw new RangeError(`Money must be integer kobo, got ${kobo}`)
  }
  const abs = Math.abs(kobo)
  const naira = abs / KOBO_PER_NAIRA
  const body = abs % KOBO_PER_NAIRA === 0 ? wholeNaira.format(naira) : nairaWithKobo.format(naira)
  const sign = kobo < 0 ? MINUS : options.signed && kobo > 0 ? '+' : ''
  return `${sign}₦${body}`
}

/**
 * Convert whole naira typed by staff (e.g. on the admin pricing page) to kobo.
 * Accepts digits with optional thousands commas; rejects decimals and anything else.
 *
 * @returns Kobo, or `null` if the text is not a whole naira amount.
 */
export function nairaInputToKobo(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const kobo = Number(cleaned) * KOBO_PER_NAIRA
  return Number.isSafeInteger(kobo) ? kobo : null
}
