/**
 * Admin domain types (design `a-*` screens and the added admin pages).
 *
 * No admin contract exists beyond the Sprint 1 order list/detail
 * (docs/api/orders.md), so these are served by mocks (src/mocks/adminMock.ts).
 * Field names follow the API conventions: snake_case, money as integer kobo in
 * `*_minor_units`, UTC ISO timestamps. Every naira amount here is a SAMPLE
 * (decision 10, 16).
 */
import type { CanSizeLitres, DeliveryType, PaymentMethod, PaymentStatus, TankSizeGallons, TankType, WaterChoice, WaterSource } from './orders'
import type { ApprovalStatus } from './partner'

/* ---------- Orders ---------- */

/**
 * Admin's view of where an order is, from the job and the customer order (a-orders).
 * `failed` and `disputed` show the backend statuses of the same name
 * (api-mapping.md open question 5, decided in #15).
 */
export type AdminOrderStatus = 'awaiting_rider' | 'assigned' | 'loading' | 'on_the_way' | 'delivered' | 'cancelled' | 'failed' | 'disputed'

export const ADMIN_STATUS_LABEL: Record<AdminOrderStatus, string> = {
  awaiting_rider: 'Awaiting rider',
  assigned: 'Assigned',
  loading: 'Loading',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  // The agreed staff labels (docs/api/orders.md, "Order statuses").
  failed: 'Delivery failed',
  disputed: 'Disputed',
}

/**
 * Payment status on admin screens: the design's statuses plus `partially_paid`
 * ("Part paid", from the approved cash design, docs/design/cash-remittance.md),
 * which pay-on-delivery orders reach when the driver collects less than due.
 */
export type AdminPaymentStatus = PaymentStatus | 'partially_paid'

/** Order list filters (a-orders pills). "In progress" covers assigned, loading and on the way. */
export type AdminOrderFilter = 'all' | 'awaiting_rider' | 'in_progress' | 'delivered' | 'cancelled'

export interface AdminOrderPartner {
  id: string
  name: string
  /** Short fleet code shown on the map and tables, e.g. KK-014, TK-102. `null` when the server sends none. */
  code: string | null
  /** `null` when the server does not say which vehicle. */
  vehicle: DeliveryType | null
  /** `null` when the server sends no plate. */
  plate: string | null
}

export interface AdminOrder {
  reference: string
  created_at: string
  /** Customer account id, when the order belongs to one. */
  customer_id: string | null
  customer_name: string
  customer_phone: string
  /** The service zone's name, or `null` when the order has none. */
  area: string | null
  address: string
  landmark: string | null
  /** `null` for an order sent before #21, which carries only its litres. */
  choice: WaterChoice | null
  /** "50 L × 12", "750 gal". */
  quantity: string
  total_minor_units: number | null
  /** `status` is `null` when the server sends none (the order list, or before confirmation). */
  payment: { method: PaymentMethod; status: AdminPaymentStatus | null }
  status: AdminOrderStatus
  partner: AdminOrderPartner | null
  assigned_by: string | null
  /** Where the water is collected, once a source is chosen; `null` before. */
  station_name: string | null
  timeline: { label: string; at: string; detail?: string }[]
  instructions: string | null
  tank_note: string | null
}

/** A rider who could take an order now (a-orders "Eligible Keke riders"). */
export interface EligibleRider {
  id: string
  name: string
  vehicle: DeliveryType
  rating: number | null
  active_orders: number
  online: boolean
  /** The rider lists the order's area among the areas they work in. No live location (decision 14). */
  works_in_area: boolean
}

/* ---------- Customers ---------- */

export interface AdminCustomerSummary {
  id: string
  name: string
  phone: string
  phone_verified: boolean
  orders: number
}

export interface AdminCustomer extends AdminCustomerSummary {
  email: string | null
  customer_since: string
  total_paid_minor_units: number
  points: number
  complaints: number
  addresses: { id: string; label: string; address: string; landmark: string | null; is_default: boolean }[]
  recent_orders: { reference: string; quantity: string; delivery_type: DeliveryType; created_at: string; status: AdminOrderStatus }[]
}

