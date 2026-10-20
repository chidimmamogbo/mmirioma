/** Time helpers for seed data. Lagos is UTC+1 all year (no daylight saving). */

/** UTC ISO time for a Lagos clock time, `daysAgo` days before today. */
export function lagosToday(hour: number, minute: number, now = new Date(), daysAgo = 0): string {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000)
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() - daysAgo, hour - 1, minute)).toISOString()
}

/** UTC ISO for a fixed Lagos date (`YYYY-MM-DD`) and time. */
export function lagosAt(date: string, hour: number, minute: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour - 1, minute)).toISOString()
}
