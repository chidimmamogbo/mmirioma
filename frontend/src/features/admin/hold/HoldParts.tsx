import { AlertTriangleIcon } from '../../../components/icons/icons'
import { Button } from '../../../components/ui/Button'
import { Chip } from '../../../components/ui/Chip'
import { Notice } from '../../../components/ui/Notice'
import { HOLD_KIND_LABEL, type AdminOrderHold } from '../../../domain/admin'
import { formatTime } from '../../../lib/format/datetime'
import { timeAgo } from '../adminFormat'

/**
 * The amber "On hold" chip (admin-hold-review.md, R0). A hold is not a status,
 * so it sits beside the order's own status chip and always carries words.
 */
export function HoldChip() {
  return (
    <Chip tone="amber" icon={<AlertTriangleIcon size={14} />}>
      On hold
    </Chip>
  )
}

/**
 * The banner on a held order's panel (R0): the kind, when it opened (Lagos
 * time) and the driver whose job is waiting. **Review** opens the sheet where
 * the hold is decided.
 */
export function HoldBanner({ hold, driverName, onReview }: { hold: AdminOrderHold; driverName: string | null; onReview?: () => void }) {
  return (
    <div role="group" aria-label="Order on hold" className="flex flex-col gap-2.5 rounded-card border border-solid border-[#F5D58A] bg-gold-tint p-3.5 text-gold-ink">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 font-extrabold">
          <AlertTriangleIcon size={18} />
          On hold: {HOLD_KIND_LABEL[hold.kind]}
        </div>
        <div className="text-caption">
          Since {formatTime(hold.since)} · {timeAgo(hold.since)}
          {driverName && (
            <>
              <br />
              Driver: {driverName}
            </>
          )}
        </div>
      </div>
      {onReview && (
        <Button size="sm" block={false} className="self-start" onClick={onReview}>
          Review
        </Button>
      )}
    </div>
  )
}

/**
 * The decided card (R0, after a decision): who decided, when, and the note,
 * from the history line. It leaves out the litres and how the customer
 * confirmed, which no agreed endpoint returns (design decision 15).
 */
export function DecidedCard({ entry }: { entry: { label: string; at: string; detail?: string } }) {
  return (
    <Notice tone="success">
      <b>{entry.label}</b> · {formatTime(entry.at)}
      {entry.detail && (
        <>
          <br />
          {entry.detail}
        </>
      )}
    </Notice>
  )
}
