/**
 * Delivery partner (Keke rider and tanker driver) domain types. One server
 * role, `driver` (docs/api/auth.md); the vehicle type chosen at sign-up
 * decides which app and which orders the partner sees (decision 9).
 *
 * No contract exists yet; served by mocks. Money in kobo, times in UTC.
 */
import type { PaymentStatus, WaterChoice } from './orders'

export type VehicleType = 'keke' | 'tanker'
export type ApprovalStatus = 'pending' | 'approved' | 'suspended'

/**
 * Where a job is for this partner.
 *
 * - `available`: in the pool, any eligible partner may accept (no countdown).
 * - `assigned`: admin assigned it to this partner; not accepted yet. The
 *   partner may accept, or decline with a reason (decision 13).
 * - `accepted`: accepted, heading to the refill station.
 * - `collected`: water collected, heading to the customer.
 * - `delivered`: completed with the customer's code.
 * - `cancelled`: cancelled by admin.
 */
export type JobStage = 'available' | 'assigned' | 'accepted' | 'collected' | 'delivered' | 'cancelled'

export interface JobPlace {
  name: string
  address: string
  /** Area name for lists ("GRA", "Independence Layout"). */
  area: string
  /** Distance and time from the previous point. Sample estimates. */
  distance_km: number
  minutes: number
  landmark?: string | null
}

export interface PartnerJob {
  reference: string
  choice: WaterChoice
  /** Ground or overhead details for tanker jobs ("Overhead tank on a 3 m stand..."). */
  tank_note: string | null
  station: JobPlace
  customer: JobPlace & { contact_name: string; phone: string }
  instructions: string | null
  /** What the partner earns for the trip. SAMPLE rider pay (decision 16). */
  earning_minor_units: number
  stage: JobStage
  /** Admin who assigned it, when stage is `assigned`. */
  assigned_by: string | null
  payment_status: PaymentStatus
  /** Code tries left before admin must confirm the delivery. */
  code_tries_left: number
  /** When a new code may be requested again (UTC ISO). */
  code_resend_at: string | null
  accepted_at: string | null
  collected_at: string | null
  delivered_at: string | null
  /** Pickup checklist and optional photo, recorded at the station (FR-034). */
  pickup: { loaded: boolean; receipt: boolean; photo_url: string | null; gallons_loaded: number | null } | null
  /** The partner's own estimate to the customer once collected (sample). */
  remaining: { distance_km: number; minutes: number } | null
  /**
   * Mock mode only: the customer's code, so a demo can finish a delivery
   * without the customer's phone. Never sent by a real server.
   */
  demo_code?: string
}

export interface PartnerDocument {
  id: string
  name: string
  /** `checking`: uploaded, waiting for admin to check it. */
  status: 'valid' | 'expiring' | 'done' | 'missing' | 'checking'
  /** "Checked 14 Aug 2026", "Expires 31 Oct 2026". */
  note: string
  can_upload: boolean
}

export interface PartnerProfile {
  name: string
  phone: string
  /** Optional, for updates and newsletters (decision 6). */
  email: string | null
  approval: ApprovalStatus
  online: boolean
  partner_since: string
  vehicle: {
    type: VehicleType
    plate: string
    /** "Blue tricycle", "1,000 gal (4,000 L) tank". */
    description: string
    /** Tank size for tanker drivers; null for Keke. */
    tank_gallons: number | null
    /** Placeholder until verified: shown as `[SAFE LOAD]`. */
    safe_load_litres: number | null
    can_pour_into: string
  }
  service_areas: string[]
  documents: PartnerDocument[]
  preferences: { new_order_alerts: boolean; sms_updates: boolean; offers_and_news: boolean }
  /** Bank account ending, for payouts. */
  payout_account_ending: string | null
}

export interface EarningEntry {
  reference: string
  at: string
  amount_minor_units: number
  status: 'pending' | 'completed'
  /** "750 gal", "25 L × 24" for lists. */
  label: string
}

export interface PayoutEntry {
  id: string
  at: string
  amount_minor_units: number
  status: 'requested' | 'paid'
}

export interface PartnerEarnings {
  wallet_minor_units: number
  today_minor_units: number
  deliveries_today: number
  week_minor_units: number
  trips_this_week: number
  gallons_this_week: number
  /** Last 7 days, oldest first; the last one is today. */
  week: { day: string; amount_minor_units: number }[]
  entries: EarningEntry[]
  payouts: PayoutEntry[]
  is_sample: boolean
}

export interface PartnerNotification {
  id: string
  /** `reassigned`: admin moved or cancelled an order the partner had; `account`: approved, suspended or reactivated. */
  kind: 'assigned' | 'new_orders' | 'payout' | 'station_closed' | 'papers_due' | 'reassigned' | 'account'
  title: string
  body: string
  at: string
  read: boolean
  reference: string | null
}

export type PartnerIssueType =
  | 'customer_unreachable'
  | 'unsafe_pour'
  | 'bad_address'
  | 'station_problem'
  | 'vehicle_breakdown'
  | 'code_not_working'

export const ISSUE_LABEL: Record<PartnerIssueType, (vehicle: VehicleType) => string> = {
  customer_unreachable: () => 'Customer not reachable',
  unsafe_pour: () => 'Cannot pour safely',
  bad_address: () => 'Wrong or unclear address',
  station_problem: () => 'Problem at the station',
  vehicle_breakdown: (v) => (v === 'keke' ? 'My keke broke down' : 'My tanker broke down'),
  code_not_working: () => 'Delivery code not working',
}

/** Valid reasons to decline an order admin assigned (decision 13). */
export type DeclineReason = 'vehicle_problem' | 'outside_area' | 'station_unavailable' | 'too_large' | 'not_available'

export const DECLINE_LABEL: Record<DeclineReason, (vehicle: VehicleType) => string> = {
  vehicle_problem: (v) => (v === 'keke' ? 'My keke has a problem' : 'My tanker has a problem'),
  outside_area: () => 'Outside my service area',
  station_unavailable: () => 'Station closed or no water',
  too_large: (v) => (v === 'keke' ? 'Too much for my keke' : 'Too much for my tank'),
  not_available: () => 'I am not available now',
}

export interface PartnerSignupInput {
  name: string
  phone: string
  password: string
  vehicle_type: VehicleType
  plate: string
  /** Tanker drivers only. */
  tank_gallons: number | null
  service_area: string
}
