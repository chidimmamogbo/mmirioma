/**
 * Which pool orders a partner may see and accept, shared by the partner mock
 * (the pool) and the new-order alerts sent when a customer orders.
 */
import { choiceLitres } from '../domain/orders'
import { litresFromGallons } from '../domain/quantity'
import type { PartnerData, StoredJob } from './seed'

/**
 * True when `job` is open and fits this partner: same vehicle type, not
 * declined by them before, and (tankers) no bigger than their tank. Compares
 * litres with litres, as the backend does with `safe_payload_litres`
 * (FR-013; docs/architecture/api-mapping.md, "Quantities").
 */
export function eligible(job: StoredJob, partnerId: string, data: PartnerData): boolean {
  if (job.stage !== 'available' || job.declined_by.includes(partnerId)) return false
  if (job.choice.delivery_type !== data.profile.vehicle.type) return false
  if (job.choice.delivery_type === 'tanker') {
    const orderLitres = choiceLitres(job.choice)
    const tankLitres = litresFromGallons(data.profile.vehicle.tank_gallons ?? 0)
    if (orderLitres === null || tankLitres < orderLitres) return false
  }
  return true
}
