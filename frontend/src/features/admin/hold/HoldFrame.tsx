import type { ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Notice } from '../../../components/ui/Notice'
import { HOLD_KIND_LABEL } from '../../../domain/admin'
import type { HoldReview } from '../../../lib/api/adminHolds'
import { formatTime } from '../../../lib/format/datetime'
import { formatPhone } from '../../../lib/format/phone'
import { timeAgo } from '../adminFormat'
import { SideSheet } from '../confirm/SideSheet'
import type { DecisionFailure } from './logic'
import { STAFF_STATUS_LABEL } from './logic'

/**
 * The review sheet's frame (admin-hold-review.md): the hold's kind as the
 * title, a line with the order, its status in staff words and the driver, when
 * the hold opened, and the customer's name with a call link (design decision
 * 3). `hold` is `null` while the evidence loads or when there is none.
 */
export function HoldFrame({
  reference,
  customer,
  hold,
  locked = false,
  onClose,
  footer,
  children,
}: {
  reference: string
  customer: { name: string; phone: string }
  hold: HoldReview | null
  locked?: boolean
  onClose: () => void
  /** The decision buttons; "Close" is always added. */
  footer?: ReactNode
  children: ReactNode
}) {
  const sub = hold ? (
    <>
      Order {reference} · {STAFF_STATUS_LABEL[hold.order_status] ?? hold.order_status} · Driver: {hold.driver.name}
      <br />
      On hold since {formatTime(hold.since)} ({timeAgo(hold.since)}) · {customer.name} ·{' '}
      <a href={`tel:${customer.phone}`} className="font-bold text-primary-dark">
        Call {formatPhone(customer.phone)}
      </a>
    </>
  ) : undefined
  return (
    <SideSheet
      title={hold ? HOLD_KIND_LABEL[hold.kind] : 'Review hold'}
      sub={sub}
      locked={locked}
      onClose={onClose}
      footer={
        <>
          <Button variant="line" size="sm" block={false} disabled={locked} onClick={onClose}>
            Close
          </Button>
          {footer}
        </>
      }
    >
      {children}
    </SideSheet>
  )
}

/**
 * A refused decision, in the sheet: its message, and **Refresh** when the hold
 * or the order moved on ("This order has changed.").
 */
export function FailureNotice({ failure, onRefresh }: { failure: DecisionFailure; onRefresh: () => void }) {
  return (
    <Notice tone="error">
      <b>{failure.message}</b>
      {failure.changed && (
        <>
          <br />
          <button type="button" onClick={onRefresh} className="mt-1 cursor-pointer border-0 bg-transparent p-0 font-bold text-red underline">
            Refresh
          </button>
        </>
      )}
    </Notice>
  )
}
