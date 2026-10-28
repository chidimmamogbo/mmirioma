import { AlertTriangleIcon } from '../../../components/icons/icons'
import { Chip } from '../../../components/ui/Chip'
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
 * time) and the driver whose job is waiting. Deciding the hold is done in the
 * review sheet.
 */
export function HoldBanner({ hold, driverName }: { hold: AdminOrderHold; driverName: string | null }) {
  return (
    <div role="group" aria-label="Order on hold" className="flex flex-col gap-1 rounded-card border border-solid border-[#F5D58A] bg-gold-tint p-3.5 text-gold-ink">
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
  )
}
