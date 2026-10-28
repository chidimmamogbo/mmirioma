import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { EligibilityCard, OtherReports, PickupEvidenceView } from './Evidence'
import { FailureNotice, HoldFrame } from './HoldFrame'
import { CONTINUE_OFF, CONTINUE_TOAST, decisionFailure, type DecisionFailure } from './logic'
import { NoteDialog } from './NoteDialog'
import { useContinueSource } from './queries'
import type { ReviewProps } from './types'

/**
 * R2: source review. The pickup, the server's answer on the source (its
 * sentence word for word), then Continue, which is on only when the source
 * can be used. The server checks again at the request, so a refusal updates
 * the card with its new answer.
 */
export function SourceReview({ reference, customer, hold, onClose, onDecided, onRefresh }: ReviewProps) {
  const pickup = hold.pickup!
  const decide = useContinueSource(reference)
  const [asking, setAsking] = useState(false)
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  // The answer on the card: the evidence's, until a refusal at the request brings a new one.
  const [refusal, setRefusal] = useState<{ answer: 'not_eligible' | 'cannot_check'; message: string } | null>(null)
  const answer = refusal ?? hold.source_eligibility ?? { answer: 'cannot_check' as const, message: 'The server did not say whether this source can be used.' }
  const canContinue = answer.answer === 'eligible'

  function send(note: string) {
    decide.mutate(
      { hold_id: hold.id, note },
      {
        onSuccess: () => onDecided(CONTINUE_TOAST),
        onError: (error) => {
          const f = decisionFailure(error)
          setFailure(f)
          if (f.eligibility) setRefusal({ answer: f.eligibility, message: f.message })
          // A note the server refused stays in the dialog under its field; anything else is shown in the sheet.
          if (!f.fields.note) setAsking(false)
        },
      },
    )
  }

  return (
    <HoldFrame
      reference={reference}
      customer={customer}
      hold={hold}
      locked={decide.isPending || asking}
      onClose={onClose}
      footer={
        <Button size="sm" block={false} disabled={!canContinue} onClick={() => setAsking(true)}>
          Continue delivery
        </Button>
      }
    >
      <PickupEvidenceView pickup={pickup} />
      <EligibilityCard answer={answer.answer} message={answer.message} />
      {!canContinue && <p className="m-0 -mt-2 text-caption text-mute">{CONTINUE_OFF}</p>}
      <OtherReports incidents={hold.incidents} />

      {failure && <FailureNotice failure={failure} onRefresh={onRefresh} />}

      <NoteDialog
        open={asking}
        title="Continue the delivery?"
        noteLabel="Why is it fine to continue?"
        required
        confirmLabel="Continue delivery"
        tone="primary"
        loading={decide.isPending}
        serverError={failure?.fields.note}
        onSend={send}
        onCancel={() => setAsking(false)}
      >
        The driver can continue to the customer.
      </NoteDialog>
    </HoldFrame>
  )
}
