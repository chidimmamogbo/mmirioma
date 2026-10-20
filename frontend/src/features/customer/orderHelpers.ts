import { isActiveStage, type CustomerOrder, type PaymentStatus } from '../../domain/orders'
import { formatDate, formatTime } from '../../lib/format/datetime'

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  awaiting_verification: 'Awaiting check',
  paid: 'Paid',
  refund_due: 'Refund due',
  refunded: 'Refunded',
}

/** Where a tap on an order goes: tracking while active, details after. */
export function orderLink(order: CustomerOrder): string {
  return isActiveStage(order.stage) ? `/orders/${order.reference}/track` : `/orders/${order.reference}`
}

/** "Today, 10:58 AM" for today's orders, the date otherwise (as in c-orders). */
export function orderWhen(order: CustomerOrder, now = new Date()): string {
  const today = formatDate(now)
  return formatDate(order.created_at) === today ? `Today, ${formatTime(order.created_at)}` : formatDate(order.created_at)
}
