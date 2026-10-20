/**
 * Date and time display in Africa/Lagos (SRS §2.1). The API sends UTC ISO
 * timestamps (`2026-10-14T09:30:00Z`) and Lagos calendar dates (`2026-10-16`).
 * Output follows the patterns drawn in the design, e.g. "11:42 AM",
 * "12 Oct 2026", "2 Oct", "Thu, 15 Oct 2026".
 */

export const APP_TIME_ZONE = 'Africa/Lagos'

type Part = Intl.DateTimeFormatPartTypes

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function lagosParts(date: Date): Record<Part, string> {
  const out = {} as Record<Part, string>
  for (const p of partsFormatter.formatToParts(date)) out[p.type] = p.value
  return out
}

function toDate(value: string | Date): Date {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`)
  return date
}

/** "11:42 AM" */
export function formatTime(value: string | Date): string {
  const p = lagosParts(toDate(value))
  return `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`
}

/** "12 Oct 2026" */
export function formatDate(value: string | Date): string {
  const p = lagosParts(toDate(value))
  return `${p.day} ${p.month} ${p.year}`
}

/** "2 Oct" (no year) */
export function formatShortDate(value: string | Date): string {
  const p = lagosParts(toDate(value))
  return `${p.day} ${p.month}`
}

/** "Thu, 15 Oct 2026" */
export function formatDayDate(value: string | Date): string {
  const p = lagosParts(toDate(value))
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`
}

/** "15 Oct 2026, 11:42 AM" */
export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)}, ${formatTime(value)}`
}

/**
 * Format a Lagos calendar date from the API (`YYYY-MM-DD`) without shifting it
 * through UTC. Noon Lagos time is used so the day can never roll over.
 */
export function formatCalendarDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new RangeError(`Invalid calendar date: ${isoDate}`)
  return formatDate(`${isoDate}T12:00:00+01:00`)
}
