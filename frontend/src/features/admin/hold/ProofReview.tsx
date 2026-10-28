import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TextAreaField, TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { AGREEMENT_METHODS, type AgreementMethod } from '../../../lib/api/confirmationTypes'
import { formatTime } from '../../../lib/format/datetime'
import { OtherReports, ProofEvidenceView, Section } from './Evidence'
import { FailureNotice, HoldFrame } from './HoldFrame'
import {
  CONFIRM_METHOD_LABEL,
  NOTE_MAX,
  PROOF_TOAST,
  buildProofRequest,
  decisionFailure,
  initialProofForm,
  proofErrors,
  type DecisionFailure,
  type ProofForm,
} from './logic'
import { useDecideProof } from './queries'
import type { ReviewProps } from './types'

/** Radio rows for how the customer confirmed (the contract's three methods). */
function MethodRadios({ value, onChange }: { value: AgreementMethod; onChange: (method: AgreementMethod) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 font-bold">How did the customer confirm?</legend>
      {AGREEMENT_METHODS.map((m) => (
        <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="radio" name="confirm-method" checked={value === m} onChange={() => onChange(m)} className="size-5" />
          {CONFIRM_METHOD_LABEL[m]}
        </label>
      ))}
    </fieldset>
  )
}

/** R1: proof review. The evidence, then Approve (how and when the customer confirmed, details, a note) or Reject (a note). */
export function ProofReview({ reference, customer, hold, onClose, onDecided, onRefresh }: ReviewProps) {
  const decide = useDecideProof(reference)
  const proof = hold.proof!
  const [form, setForm] = useState<ProofForm>(() => initialProofForm())
  // Errors show once Send was pressed, so a half-typed note is not flagged early.
  const [tried, setTried] = useState(false)
  const [asking, setAsking] = useState(false)
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  const set = (patch: Partial<ProofForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFailure(null)
  }
  const errors = proofErrors(form, proof)
  const shown = tried ? { ...errors, ...failure?.fields } : { ...failure?.fields }
  const approve = form.choice === 'approve'

  function ask() {
    setTried(true)
    if (Object.keys(errors).length > 0) return
    setAsking(true)
  }

  function send() {
    setAsking(false)
    decide.mutate(buildProofRequest(form, hold.id), {
      onSuccess: () => onDecided(PROOF_TOAST[form.choice]),
      onError: (error) => setFailure(decisionFailure(error)),
    })
  }

  return (
    <HoldFrame
      reference={reference}
      customer={customer}
      hold={hold}
      locked={decide.isPending || asking}
      onClose={onClose}
      footer={
        <Button variant={approve ? 'primary' : 'danger'} size="sm" block={false} loading={decide.isPending} onClick={ask}>
          {approve ? 'Approve proof' : 'Reject proof'}
        </Button>
      }
    >
      <ProofEvidenceView proof={proof} />
      <OtherReports incidents={hold.incidents} />

      <Section title="Your decision">
        <div className="flex gap-2.5" role="radiogroup" aria-label="Your decision">
          <label className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-option border border-solid px-3 ${approve ? 'border-primary bg-sky' : 'border-input-line bg-white'}`}>
            <input type="radio" name="proof-choice" checked={approve} onChange={() => set({ choice: 'approve' })} className="size-5" />
            Approve this proof
          </label>
          <label className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-option border border-solid px-3 ${!approve ? 'border-primary bg-sky' : 'border-input-line bg-white'}`}>
            <input type="radio" name="proof-choice" checked={!approve} onChange={() => set({ choice: 'reject' })} className="size-5" />
            Reject this proof
          </label>
        </div>
      </Section>

      {approve && (
        <>
          <MethodRadios value={form.method} onChange={(method) => set({ method })} />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <TextField label="When did the customer confirm? (date)" type="date" value={form.date} error={shown.when} onChange={(e) => set({ date: e.target.value })} />
            <TextField label="When (time)" type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} />
          </div>
          <p className="m-0 -mt-1 text-caption text-mute">
            Not in the future, and not before unloading was completed{proof.unloading_completed_at ? ` (${formatTime(proof.unloading_completed_at)})` : ''}.
          </p>
          <TextAreaField
            label="Details"
            optional={form.method !== 'other'}
            rows={2}
            maxLength={NOTE_MAX}
            value={form.details}
            error={shown.details}
            onChange={(e) => set({ details: e.target.value })}
            hint={`${form.details.length} / ${NOTE_MAX}`}
          />
        </>
      )}

      <TextAreaField
        label="Your note"
        rows={2}
        maxLength={NOTE_MAX}
        value={form.note}
        error={shown.note}
        onChange={(e) => set({ note: e.target.value })}
        hint={`${approve ? 'What did you check?' : 'Why is this proof not accepted?'} · ${form.note.length} / ${NOTE_MAX}`}
      />
      {!approve && <Notice tone="info">If rejected, the order stays Unloading and the driver can send the customer a new code and submit proof again.</Notice>}

      {failure && <FailureNotice failure={failure} onRefresh={onRefresh} />}

      <ConfirmDialog
        open={asking}
        title={approve ? 'Approve this proof?' : 'Reject this proof?'}
        confirmLabel={approve ? 'Approve proof' : 'Reject proof'}
        cancelLabel="Back"
        tone={approve ? 'primary' : 'danger'}
        loading={decide.isPending}
        onCancel={() => setAsking(false)}
        onConfirm={send}
      >
        {approve ? (
          <span className="flex flex-col gap-2">
            <span>
              The order becomes <b>Delivered</b> with {proof.delivered_litres.toLocaleString('en-NG')} L. Payment is not changed by this decision.
            </span>
            <span className="flex flex-col gap-1 rounded-option bg-canvas px-3.5 py-3 text-sub">
              <span>How: {CONFIRM_METHOD_LABEL[form.method]}</span>
              <span>Your note: {form.note.trim()}</span>
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-2">
            <span>
              This proof no longer counts and the order stays <b>Unloading</b>. The driver can send the customer a new code and submit proof again. If the
              customer still cannot confirm, fail the delivery (Other, with a note).
            </span>
            <span className="rounded-option bg-canvas px-3.5 py-3 text-sub">Your note: {form.note.trim()}</span>
          </span>
        )}
      </ConfirmDialog>
    </HoldFrame>
  )
}
