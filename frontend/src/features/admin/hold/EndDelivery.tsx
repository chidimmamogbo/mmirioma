import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { SampleTag } from '../../../components/ui/Chip'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TextAreaField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { HOLD_KIND_LABEL, type AdminOrderHold } from '../../../domain/admin'
import { USE_MOCKS } from '../../../lib/api/mode'
import { FailureNotice } from './HoldFrame'
import {
  CANCEL_CUSTOMER,
  CANCEL_DRIVER_LIVE,
  CANCEL_DRIVER_NONE,
  CANCEL_TOAST,
  FAIL_REASONS,
  FAIL_TOAST,
  NOTE_MAX,
  decisionFailure,
  failErrors,
  outcomeFailure,
  type DecisionFailure,
  type FailForm,
} from './logic'
import { useCancellationOutcome, useTransitionOrder } from './queries'
import type { AdminTransitionRequest } from '../real/holds'

/** What FAIL and CANCEL need (admin-hold-review.md; admin-order-cancellation.md, C1). */
export interface EndProps {
  reference: string
  /** The status the dispatcher saw, as the server names it: a mismatch is "This order has changed." */
  expectedStatus: string
  /** The hold the dialog was opened from, if any: it is sent with the request and closes with the delivery. */
  hold: Pick<AdminOrderHold, 'id' | 'kind'> | null
  onClose: () => void
  /** Tells the page what happened, for its toast. */
  onDone: (message: string) => void
  /** The order moved on: refresh the orders and close. */
  onRefresh: () => void
}

/** "This also closes the <kind> hold." when the dialog was opened from one. */
function HoldLine({ hold }: { hold: EndProps['hold'] }) {
  return hold ? <span className="font-bold">This also closes the {HOLD_KIND_LABEL[hold.kind].toLowerCase()} hold.</span> : null
}

/**
 * FAIL: record that the delivery attempt failed (row 20). The reason is one of
 * the three agreed for these screens, with a note (required for Other). No
 * redelivery fee is recorded, the job ends, and nothing notifies the driver.
 */
export function FailDialog({ reference, expectedStatus, hold, onClose, onDone, onRefresh }: EndProps) {
  const transition = useTransitionOrder(reference)
  const [form, setForm] = useState<FailForm>({ reason: null, note: '' })
  // Errors show once Fail delivery was pressed, so a half-typed note is not flagged early.
  const [tried, setTried] = useState(false)
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  const set = (patch: Partial<FailForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFailure(null)
  }
  const errors = failErrors(form)
  const shown = tried ? { ...errors, ...failure?.fields } : { ...failure?.fields }

  function send() {
    setTried(true)
    if (Object.keys(errors).length > 0 || !form.reason) return
    const request: AdminTransitionRequest = {
      to: 'failed',
      expected_status: expectedStatus as AdminTransitionRequest['expected_status'],
      reason_code: form.reason,
      note: form.note.trim() || null,
      hold_id: hold?.id ?? null,
    }
    transition.mutate(request, { onSuccess: () => onDone(FAIL_TOAST), onError: (error) => setFailure(decisionFailure(error)) })
  }

  return (
    <ConfirmDialog open title="Fail this delivery" confirmLabel="Fail delivery" cancelLabel="Back" tone="danger" loading={transition.isPending} onCancel={onClose} onConfirm={send}>
      <span className="flex flex-col gap-3">
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 font-bold">Reason</legend>
          {FAIL_REASONS.map((r) => (
            <label key={r.code} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" name="fail-reason" checked={form.reason === r.code} onChange={() => set({ reason: r.code })} className="size-5" />
              {r.label}
            </label>
          ))}
          {shown.reason && <span className="text-caption font-bold text-red">{shown.reason}</span>}
        </fieldset>
        <TextAreaField
          label="Note"
          optional={form.reason !== 'other'}
          rows={2}
          maxLength={NOTE_MAX}
          value={form.note}
          error={shown.note}
          onChange={(e) => set({ note: e.target.value })}
          hint={`${form.note.length} / ${NOTE_MAX}`}
        />
        <span className="text-sub">
          The delivery attempt is recorded as <b>failed</b> and the driver&apos;s job ends. No redelivery fee is recorded. The driver is not notified: their app
          shows the change when it next loads. Rescheduling is not part of this screen.
        </span>
        <HoldLine hold={hold} />
        {failure && !failure.fields.note && !failure.fields.reason && <FailureNotice failure={failure} onRefresh={onRefresh} />}
      </span>
    </ConfirmDialog>
  )
}

