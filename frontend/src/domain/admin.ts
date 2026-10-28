/**
 * Admin domain types (design `a-*` screens and the added admin pages).
 *
 * No admin contract exists beyond the Sprint 1 order list/detail
 * (docs/api/orders.md), so these are served by mocks (src/mocks/adminMock.ts).
 * Field names follow the API conventions: snake_case, money as integer kobo in
 * `*_minor_units`, UTC ISO timestamps. Every naira amount here is a SAMPLE
 * (decision 10, 16).
 */
import type { DeliveryType, PaymentMethod, PaymentStatus, TankType, WaterChoice } from './orders'
import type { ApprovalStatus } from './partner'

/* ---------- Orders ---------- */

/**
 * Admin's view of where an order is, from the job and the customer order (a-orders).
 * `failed` and `disputed` show the backend statuses of the same name
 * (api-mapping.md open question 5, decided in #15). `awaiting_confirmation`
 * covers a quote request and a priced order before a dispatcher confirms
 * them: no rider can be assigned yet (admin-confirm-order.md, decision 3).
 */
export type AdminOrderStatus =
  | 'awaiting_confirmation'
  | 'awaiting_rider'
  | 'assigned'
  | 'loading'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'disputed'

export const ADMIN_STATUS_LABEL: Record<AdminOrderStatus, string> = {
  awaiting_confirmation: 'Awaiting confirmation',
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
 * Payment status on admin screens: the design's statuses plus
 * `pending_collection` ("Cash to collect", decided by @chidimmamogbo on PR #92),
 * the status of a confirmed pay-on-delivery order before the driver collects;
 * and `partially_paid` ("Part paid", from the approved cash design,
 * docs/design/cash-remittance.md), when the driver collects less than due.
 */
export type AdminPaymentStatus = PaymentStatus | 'pending_collection' | 'partially_paid'

/**
 * Order list filters (a-orders pills). "In progress" covers assigned, loading
 * and on the way. "On hold" lists every order with an open hold, whatever its
 * status (admin-hold-review.md, R0).
 */
export type AdminOrderFilter = 'all' | 'awaiting_confirmation' | 'awaiting_rider' | 'in_progress' | 'on_hold' | 'delivered' | 'cancelled'

/** Why a driver's job is on hold (docs/api/deliveries.md, "Hold object on admin orders"). */
export type HoldKind = 'proof_review' | 'source_review' | 'unsafe_stop'

/** Staff words for the hold kinds (admin-hold-review.md, decision 12). */
export const HOLD_KIND_LABEL: Record<HoldKind, string> = {
  proof_review: 'Proof review',
  source_review: 'Source review',
  unsafe_stop: 'Unsafe stop',
}

const HOLD_CONCERN_LABEL: Partial<Record<string, string>> = {
  alternative_proof: 'Alternative proof',
  source_mismatch: 'Another source used',
  pickup_safety_concern: 'Safety concern at pickup',
  unsafe_access: 'Unsafe access',
  unsafe_transfer: 'Unsafe transfer',
}

/**
 * The kind of concern a hold opened with, in words (admin-hold-review.md,
 * decision 12). A category the app does not know has no label and shows no
 * concern line, never a raw code (decision 16).
 */
export const holdConcernLabel = (category: string): string | null => HOLD_CONCERN_LABEL[category] ?? null

const HOLD_DECISION_LABEL: Partial<Record<string, string>> = {
  proof_approved: 'Proof approved',
  proof_rejected: 'Proof rejected',
  source_continued: 'Source continued',
  unsafe_resumed: 'Delivery resumed after unsafe stop',
}

/**
 * The words for a decision recorded on a hold (deliveries.md, "GET .../history
 * (change)"). A hold closed by a fail, cancel or withdraw has none: its status
 * change shows it.
 */
export const holdDecisionLabel = (decision: string): string | null => HOLD_DECISION_LABEL[decision] ?? null

/**
 * The open hold on an order's live job. A hold is not a status: the order keeps
 * its status while it is open. `id` is sent back with a decision.
 */
export interface AdminOrderHold {
  id: string
  kind: HoldKind
  /** When the hold opened (UTC ISO); shown as Lagos time and "12 minutes ago". */
  since: string
}

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
  /**
   * The server's own order status behind `status`, for the few places that must
   * tell apart statuses the design groups: only a `confirmed` order can be
   * assigned, but `awaiting_rider` also covers `awaiting_payment` (#144). Absent
   * in mock mode, which has no such statuses.
   */
  backend_status?: string
  /** The order's open hold, or `null`. */
  hold: AdminOrderHold | null
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
  /** `null` when the server does not say Keke or tanker (its vehicle type is free text). */
  vehicle: DeliveryType | null
  rating: number | null
  active_orders: number
  online: boolean
  /**
   * The rider lists the order's area among the areas they work in. No live
   * location (decision 14). `null` while the server does not check service
   * areas (deliveries.md, "Driver eligibility").
   */
  works_in_area: boolean | null
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
  /**
   * The area's coordinates, WGS 84 decimal degrees, typed in by admin since no
   * map provider is approved (FR-010, docs/api/admin-directory.md, `centre`).
   * Latitude -90 to 90, longitude -180 to 180.
   */
  centre: { latitude: number; longitude: number }
  /**
   * Delivery fee per order for the pilot water category (Z4, "Delivery fee per
   * order (₦)"). `null`: no fee, so quotes for the area become manual.
   */
  fixed_fee_minor_units: number | null
}

/* ---------- Pricing, points, payouts ---------- */

/**
 * One rule of a price list: the handling and margin for an area, a water
 * category and a quantity band (FR-022). Docs: docs/api/admin-directory.md,
 * "Price lists". Every amount is integer kobo (BR-01).
 */
export interface PriceRule {
  id: string
  /** A service zone, or `null` for every area without a rule of its own. */
  zone_id: string | null
  /** A water category, or `null` for every water. */
  water_category_id: string | null
  /** Whole litres, inclusive; at least 600 (FR-021). */
  min_litres: number
  /** Whole litres, inclusive, or `null` for no upper limit. */
  max_litres: number | null
  /** Saved but not used until road distance exists (SRS §12.1): the pilot prices delivery from the area's fee. */
  base_delivery_fee_minor_units: number
  /** Saved but not used yet, as above. */
  distance_rate_minor_units_per_km: number
  /** Saved but not used yet, as above ("Second trip"). */
  additional_trip_minor_units: number
  /** Handling cost per order. */
  handling_minor_units: number
  /** 1 % is 100 basis points, so no fractions are sent. */
  margin: { type: 'fixed'; amount_minor_units: number } | { type: 'percentage'; basis_points: number }
}

/** One field that differs from the previous version. `from` is `null` for an added rule, `to` for a removed one. */
export interface PriceChange {
  /** `rules[2].handling_minor_units`, or `rules[2]` for a whole rule. */
  path: string
  from: unknown
  to: unknown
}

/**
 * One version of the price list (FR-022). Every save creates a new version;
 * quotes already given and orders keep their price (FR-024).
 */
export interface PriceList {
  version: number
  /** When the version took effect (UTC ISO): the time it was saved. */
  effective_from: string
  created_by: { id: string; name: string }
  reason: string | null
  rules: PriceRule[]
  /** What changed from the previous version; empty on version 1. */
  changes: PriceChange[]
}

/** A page of price list versions, newest first (the shared page shape). */
export interface PriceListPage {
  items: PriceList[]
  total: number
  limit: number
  offset: number
}

/** A water category as the Pricing screen's Water picker reads it (docs/api/admin-directory.md, amendment #160). */
export interface WaterCategoryOption {
  id: string
  label: string
  is_active: boolean
}

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
