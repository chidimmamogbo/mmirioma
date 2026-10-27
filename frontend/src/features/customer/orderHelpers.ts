import type { IllustrationName } from '../../components/brand/Illustration'
import { describeChoice, isActiveStage, type CustomerOrder, type PaymentStatus } from '../../domain/orders'
import { describeQuantity } from '../../domain/quantity'
import { formatDate, formatTime } from '../../lib/format/datetime'
import { formatNaira } from '../../lib/format/money'

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  awaiting_verification: 'Awaiting check',
  paid: 'Paid',
  refund_due: 'Refund due',
  refunded: 'Refunded',
}

/**
 * Shown instead of a total for a quote request, which has no price yet: the
 * office calls with it (FR-022 manual fallback). Wording from the agreed
 * `quote_requested` text in docs/api/orders.md ("We're preparing your price.").
 */
export const PRICE_PENDING = 'Preparing your price'

/** Where a tap on an order goes: tracking while active, details after. */
export function orderLink(order: CustomerOrder): string {
  return isActiveStage(order.stage) ? `/orders/${order.reference}/track` : `/orders/${order.reference}`
}

/** "Today, 10:58 AM" for today's orders, the date otherwise (as in c-orders). */
export function orderWhen(order: CustomerOrder, now = new Date()): string {
  const today = formatDate(now)
  return formatDate(order.created_at) === today ? `Today, ${formatTime(order.created_at)}` : formatDate(order.created_at)
}

/**
 * What the order carries. Uses the cans or tank when known; an order sent
 * before #21 has only the server's litres (FR-021), shown in both units.
 */
export function orderQuantityText(order: CustomerOrder, style: 'long' | 'short' = 'long'): string {
  if (order.choice) return describeChoice(order.choice, style)
  return order.quantity_litres !== undefined ? describeQuantity(order.quantity_litres, 'litres', style) : 'Water order'
}

/** The order's total, or {@link PRICE_PENDING} for a quote request. Never a computed price (FR-022). */
export function orderPriceText(order: CustomerOrder): string {
  return order.quote ? formatNaira(order.quote.total_minor_units) : PRICE_PENDING
}

/** The saved label ("Home"), or the address itself when the server sends no label. */
export function orderPlaceLabel(order: CustomerOrder): string {
  return order.address_label ?? order.address
}

/**
 * Picture for the order. A neutral water drop when the delivery type is not
 * known (an order sent before #21), so the screen never implies Keke or Tanker.
 */
export function orderIllustration(order: CustomerOrder, keke: IllustrationName = 'keke'): IllustrationName {
  if (!order.choice) return 'drop-hero'
  return order.choice.delivery_type === 'keke' ? keke : 'tanker'
}