/* ---------- Riders and drivers ---------- */

export interface AdminRider {
  id: string
  name: string
  phone: string
  code: string
  vehicle: { type: DeliveryType; plate: string; tank_gallons: number | null }
  service_areas: string[]
  online: boolean
  approval: ApprovalStatus
  today_minor_units: number
  trips: number
  rating: number | null
  payout_due_minor_units: number
  /** "Papers due 31 Oct", "Papers valid". */
  documents_note: string
  active_orders: number
  reported_issues: number
  partner_since: string
}

/* ---------- Stations and service areas ---------- */

export interface AdminStation {
  id: string
  name: string
  address: string
  area: string
  open: boolean
  /** "6 AM to 8 PM". */
  hours: string
  /** "Keke cans, tanker". */
  products: string
  /** Daily capacity; null shows the design's `[CAPACITY]` placeholder. */
  capacity: string | null
  /** Water-source papers (FR-012). `valid_until` null shows `[DATE]`. */
  papers: { verified_on: string | null; valid_until: string | null; file_name: string | null }
  loading_now: number
  today: number
  loading_log: { at: string; reference: string; partner: string; quantity: string }[]
}

/** Papers state, derived from the expiry date (FR-012: expired papers block new orders). */
export type PapersState = 'valid' | 'expiring' | 'expired' | 'missing'

/** A station as the admin screens get it: with its papers state worked out by the server. */
export type AdminStationView = AdminStation & { papers_state: PapersState }

export interface ServiceArea {
  id: string
  name: string
  /** Orders to this area are accepted. */
  enabled: boolean
  /** Station that usually serves the area. */
  station_id: string | null
  /** Road distance from that station, entered by admin (decision 10a: no map provider). */
  distance_km: number | null
  /** Fixed delivery fee for the area, used when "fixed fee per area" is on. */
  fixed_fee_minor_units: number | null
}

/* ---------- Pricing, points, payouts ---------- */

export interface TankerPriceRow {
  water_minor_units: Record<WaterSource, number>
  delivery_minor_units: number
  driver_pay_minor_units: number
}

/**
 * One version of the price list (a-pricing). Every save creates a new
 * version; orders keep the quote they were placed with (FR-024).
 */
export interface PriceList {
  version: number
  created_at: string
  created_by: string
  /** Change summary for the log, e.g. "Tanker 750 gal ₦24,000 → ₦25,000". */
  note: string
  keke: { can_minor_units: Record<CanSizeLitres, number>; delivery_minor_units: number; rider_pay_minor_units: number }
  tanker: Record<TankSizeGallons, TankerPriceRow>
  /**
   * Delivery fee methods (decision 10a). With both off, each order pays the
   * delivery fee in the tables above. "Fixed fee per area" wins when the
   * area has a fee; otherwise "rate per km" uses the area's distance.
   */
  delivery_fee: { per_km_enabled: boolean; per_km_minor_units: number; per_area_enabled: boolean }
  /** Sample loyalty rule (decision 16). */
  points: { naira_per_point: number; round_to: number; welcome_bonus: number; naira_per_redeemed_point: number }
}

/** What admin edits on the pricing pages; the server adds version, time and author. */
export type PriceListInput = Omit<PriceList, 'version' | 'created_at' | 'created_by' | 'note'>

export interface AdminPayment {
  reference: string
  customer_id: string | null
  customer_name: string
  amount_minor_units: number | null
  method: PaymentMethod
  status: PaymentStatus
  order_status: AdminOrderStatus
  created_at: string
}

export interface AdminPayout {
  id: string
  partner_id: string
  partner_name: string
  code: string
  amount_minor_units: number
  status: 'requested' | 'paid'
  at: string
  account_ending: string | null
}

export interface AdminPartnerEarnings {
  partner_id: string
  name: string
  code: string
  vehicle: DeliveryType
  wallet_minor_units: number
  week_minor_units: number
  trips: number
}

