import { createContext, useContext } from 'react'
import type { PartnerJob, VehicleType } from '../../domain/partner'

/**
 * Which partner app a screen is in. The Keke rider app lives under
 * `/partner/rider` and the tanker driver app under `/partner/driver` (both
 * inside the installable partner app's `/partner/` scope); screens shared by both (history,
 * notifications, vehicle, report a problem) read their links and words here.
 */
export interface PartnerApp {
  base: '/partner/rider' | '/partner/driver'
  vehicle: VehicleType
  /** "rider" or "driver", for copy. */
  role: 'rider' | 'driver'
  /** "keke" or "tanker", for copy. */
  vehicleWord: 'keke' | 'tanker'
}

export const PARTNER_APPS: Record<VehicleType, PartnerApp> = {
  keke: { base: '/partner/rider', vehicle: 'keke', role: 'rider', vehicleWord: 'keke' },
  tanker: { base: '/partner/driver', vehicle: 'tanker', role: 'driver', vehicleWord: 'tanker' },
}

export const PartnerAppContext = createContext<PartnerApp>(PARTNER_APPS.keke)

export function usePartnerApp(): PartnerApp {
  return useContext(PartnerAppContext)
}

/** The screen a job belongs on, from its stage. */
export function jobStepPath(base: string, job: Pick<PartnerJob, 'reference' | 'stage'>): string {
  const r = job.reference
  switch (job.stage) {
    case 'assigned':
      return `${base}/assigned/${r}`
    case 'accepted':
      return `${base}/jobs/${r}/refill`
    case 'collected':
      return `${base}/jobs/${r}/customer`
    case 'delivered':
      return `${base}/jobs/${r}/done`
    default:
      return `${base}/orders/${r}`
  }
}

/** A step of the trip the problem report tells apart (docs/design/driver-arrival-unreachable.md, "Problem report", #257). */
export type TripStep = 'station' | 'customer' | 'arrived' | 'unloading'

/**
 * Where an active job is on the trip. `PartnerJob.stage` is `collected` from loading to unloading, so the steps after
 * it are told apart by the arrival fields (#263): no `arrived_at` is on the way to the customer; `arrived_at` with
 * `can_start_unloading` is arrived; `arrived_at` without it is unloading. A job before loading is at the station.
 */
export function tripStep(job: Pick<PartnerJob, 'stage' | 'arrived_at' | 'can_start_unloading'>): TripStep {
  if (job.stage !== 'collected') return 'station'
  if (!job.arrived_at) return 'customer'
  return job.can_start_unloading ? 'arrived' : 'unloading'
}

/** The job line on the problem report card, for a step. */
export const TRIP_STEP_LINE: Record<TripStep, string> = {
  station: 'going to the station',
  customer: 'on the way to customer',
  arrived: 'arrived at the customer',
  unloading: 'unloading',
}

/**
 * The screen "Back" returns to from the problem report, for a step. The arrived screen (U2) is not built yet, so an
 * arrived job goes back to the customer step, which is where the job's next action is until it exists.
 */
export function tripStepPath(base: string, reference: string, step: TripStep): string {
  const to = { station: 'refill', customer: 'customer', arrived: 'customer', unloading: 'code' }[step]
  return `${base}/jobs/${reference}/${to}`
}
