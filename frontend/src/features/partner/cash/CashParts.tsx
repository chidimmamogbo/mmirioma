/**
 * Parts of the driver cash screens (docs/design/driver-cash.md, #20): the K1
 * Cash card on the Done screens, the K2 home card, a cash row, and the
 * success line a screen shows after it was sent there with a toast.
 */
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ButtonLink } from '../../../components/ui/Button'
import { Card, CardLink } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { Notice } from '../../../components/ui/Notice'
import type { PartnerJob, VehicleType } from '../../../domain/partner'
import { cx } from '../../../lib/cx'
import type { CashCollection } from '../partnerApi'
import { useMyCash } from '../queries'
import { amountDueLine, cashTime, custodyLabel, formatCash, handOverBy } from './logic'

/** Navigation state that carries a toast to the next screen ("Cash recorded for MO-…"). */
export interface ToastState {
  toast?: string
}

/** The toast a screen was opened with, as a status line at its top. */
export function ArrivalToast() {
  const toast = (useLocation().state as ToastState | null)?.toast
  return toast ? (
    <Notice tone="success" className="w-full text-left">
      {toast}
    </Notice>
  ) : null
}

/** The amount block: caption, the amount in 28 px bold, an optional line (design system additions). */
export function AmountBlock({ caption, amount, line, className }: { caption: string; amount: number; line?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-caption font-bold text-mute">{caption}</div>
      <div className="text-[28px] leading-tight font-extrabold tracking-[-0.5px]">{formatCash(amount)}</div>
      {line && <div className="text-caption text-mute">{line}</div>}
    </div>
  )
}

/**
 * K1 Cash card, below the job summary on the Done screen (decision 2). No
 * card while the job has no `cash` (unloading not complete, or it ended
 * without unloading).
 */
export function CashCard({ job, base, vehicle }: { job: PartnerJob; base: string; vehicle: VehicleType }) {
  const cash = job.cash
  if (!cash) return null
  const row = cash.collection
  if (!row) {
    if (!cash.record_allowed) return null
    return (
      <Card pad className="box-border flex w-full flex-col gap-3 text-left" aria-label="Cash">
        <AmountBlock caption="Amount due" amount={cash.amount_due_minor_units} line={amountDueLine(cash.amount_due_label)} />
        <p className="m-0 text-sub text-slate">Count the cash with the customer before you record it.</p>
        <ButtonLink to={`${base}/jobs/${job.reference}/cash`}>Record cash</ButtonLink>
      </Card>
    )
  }
  const outstanding = row.amount_due_minor_units - row.amount_minor_units
  return (
    <Card pad className="box-border flex w-full flex-col gap-2 text-left" aria-label="Cash">
      <div className="flex items-center justify-between gap-2">
        <Chip tone="green">Cash recorded</Chip>
        <span className="text-caption text-mute">{cashTime(row.collected_at)}</span>
      </div>
      <AmountBlock caption={custodyLabel(row, vehicle)} amount={row.amount_minor_units} line={outstanding > 0 ? `${formatCash(outstanding)} outstanding` : undefined} />
      {row.status === 'collected' || row.status === 'awaiting_remittance' ? <div className="text-sub font-bold">{handOverBy(row.remittance_due_at)}</div> : null}
      <ButtonLink to={`${base}/cash`} variant="alt">
        My cash
      </ButtonLink>
    </Card>
  )
}

/** One cash record: reference and time left, amount and chips right, an optional tick box before. */
export function CashRow({ row, vehicle, check }: { row: CashCollection; vehicle: VehicleType; check?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {check}
      <div className="min-w-0 flex-1">
        <div className="truncate font-extrabold">{row.order_reference}</div>
        <div className="text-caption text-mute">{cashTime(row.collected_at)}</div>
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        <span className="font-extrabold">{formatCash(row.amount_minor_units)}</span>
        <span className="flex flex-wrap justify-end gap-1">
          <Chip tone={row.status === 'collected' ? 'amber' : row.status === 'awaiting_remittance' ? 'blue' : 'green'} className="px-2 py-0.5">
            {custodyLabel(row, vehicle)}
          </Chip>
          {row.overdue && (
            <Chip tone="red" className="px-2 py-0.5">
              Overdue
            </Chip>
          )}
        </span>
      </div>
    </div>
  )
}

/**
 * K2 home card, under the online card, only while cash is on hand. It never
 * stands in the way of the home screen: while loading or on an error it shows
 * nothing (My cash says what went wrong).
 */
export function HomeCashCard({ base }: { base: string }) {
  const cash = useMyCash()
  const c = cash.data
  if (!c || c.on_hand_minor_units <= 0) return null
  return (
    <CardLink to={`${base}/cash`} className={cx('flex items-center gap-3 p-3.5', c.overdue && 'border-2 border-red')}>
      <AmountBlock
        className="flex-1"
        caption="Cash to hand over"
        amount={c.on_hand_minor_units}
        line={c.remittance_due_at ? handOverBy(c.remittance_due_at) : undefined}
      />
      <span className="flex flex-col items-end gap-1.5">
        {c.overdue && <Chip tone="red">Overdue</Chip>}
        <span className="text-sub font-extrabold text-primary">My cash</span>
      </span>
    </CardLink>
  )
}
