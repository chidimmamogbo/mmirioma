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

/** Standard tank sizes (design `c-tanker`). "Custom" needs a manual quote (FR-021). */
export const TANK_SIZES: TankSizeGallons[] = [500, 750, 1000]

/**
 * Approximate litres per tank size, from the owner (GeePee tank sizes). These
 * are tank-maker sizes, not a unit conversion, so they are shown as "about"
 * and litres are never computed from gallons.
 */
export const TANK_LITRES: Record<TankSizeGallons, { min: number; max: number }> = {
  500: { min: 2000, max: 2500 },
  750: { min: 3000, max: 3000 },
  1000: { min: 4000, max: 5000 },
}

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
 * Customer-facing delivery stage, shown with the design's labels (decision 12).
 * `failed` and `under_review` show the backend's `failed` and `disputed`
 * statuses (decision of 2026-10-26, docs/architecture/api-mapping.md).
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

export const STAGE_LABEL: Record<DeliveryStage, string> = {
  waiting_rider: 'Waiting for rider',
  rider_assigned: 'Rider assigned',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Delivery failed',
  under_review: 'Under review',
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
  choice: WaterChoice
  /** Short label of where it goes, e.g. "Home". */
  address_label: string
  address: string
  landmark: string | null
  receiver_name: string
  receiver_phone: string
  instructions: string | null
  stage: DeliveryStage
  payment: { method: PaymentMethod; status: PaymentStatus }
  quote: Extract<Quote, { status: 'quote_available' }>
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

/** Quantity as the design writes it: "25 L × 24 cans", "750 gallons", "Custom size". */
export function describeChoice(choice: WaterChoice, style: 'long' | 'short' = 'long'): string {
  if (choice.delivery_type === 'keke') {
    return style === 'long'
      ? `${choice.can_size_litres} L × ${choice.can_count} cans`
      : `${choice.can_size_litres} L × ${choice.can_count}`
  }
  if (choice.tank_size_gallons === null) return 'Custom size'
  const size = choice.tank_size_gallons.toLocaleString('en-NG')
  return style === 'long' ? `${size} gallons` : `${size} gal`
}

/** Total litres for a Keke order (cans × size). Not used for tankers (see TANK_LITRES). */
export function kekeTotalLitres(choice: Extract<WaterChoice, { delivery_type: 'keke' }>): number {
  return choice.can_size_litres * choice.can_count
}

/** "about 2,000 to 2,500 L" for a tank size. */
export function describeTankLitres(size: TankSizeGallons): string {
  const { min, max } = TANK_LITRES[size]
  const f = (n: number) => n.toLocaleString('en-NG')
  return min === max ? `about ${f(min)} L` : `about ${f(min)} to ${f(max)} L`
}

export interface SavedAddress {
  id: string
  /** "Home", "Office", "Mum's House"... */
  label: string
  address: string
  landmark: string | null
  is_default: boolean
}

export interface CustomerNotification {
  id: string
  title: string
  body: string
  at: string
  read: boolean
  kind: 'on_the_way' | 'rider_assigned' | 'order_received' | 'delivered' | 'points' | 'payment'
  /** Order the notification is about, if any. */
  reference: string | null
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
  /** Optional, for updates, newsletters and promo alerts (decision 6). */
  email: string | null
  customer_since: string
  photo_url: string | null
  preferences: { sms_updates: boolean; whatsapp_updates: boolean; offers_and_news: boolean }
  stats: { orders: number; points: number; addresses: number }
}
