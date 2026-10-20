/**
 * Which pool orders a partner may see and accept, shared by the partner mock
 * (the pool) and the new-order alerts sent when a customer orders.
 */
import type { PartnerData, StoredJob } from './seed'

/**
 * True when `job` is open and fits this partner: same vehicle type, not
 * declined by them before, and (tankers) no bigger than their tank.
 */
export function eligible(job: StoredJob, partnerId: string, data: PartnerData): boolean {
  if (job.stage !== 'available' || job.declined_by.includes(partnerId)) return false
  if (job.choice.delivery_type !== data.profile.vehicle.type) return false
  if (job.choice.delivery_type === 'tanker') {
    const size = job.choice.tank_size_gallons
    if (size === null || (data.profile.vehicle.tank_gallons ?? 0) < size) return false
  }
  return true
}