/**
 * CANCEL: cancel the order with the one agreed reason, `mmirioma_unable`
 * (row 23). The dialog states the customer's cost as the server's sentence,
 * read first: **Cancel order** stays off until it has loaded, so no cost is
 * ever one the client worked out. It says what happens to the driver only when
 * a driver's job is live, and that no message goes to the customer (the
 * dispatcher tells them, fallback F10). Shared by the hold review sheet (#166)
 * and the order panel's entry (#129).
 */
export function CancelDialog({
  reference,
  expectedStatus,
  hold,
  openHold = hold,
  liveDriver,
  onClose,
  onDone,
  onRefresh,
}: EndProps & {
  liveDriver: boolean
  /**
   * The open hold the cancel will close, for the line "This also closes the
   * <kind> hold." Defaults to `hold`. The order panel's entry passes `hold={null}`
   * (it sends no `hold_id`; the server closes every open hold on cancel) and
   * the order's open hold here, so the dialog still says what happens.
   */
  openHold?: EndProps['hold']
}) {
  const outcome = useCancellationOutcome(reference, true)
  const transition = useTransitionOrder(reference)
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  const noteTooLong = note.trim().length > NOTE_MAX
  const loaded = outcome.isSuccess

  function send() {
    if (!loaded || noteTooLong) return
    const request: AdminTransitionRequest = {
      to: 'cancelled',
      expected_status: expectedStatus as AdminTransitionRequest['expected_status'],
      reason_code: 'mmirioma_unable',
      note: note.trim() || null,
      hold_id: hold?.id ?? null,
    }
    transition.mutate(request, { onSuccess: () => onDone(CANCEL_TOAST), onError: (error) => setFailure(decisionFailure(error)) })
  }

  const lookup = outcome.isError ? outcomeFailure(outcome.error) : null
  return (
    <ConfirmDialog
      open
      title="Cancel this order"
      confirmLabel="Cancel order"
      cancelLabel="Back"
      tone="danger"
      loading={transition.isPending}
      confirmDisabled={!loaded}
      onCancel={onClose}
      onConfirm={send}
    >
      <span className="flex flex-col gap-3">
        <span>
          <b>Reason:</b> MmiriOma is unable to deliver
        </span>
        {outcome.isPending && (
          <span role="status" aria-label="Checking what this costs the customer" className="skeleton block h-12 rounded-card bg-[#F4F8FD]" />
        )}
        {loaded && (
          <Notice tone="info">
            {outcome.data.message}
            {USE_MOCKS && <SampleTag className="ml-2">SAMPLE</SampleTag>}
          </Notice>
        )}
        {lookup && (
          <Notice tone="error">
            <b>{lookup.message}</b>
            {lookup.retry && (
              <>
                <br />
                <Button variant="line" size="sm" block={false} className="mt-1" onClick={() => void outcome.refetch()}>
                  Try again
                </Button>
              </>
            )}
          </Notice>
        )}
        <TextAreaField
          label="Note"
          optional
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          error={failure?.fields.note ?? (noteTooLong ? `Write a note (up to ${NOTE_MAX} characters).` : undefined)}
          onChange={(e) => {
            setNote(e.target.value)
            setFailure(null)
          }}
          hint={`${note.length} / ${NOTE_MAX}`}
        />
        <span className="text-sub">
          {liveDriver ? CANCEL_DRIVER_LIVE : CANCEL_DRIVER_NONE} <b>{CANCEL_CUSTOMER}</b>
        </span>
        <HoldLine hold={openHold} />
        {failure && !failure.fields.note && <FailureNotice failure={failure} onRefresh={onRefresh} />}
      </span>
    </ConfirmDialog>
  )
}
