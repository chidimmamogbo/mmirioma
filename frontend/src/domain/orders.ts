/**
 * Order domain types for the new-design frontend.
 *
 * These go beyond the Sprint 1 orders contract (docs/api/orders.md), which
 * has only `quantity_litres` and no price. Delivery type, jerrycans, tanks,
 * water source, prices and delivery stages come from the design and the
 * owner's decisions (docs/design/handoff-v1.md). They are served by mocks
 * until a contract exists. JSON field names follow the API conventions:
 * snake_case, money as integer kobo in `*_minor_units`, UTC ISO timestamps.
 */
import { describeQuantity, litresFromGallons } from './quantity'
import { parseGallons } from './tankCapacity'

export type DeliveryType = 'keke' | 'tanker'
export type CanSizeLitres = 25 | 50
export type TankType = 'ground' | 'overhead'
export type TankSizeGallons = 500 | 750 | 1000

/** Water sources offered for Tanker orders only (decision 10, changed 2026-10-16: not for Keke). */
export type WaterSource = 'ninth_mile' | 'borehole'

export const WATER_SOURCE_LABEL: Record<WaterSource, string> = {
  ninth_mile: 'Ninth Mile water',
  borehole: 'Any Bore hole water',
}

/** Jerrycan sizes and counts offered for Keke delivery (design `c-keke`). */
export const CAN_SIZES: CanSizeLitres[] = [25, 50]
export const CAN_COUNTS = [12, 24, 30, 60] as const

/** Smallest order the server accepts, in litres (SRS v0.3 FR-021). The server checks it too. */
export const MIN_ORDER_LITRES = 600

/**
 * Can counts offered for a can size: only those that reach MIN_ORDER_LITRES,
 * so 12 × 25 L (300 L) is not offered (decision of 2026-10-26).
 */
export function canCountsFor(size: CanSizeLitres): number[] {
  return CAN_COUNTS.filter((count) => count * size >= MIN_ORDER_LITRES)
}

/** The can count to keep when the size changes: the same one if still offered, else the smallest offered. */
export function fitCanCount(size: CanSizeLitres, count: number): number {
  const offered = canCountsFor(size)
  return offered.includes(count) ? count : (offered[0] ?? CAN_COUNTS[CAN_COUNTS.length - 1])
}

/**
 * Standard tank sizes in local gallons (design `c-tanker`): exactly 2,000,
 * 3,000 and 4,000 litres (FR-021). "Custom" needs a manual quote (FR-021).
 */
export const TANK_SIZES: TankSizeGallons[] = [500, 750, 1000]

/** What the customer chose on the quantity screen. */
export type WaterChoice =
  | { delivery_type: 'keke'; can_size_litres: CanSizeLitres; can_count: number }
  | {
      delivery_type: 'tanker'
      tank_type: TankType
      /** `null` means a custom size, which always needs a manual quote. */
      tank_size_gallons: TankSizeGallons | null
      source: WaterSource
    }

/** One priced line of a quote, e.g. "Water (24 × ₦250)". */
export interface QuoteLine {
  label: string
  amount_minor_units: number
  /** Price per jerrycan, when the line is priced per can. */
  unit_minor_units?: number
}

/**
 * Server-side price for a choice (FR-022: the client never computes prices).
 * The delivery fee depends on the distance from the refill station to the
 * address, so it is `null` until an address is known (decision 10).
 */
export type Quote =
  | {
      status: 'quote_available'
      currency: 'NGN'
      water: QuoteLine
      delivery: QuoteLine | null
      total_minor_units: number
      /** Points the customer would earn; sample loyalty rules. */
      points_estimate: number
      price_valid_until: string
      is_sample: boolean
    }
  | { status: 'manual_quote_required'; reason: string }

/**
 * The price an order was placed with (FR-024). The server sends the total
 * only (docs/api/order-details-and-price.md, decision 6), so `water` and
 * `delivery` are `null` for real orders; only the mock fills them.
 */
export interface OrderPrice {
  currency: 'NGN'
  total_minor_units: number
  water: QuoteLine | null
  delivery: QuoteLine | null
  is_sample: boolean
}

