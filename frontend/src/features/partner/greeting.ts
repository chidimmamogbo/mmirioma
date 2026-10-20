/** "Good morning" / "Good afternoon" / "Good evening" by the time in Lagos (UTC+1, no daylight saving). */
export function greeting(now = new Date()): string {
  const h = new Date(now.getTime() + 3_600_000).getUTCHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
