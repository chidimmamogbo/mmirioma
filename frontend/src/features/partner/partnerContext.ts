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