/**
 * Customer-facing delivery stage, shown with the design's labels (decision 12).
 * `failed` and `under_review` show the backend's `failed` and `disputed`
 * statuses (decision of 2026-10-26, docs/architecture/api-mapping.md).
 * `order_update` is the neutral stage for a status the app does not know
 * (docs/api/orders.md: "Clients must never fail on an unknown `status`").
 */
export type DeliveryStage =
  | 'waiting_rider'
  | 'rider_assigned'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'under_review'
  | 'order_update'

export const STAGE_LABEL: Record<DeliveryStage, string> = {
  waiting_rider: 'Waiting for rider',
  rider_assigned: 'Rider assigned',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Delivery failed',
  under_review: 'Under review',
  // The agreed fallback wording (docs/api/orders.md, #82).
  order_update: 'Order update',
}

/**
 * Active orders are the ones a customer can still track. A failed delivery has
 * ended, and an order under review is not moving until staff resolve it, so
 * neither is tracked.
 */
export function isActiveStage(stage: DeliveryStage): boolean {
  return !['delivered', 'cancelled', 'failed', 'under_review'].includes(stage)
}

/** Stages that end an order with a problem, shown in red. */
export function isProblemStage(stage: DeliveryStage): boolean {
  return stage === 'cancelled' || stage === 'failed'
}

/** Payment state, always shown separately from delivery (FR-040, BR-07). */
export type PaymentStatus = 'unpaid' | 'awaiting_verification' | 'paid' | 'refund_due' | 'refunded'
export type PaymentMethod = 'pay_on_delivery' | 'bank_transfer' | 'cash'

export interface DeliveryPartner {
  name: string
  vehicle: DeliveryType
  plate: string
  /** Average rating out of 5, or null for a new partner. */
  rating: number | null
  phone: string
}

export interface TimelineEvent {
  label: string
  at: string
  detail?: string
}

export interface CustomerOrder {
  reference: string
  created_at: string
  /** `null` for an order sent before #21, which carries only its quantity. */
  choice: WaterChoice | null
  /** Whole litres as the server stored them (FR-021). Set by the real adapter; mock orders use `choice`. */
  quantity_litres?: number
  /** Short label of where it goes, e.g. "Home". `null` when the server does not send one. */
  address_label: string | null
  address: string
  landmark: string | null
  receiver_name: string
  receiver_phone: string
  instructions: string | null
  stage: DeliveryStage
  /** `status` is `null` until customers are sent a payment status (docs/api/orders.md, decided question 3). */
  payment: { method: PaymentMethod; status: PaymentStatus | null }
  /** `null` for a quote request: the office calls with the price (FR-022 manual fallback). */
  quote: OrderPrice | null
  partner: DeliveryPartner | null
  /** Station where the water is collected, once known. */
  station_name: string | null
  /** Minutes until arrival. Only present when a real estimate exists (decision 14). */
  eta_minutes: number | null
  /** Six-digit code the customer gives after delivery; only while active. */
  delivery_code: string | null
  timeline: TimelineEvent[]
  delivered_at: string | null
  /** Litres or gallons actually delivered, as recorded by the partner. */
  delivered_quantity: string | null
  points_earned: number | null
  feedback: { rating: number; poured_by_partner: boolean } | null
}

/** Short reference used in lists, e.g. "MO-7KQ2" for "MO-7KQ2M9XH4T". */
export function shortReference(reference: string): string {
  return reference.slice(0, 7)
}

/**
 * Quantity in both units (FR-021, decision of 2026-10-26): "25 L × 24 cans
 * (600 L · 150 gal)", "750 gallons (3,000 litres)", "Custom size". Tankers
 * lead with gallons, the size customers pick.
 */
export function describeChoice(choice: WaterChoice, style: 'long' | 'short' = 'long'): string {
  if (choice.delivery_type === 'keke') {
    const cans = style === 'long' ? `${choice.can_size_litres} L × ${choice.can_count} cans` : `${choice.can_size_litres} L × ${choice.can_count}`
    return `${cans} (${describeQuantity(kekeTotalLitres(choice), 'litres', 'short')})`
  }
  if (choice.tank_size_gallons === null) return 'Custom size'
  return describeQuantity(litresFromGallons(choice.tank_size_gallons), 'gallons', style)
}

