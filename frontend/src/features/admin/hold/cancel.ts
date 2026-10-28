/**
 * The CANCEL dialog's wording (admin-hold-review.md, CANCEL and decision 10;
 * admin-order-cancellation.md, C1). It says only what the agreed cancel does:
 * nothing notifies the driver, and no message goes to the customer yet.
 */
import { HOLD_KIND_LABEL, type AdminOrder } from '../../../domain/admin'
import { ApiError } from '../../../lib/api/client'

/** The one agreed reason, `mmirioma_unable`, in words. */
export const CANCEL_REASON = 'MmiriOma is unable to deliver'

/** The toast after a cancel (admin-hold-review.md, decision 13). */
export const CANCELLED_TOAST = 'Order cancelled. Tell the customer.'

const TELL_THEM = 'No cancellation message is sent to the customer yet: tell them yourself.'

/**
 * What the cancel does, for this order: the driver sentence only when a
 * driver's job is live (variant a), "No driver is assigned" otherwise (b),
 * and the hold it also closes (c).
 */
export function cancelSentences(order: Pick<AdminOrder, 'partner' | 'hold'>): string[] {
  const sentences = order.partner
    ? [`The driver's job ends and leaves their list. Nothing notifies the driver. ${TELL_THEM}`]
    : [`No driver is assigned, so no driver's job changes. ${TELL_THEM}`]
  if (order.hold) sentences.push(`This also closes the ${HOLD_KIND_LABEL[order.hold.kind].toLowerCase()} hold.`)
  return sentences
}

/** "Cancel this order" is on the page except for orders the cancel refuses (row 23). */
export function canCancel(order: Pick<AdminOrder, 'status'>): boolean {
  return order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'disputed'
}

/** The dialog's message for a failed outcome load or cancel, and whether Refresh is offered. */
export function cancelProblem(error: unknown, step: 'outcome' | 'cancel'): { text: string; refresh: boolean } | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'invalid_order_transition') {
    return step === 'outcome' ? { text: 'This order can no longer be cancelled.', refresh: true } : { text: 'This order has changed.', refresh: true }
  }
  if (step === 'outcome') return { text: "We couldn't check what this costs the customer.", refresh: false }
  return null
}
