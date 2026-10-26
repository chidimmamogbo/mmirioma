import { choiceLitres, describeChoice, shortReference } from '../../domain/orders'
import type { PartnerJob } from '../../domain/partner'
import { formatDate, formatDayDate, formatTime } from '../../lib/format/datetime'

/**
 * Total litres across jobs. Every job counts in litres (tankers: gallons × 4,
 * FR-021), so Keke and Tanker trips never add up in mixed units.
 */
export function totalLitres(jobs: PartnerJob[]): number {
  return jobs.reduce((sum, job) => sum + (choiceLitres(job.choice) ?? 0), 0)
}

/** Quantity line for a job, in both units: "25 L × 24 cans (600 L · 150 gal)" or "750 gallons (3,000 litres)". */
export function jobQuantity(job: PartnerJob, style: 'long' | 'short' = 'long'): string {
  return describeChoice(job.choice, style)
}

/** Total trip time: station leg plus customer leg (sample estimates). */
export function tripMinutes(job: PartnerJob): number {
  return job.station.minutes + job.customer.minutes
}

/** "About 40 min · pump needed" for tanker cards: overhead tanks need the pump hose. */
export function tankerTripLine(job: PartnerJob): string {
  const pump = job.choice.delivery_type === 'tanker' && job.choice.tank_type === 'overhead'
  return `About ${tripMinutes(job)} min${pump ? ' · pump needed' : ''}`
}

/** "MO-7KQ2 · GRA" for history lists. */
export function jobShort(job: PartnerJob): string {
  return `${shortReference(job.reference)} · ${job.customer.area}`
}

/** "Today, 11:42 AM" / "Yesterday, 5:20 PM" / "Mon, 3:40 PM" (this week) / "12 Oct 2026, 9:00 AM". */
export function relativeWhen(iso: string, now = new Date()): string {
  const day = formatDate(iso)
  if (day === formatDate(now)) return `Today, ${formatTime(iso)}`
  if (day === formatDate(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${formatTime(iso)}`
  if (now.getTime() - Date.parse(iso) < 6 * 86_400_000) return `${formatDayDate(iso).split(',')[0]}, ${formatTime(iso)}`
  return `${day}, ${formatTime(iso)}`
}
