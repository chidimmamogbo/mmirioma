import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { OtherReports, ReportEvidenceView } from './Evidence'
import { FailureNotice, HoldFrame } from './HoldFrame'
import { RESUME_TOAST, WITHDRAW_TOAST, decisionFailure, type DecisionFailure } from './logic'
import { NoteDialog } from './NoteDialog'
import { useResumeUnsafe, useWithdrawJob } from './queries'
import type { ReviewProps } from './types'

/**
 * R3: unsafe stop. The driver's report, then Resume (the note is the safe
 * alternative) and, only while the driver has not left (`withdraw_allowed`),
 * Withdraw job, which also closes the stop.
 */
export function UnsafeReview({ reference, customer, hold, onClose, onDecided, onRefresh }: ReviewProps) {
  const report = hold.report!
  const resume = useResumeUnsafe(reference)
  const withdraw = useWithdrawJob(reference)
  const [dialog, setDialog] = useState<'resume' | 'withdraw' | null>(null)
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  const busy = resume.isPending || withdraw.isPending

  /** A note the server refused stays in its dialog under the field; anything else is shown in the sheet. */
  const failed = (error: unknown) => {
    const f = decisionFailure(error)
    setFailure(f)
    if (!f.fields.note) setDialog(null)
  }

  return (
    <HoldFrame
      reference={reference}
      customer={customer}
      hold={hold}
      locked={busy || dialog !== null}
      onClose={onClose}
      footer={
        <>
          {hold.withdraw_allowed && (
            <Button variant="line" size="sm" block={false} onClick={() => setDialog('withdraw')}>
              Withdraw job
            </Button>
          )}
          <Button size="sm" block={false} onClick={() => setDialog('resume')}>
            Resume delivery
          </Button>
        </>
      }
    >
      <ReportEvidenceView report={report} />
      <OtherReports incidents={hold.incidents} />
      {failure && <FailureNotice failure={failure} onRefresh={onRefresh} />}

      <NoteDialog
        open={dialog === 'resume'}
        title="Resume the delivery?"
        noteLabel="Safe alternative"
        noteHint="Say how the driver can continue safely."
        required
        confirmLabel="Resume delivery"
        tone="primary"
        loading={resume.isPending}
        serverError={failure?.fields.note}
        onSend={(note) => resume.mutate({ hold_id: hold.id, note }, { onSuccess: () => onDecided(RESUME_TOAST), onError: failed })}
        onCancel={() => setDialog(null)}
      >
        The job continues from where it stopped.
      </NoteDialog>

      <NoteDialog
        open={dialog === 'withdraw'}
        title="Withdraw job?"
        noteLabel="Note"
        required={false}
        confirmLabel="Withdraw job"
        tone="danger"
        loading={withdraw.isPending}
        serverError={failure?.fields.note}
        onSend={(note) => withdraw.mutate({ expected_status: 'accepted', note: note || null }, { onSuccess: () => onDecided(WITHDRAW_TOAST), onError: failed })}
        onCancel={() => setDialog(null)}
      >
        Take the job back from <b>{hold.driver.name}</b>? The order goes back to <b>Confirmed</b> and the job leaves the driver&apos;s list. This also closes the unsafe
        stop. Nothing notifies the driver.
      </NoteDialog>
    </HoldFrame>
  )
}
