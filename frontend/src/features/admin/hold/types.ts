import type { HoldReview } from '../../../lib/api/adminHolds'

/** What every kind's review needs (admin-hold-review.md): the evidence and what to do when it is decided. */
export interface ReviewProps {
  reference: string
  /** From the order the sheet was opened from, so the dispatcher can call the customer (design decision 3). */
  customer: { name: string; phone: string }
  hold: HoldReview
  onClose: () => void
  /** Tells the page what happened, for its toast. */
  onDecided: (message: string) => void
  /** The hold or the order moved on: refresh the orders and close. */
  onRefresh: () => void
}