/* ---------- Support, audit, activity ---------- */

export type IssueType =
  | 'code_not_working'
  | 'late'
  | 'customer_unreachable'
  | 'wrong_quantity'
  | 'quality_concern'
  | 'unsafe_access'
  | 'station_problem'
  | 'other'

export type ResolutionAction = 'confirm_without_code' | 'reassign' | 'goodwill_points' | 'cancel_order' | 'call_and_close'

export const RESOLUTION_LABEL: Record<ResolutionAction, string> = {
  confirm_without_code: 'Confirm delivery without code',
  reassign: 'Reassign or reschedule',
  goodwill_points: 'Add goodwill points',
  cancel_order: 'Cancel order',
  call_and_close: 'Call both and close',
}

export interface AdminIssue {
  id: string
  /** "#CP-012". */
  number: string
  type: IssueType
  title: string
  /** What the reporter wrote. */
  message: string
  reference: string | null
  reported_by: 'customer' | 'rider' | 'driver'
  reporter_name: string
  at: string
  urgent: boolean
  status: 'open' | 'resolved'
  resolution: { action: ResolutionAction; reason: string; by: string; at: string; points?: number } | null
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  /** "Assigned MO-3HT8 to Chinedu Okafor". */
  action: string
  reason: string | null
}

export type ActivityKind = 'accepted' | 'new_order' | 'online' | 'delivered' | 'complaint' | 'admin'

export interface ActivityEntry {
  id: string
  at: string
  kind: ActivityKind
  text: string
  reference: string | null
}

export interface AdminNotification {
  id: string
  at: string
  title: string
  body: string
  read: boolean
  /** In-app path to open. */
  link: string
}

/* ---------- Dashboard, reports, settings ---------- */

export interface AdminDashboard {
  date: string
  orders: { total: number; awaiting_rider: number; in_progress: number; delivered: number; cancelled: number; oldest_waiting_minutes: number | null }
  disputes_open: number
  riders_online: { total: number; keke: number; tanker: number }
  stations: { open: number; closed: number }
  revenue_today_minor_units: number
  payouts_due: { amount_minor_units: number; riders: number }
  payments_to_verify: number
  by_type: { keke: number; tanker: number }
  is_sample: true
}

export type ReportRange = 'today' | '7d' | '30d'

export interface AdminReport {
  range: ReportRange
  orders: number
  delivered: number
  cancelled: number
  revenue_minor_units: number
  by_type: { keke: number; tanker: number }
  by_area: { area: string; orders: number; delivered: number }[]
  by_rider: { name: string; code: string; trips: number; earned_minor_units: number }[]
  by_station: { name: string; loads: number }[]
  is_sample: true
}

export interface StaffMember {
  id: string
  name: string
  role: 'Super admin' | 'Dispatcher' | 'Support'
  phone: string
  last_active: string
}

export interface AdminSettings {
  support_phone: string | null
  support_whatsapp: string | null
  /** `[SUPPORT HOURS]` until set. */
  support_hours: string | null
  /** `[CODE TIME LIMIT]` until set. */
  code_time_limit: string | null
  /** Safe load per vehicle type, `[SAFE LOAD]` until set. */
  safe_load: { keke: string | null; tanker: string | null }
}

/** Inputs for admin forms. */
export interface CreateOrderByAdminInput {
  customer_id: string
  choice: WaterChoice
  address_id: string
  payment_method: PaymentMethod
  /** Assign this rider straight away, or leave the order in the pool. */
  assign_to: string | null
}

export interface NewCustomerInput {
  name: string
  phone: string
}

export interface NewAddressInput {
  label: string
  address: string
  landmark: string | null
}

export interface NewRiderInput {
  name: string
  phone: string
  vehicle_type: DeliveryType
  plate: string
  tank_gallons: number | null
  service_area: string
}

export interface StationInput {
  name: string
  address: string
  area: string
  hours: string
  products: string
  capacity: string | null
}

export type { TankType }
