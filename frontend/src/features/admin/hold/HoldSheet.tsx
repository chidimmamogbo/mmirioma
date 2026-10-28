import { useQueryClient } from '@tanstack/react-query'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Notice } from '../../../components/ui/Notice'
import { ApiError } from '../../../lib/api/client'
import { adminKeys } from '../queries'
import { HoldFrame } from './HoldFrame'
import { ProofReview } from './ProofReview'
import { useHoldReview } from './queries'
import { SourceReview } from './SourceReview'
import { UnsafeReview } from './UnsafeReview'

/**
 * The review sheet for a held order (admin-hold-review.md). It loads the
 * evidence for the order's open hold, then hands over to the review for its
 * kind: proof (R1), source (R2) or unsafe stop (R3). Until then, and when
 * there is nothing to review, it shows the loading, "no open hold" and error
 * states. `onDecided` tells the page what happened, for its toast.
 */
export function HoldSheet({
  reference,
  customer,
  onClose,
  onDecided,
}: {
  reference: string
  /** From the order the sheet was opened from, so the dispatcher can call the customer (design decision 3). */
  customer: { name: string; phone: string }
  onClose: () => void
  onDecided: (message: string) => void
}) {
  const review = useHoldReview(reference)
  const qc = useQueryClient()
  const hold = review.data

  /** Refresh the orders and close: the hold was decided meanwhile, or the order moved on. */
  function refresh() {
    void qc.invalidateQueries({ queryKey: adminKeys.all })
    onClose()
  }

  const props = { reference, customer, onClose, onDecided, onRefresh: refresh }
  if (hold?.kind === 'proof_review' && hold.proof) return <ProofReview {...props} hold={hold} />
  if (hold?.kind === 'source_review' && hold.pickup) return <SourceReview {...props} hold={hold} />
  if (hold?.kind === 'unsafe_stop' && hold.report) return <UnsafeReview {...props} hold={hold} />

  const noHold = review.error instanceof ApiError && review.error.code === 'hold_not_found'
  return (
    <HoldFrame reference={reference} customer={customer} hold={null} onClose={onClose}>
      {review.isPending && <LoadingBlock lines={4} label="Loading the review" />}
      {noHold && (
        <>
          <Notice tone="info">
            <b>This order has no open hold.</b>
            <br />
            It was decided meanwhile. Refresh to see the order as it is now.
          </Notice>
          <div>
            <Button variant="line" size="sm" block={false} onClick={refresh}>
              Refresh
            </Button>
          </div>
        </>
      )}
      {review.isError && !noHold && <ErrorBlock error={review.error} onRetry={() => review.refetch()} />}
      {/* Evidence that does not match its kind is not shown: the server's answer is not one this sheet can review. */}
      {hold && <ErrorBlock error={new Error('unexpected evidence')} onRetry={() => review.refetch()} />}
    </HoldFrame>
  )
}