/** Total litres for a Keke order (cans × size). */
export function kekeTotalLitres(choice: Extract<WaterChoice, { delivery_type: 'keke' }>): number {
  return choice.can_size_litres * choice.can_count
}

/**
 * A tank size in both units while ordering: a standard size, or the custom
 * gallons the customer typed. Null while a custom size is empty or not a
 * whole number.
 */
export function describeTankSize(size: TankSizeGallons | null, customTyped: string): string | null {
  const gallons = size ?? parseGallons(customTyped)
  return gallons === null ? null : describeQuantity(litresFromGallons(gallons), 'gallons')
}

/** Total litres for any order, or null for a custom tank size (not known until the team quotes it). */
export function choiceLitres(choice: WaterChoice): number | null {
  if (choice.delivery_type === 'keke') return kekeTotalLitres(choice)
  return choice.tank_size_gallons === null ? null : litresFromGallons(choice.tank_size_gallons)
}

export interface SavedAddress {
  id: string
  /** "Home", "Office", "Mum's House"... */
  label: string
  address: string
  landmark: string | null
  is_default: boolean
  /**
   * The area (service zone) the customer picked for it (FR-020). Sent by the
   * real API; mock addresses have none. `is_active` false: no longer served,
   * so its quote answers `outside_service_zone` (docs/api/customer-account.md).
   */
  zone?: { id: string; name: string; is_active: boolean } | null
}

export interface CustomerNotification {
  id: string
  title: string
  body: string
  at: string
  read: boolean
  /**
   * `order_confirmed`, `cancelled` and `delivery_failed` come from the server
   * (docs/api/customer-account.md); `update` is the neutral style for a kind
   * this build does not know, shown with the server's own title and body.
   */
  kind:
    | 'on_the_way'
    | 'rider_assigned'
    | 'order_received'
    | 'delivered'
    | 'points'
    | 'payment'
    | 'order_confirmed'
    | 'cancelled'
    | 'delivery_failed'
    | 'update'
  /** Order the notification is about, if any. */
  reference: string | null
}

/**
 * The newest notifications, plus the unread count across all of them. The
 * list may be one page (the real API sends the newest 50), so the bell, the
 * menu badge and "Mark all read" use `unread_count`, never the unread items
 * in the list (the same rule as the partner app, #80).
 */
export interface CustomerNotificationList {
  items: CustomerNotification[]
  unread_count: number
}

export interface PointsEntry {
  id: string
  label: string
  /** Display date text, e.g. "2 Oct 2026" or "Sep 2026". */
  at: string
  points: number
  kind: 'earned' | 'redeemed' | 'adjusted' | 'bonus'
}

export interface PointsSummary {
  balance: number
  /** Naira value of the balance, in kobo (sample rule). */
  balance_value_minor_units: number
  next_reward: { label: string; target: number }
  history: PointsEntry[]
  is_sample: boolean
}

export type ProblemType = 'late' | 'wrong_quantity' | 'payment' | 'rider' | 'other'

export const PROBLEM_LABEL: Record<ProblemType, string> = {
  late: 'Late delivery',
  wrong_quantity: 'Wrong quantity',
  payment: 'Payment',
  rider: 'Rider',
  other: 'Something else',
}

export interface SupportTicket {
  id: string
  /** "#CP-004" */
  number: string
  title: string
  at: string
  note: string | null
  status: 'open' | 'resolved'
  kind: 'problem' | 'question'
}

export interface CustomerProfile {
  name: string
  phone: string
  phone_verified: boolean
  /**
   * Optional, for updates, newsletters and promo alerts (decision 6).
   * Absent when the app does not offer email: left out of the pilot
   * (docs/api/customer-account.md, decision 1).
   */
  email?: string | null
  customer_since: string
  photo_url: string | null
  /** `null` when the app does not offer these switches (customer-account.md, decision 3). */
  preferences: { sms_updates: boolean; whatsapp_updates: boolean; offers_and_news: boolean } | null
  /** `points` is `null` when the app has no points (out of the MVP, customer-account.md, decision 12). */
  stats: { orders: number; points: number | null; addresses: number }
}
