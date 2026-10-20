import { describe, expect, it } from 'vitest'
import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatDayDate,
  formatShortDate,
  formatTime,
} from './datetime'
import { formatNaira, nairaInputToKobo } from './money'

describe('formatNaira', () => {
  it('shows whole naira without decimals, as in the design', () => {
    expect(formatNaira(650000)).toBe('₦6,500')
    expect(formatNaira(48600000)).toBe('₦486,000')
    expect(formatNaira(0)).toBe('₦0')
  })

  it('keeps kobo instead of rounding them away', () => {
    expect(formatNaira(650050)).toBe('₦6,500.50')
    expect(formatNaira(5)).toBe('₦0.05')
  })

  it('uses the design minus sign and an optional plus', () => {
    expect(formatNaira(-5000000)).toBe('−₦50,000')
    expect(formatNaira(250000, { signed: true })).toBe('+₦2,500')
  })

  it('rejects non-integer money', () => {
    expect(() => formatNaira(12.5)).toThrow(RangeError)
    expect(() => formatNaira(Number.NaN)).toThrow(RangeError)
  })
})

describe('nairaInputToKobo', () => {
  it('converts whole naira with or without commas', () => {
    expect(nairaInputToKobo('25,000')).toBe(2500000)
    expect(nairaInputToKobo(' 250 ')).toBe(25000)
  })

  it('returns null for decimals, signs or text', () => {
    expect(nairaInputToKobo('250.5')).toBeNull()
    expect(nairaInputToKobo('-1')).toBeNull()
    expect(nairaInputToKobo('abc')).toBeNull()
    expect(nairaInputToKobo('')).toBeNull()
  })
})

describe('Africa/Lagos formatting', () => {
  // 10:42 UTC is 11:42 in Lagos (UTC+1, no daylight saving).
  const iso = '2026-10-15T10:42:00Z'

  it('formats times and dates in Lagos time', () => {
    expect(formatTime(iso)).toBe('11:42 AM')
    expect(formatDate(iso)).toBe('15 Oct 2026')
    expect(formatShortDate(iso)).toBe('15 Oct')
    expect(formatDayDate(iso)).toBe('Thu, 15 Oct 2026')
    expect(formatDateTime(iso)).toBe('15 Oct 2026, 11:42 AM')
  })

  it('moves to the next Lagos day after 23:00 UTC', () => {
    expect(formatDate('2026-10-15T23:30:00Z')).toBe('16 Oct 2026')
    expect(formatTime('2026-10-15T23:30:00Z')).toBe('12:30 AM')
  })

  it('formats API calendar dates without shifting the day', () => {
    expect(formatCalendarDate('2026-10-16')).toBe('16 Oct 2026')
    expect(() => formatCalendarDate('16/10/2026')).toThrow(RangeError)
  })
})
