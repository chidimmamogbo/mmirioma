import { describeChoice, shortReference } from '../../domain/orders'
import type { JobPlace, PartnerJob, VehicleType } from '../../domain/partner'
import { describeQuantity } from '../../domain/quantity'
import { APP_TIME_ZONE, formatDate, formatDayDate, formatTime } from '../../lib/format/datetime'

const lagosDay = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Jobs delivered today, Lagos time, from the partner's history: the trips
 * count on the home screens, from real data rather than earnings (partner
 * pay is out of the MVP, #157).
 */
export function deliveredToday(jobs: PartnerJob[], now: Date = new Date()): number {
  const today = lagosDay.format(now)
  return jobs.filter((job) => job.delivered_at !== null && lagosDay.format(new Date(job.delivered_at)) === today).length
}

/**
 * Total litres across jobs. Every job counts in litres (tankers: gallons × 4,
 * FR-021), so Keke and Tanker trips never add up in mixed units.
 */
export function totalLitres(jobs: PartnerJob[]): number {
  return jobs.reduce((sum, job) => sum + job.quantity_litres, 0)
}

/**
 * Quantity line for a job, in both units: "25 L × 24 cans (600 L · 150 gal)"
 * or "750 gallons (3,000 litres)". Until the backend sends the cans or tank
 * (#21, `choice` is `null`), the ordered litres: "600 litres (150 gallons)".
 */
export function jobQuantity(job: PartnerJob, style: 'long' | 'short' = 'long'): string {
  if (job.choice === null) return describeQuantity(job.quantity_litres, 'litres', style)
  return describeChoice(job.choice, style)
}

/**
 * Keke or tanker. From the customer's choice when known; otherwise the app's
 * own vehicle, since a partner is only offered jobs for their vehicle type
 * (decision 9).
 */
export function jobDeliveryType(job: PartnerJob, appVehicle: VehicleType): VehicleType {
  return job.choice?.delivery_type ?? appVehicle
}

/** Whether the customer has an overhead tank, which needs the pump hose. */
export function needsPump(job: PartnerJob): boolean {
  return job.choice?.delivery_type === 'tanker' && job.choice.tank_type === 'overhead'
}

/** " · 2.1 km" after a place, or nothing when the distance is unknown (no OSRM, SRS §12.1). */
export function kmSuffix(km: number | null): string {
  return km === null ? '' : ` · ${km} km`
}

/** " · 6 min" after a place, or nothing when the time is unknown. */
export function minutesSuffix(minutes: number | null): string {
  return minutes === null ? '' : ` · ${minutes} min`
}

/**
 * A place's address, or its area when the job does not carry the address
 * (real API: history, ended jobs, and the customer on an offer).
 */
export function placeAddress(place: JobPlace): string {
  return place.address ?? place.area
}

/**
 * "Adaeze Nwosu, GRA" for the delivery, or the area alone while the receiver
 * is not known: on an offer (FR-032) and after the job ends.
 */
export function customerLabel(job: PartnerJob): string {
  return job.customer.contact_name ? `${job.customer.contact_name}, ${job.customer.area}` : job.customer.area
}

/** " · Adaeze Nwosu" after a line, or nothing while the receiver is not known. */
export function contactSuffix(job: PartnerJob): string {
  return job.customer.contact_name ? ` · ${job.customer.contact_name}` : ''
}

/** Total trip time: station leg plus customer leg (sample estimates), or `null` if either is unknown. */
export function tripMinutes(job: PartnerJob): number | null {
  if (job.station.minutes === null || job.customer.minutes === null) return null
  return job.station.minutes + job.customer.minutes
}

/**
 * "About 40 min · pump needed" for tanker cards: overhead tanks need the pump
 * hose. Without a trip time, only "Pump needed", or nothing.
 */
export function tankerTripLine(job: PartnerJob): string {
  const minutes = tripMinutes(job)
  const pump = needsPump(job)
  if (minutes === null) return pump ? 'Pump needed' : ''
  return `About ${minutes} min${pump ? ' · pump needed' : ''}`
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
