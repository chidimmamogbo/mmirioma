import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { KeyValue } from '../../../components/ui/Content'
import { TextAreaField, TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { HOLD_KIND_LABEL } from '../../../domain/admin'
import type { HoldReview, ProofEvidence } from '../../../lib/api/adminHolds'
import { ApiError } from '../../../lib/api/client'
import { AGREEMENT_METHODS, type AgreementMethod } from '../../../lib/api/confirmationTypes'
import { formatTime } from '../../../lib/format/datetime'
import { formatPhone } from '../../../lib/format/phone'
import { timeAgo } from '../adminFormat'
import { SideSheet } from '../confirm/SideSheet'
import { adminKeys } from '../queries'
import {
  CONFIRM_METHOD_LABEL,
  INCIDENT_LABEL,
  NOTE_MAX,
  PROOF_REASON_LABEL,
  PROOF_TOAST,
  STAFF_STATUS_LABEL,
  buildProofRequest,
  decisionFailure,
  deliveryCodeLine,
  initialProofForm,
  proofErrors,
  type DecisionFailure,
  type ProofForm,
} from './logic'
import { useDecideProof, useHoldReview } from './queries'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-label font-extrabold tracking-[0.3px] text-mute uppercase">{title}</h3>
      {children}
    </section>
  )
}

/** The driver's own words, quoted. */
function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="m-0 border-0 border-l-[3px] border-solid border-line py-0.5 pl-3 text-slate italic">{children}</blockquote>
}

/** R1: the alternative proof the driver sent. The delivery code itself is never shown, and a shared location is text only (design decision 4). */
function ProofEvidenceView({ proof }: { proof: ProofEvidence }) {
  const attempts = proof.contact_attempts
  return (
    <Section title="Alternative proof">
      <Card className="flex flex-col p-3 text-[13.5px]">
        <KeyValue label="Delivered" value={`${proof.delivered_litres.toLocaleString('en-NG')} L`} />
        <KeyValue label="Why there is no code" value={proof.reason ? PROOF_REASON_LABEL[proof.reason] : 'Not recorded'} />
        <KeyValue label="Arrived" value={proof.arrived_at ? formatTime(proof.arrived_at) : 'Not recorded'} />
        <KeyValue label="Unloading completed" value={proof.unloading_completed_at ? formatTime(proof.unloading_completed_at) : 'Not recorded'} />
        <KeyValue label="Proof sent" value={formatTime(proof.sent_at)} />
        <KeyValue label="Delivery code" value={<span className="font-semibold">{deliveryCodeLine(proof.delivery_code)}</span>} />
        <KeyValue label="Contact attempts" value={attempts.length === 0 ? 'No contact attempts recorded' : attempts.map((a) => formatTime(a.attempted_at)).join(', ')} />
        <KeyValue
          label="Location"
          value={
            proof.location
              ? `${proof.location.latitude}, ${proof.location.longitude}${proof.location.accuracy_metres === null ? '' : ` (±${proof.location.accuracy_metres} m)`}`
              : 'No location shared'
          }
        />
      </Card>
      {proof.delivery_code && <p className="m-0 text-caption text-mute">The code itself is never shown.</p>}
      {proof.driver_note && (
        <div>
          <div className="mb-1 font-bold">Driver&apos;s note</div>
          <Quote>{proof.driver_note}</Quote>
        </div>
      )}
    </Section>
  )
}

/** "Other reports from the driver": the job's other incidents, oldest first. */
function OtherReports({ incidents }: { incidents: HoldReview['incidents'] }) {
  return (
    <Section title="Other reports from the driver">
      {incidents.length === 0 ? (
        <p className="m-0 text-mute">No other reports.</p>
      ) : (
        <Card className="flex flex-col p-3 text-[13.5px]">
          {incidents.map((i) => (
            <KeyValue key={`${i.kind}-${i.reported_at}`} label={`${INCIDENT_LABEL[i.kind] ?? 'Report'} · ${formatTime(i.reported_at)}`} value={i.note ? `"${i.note}"` : 'No note'} />
          ))}
        </Card>
      )}
    </Section>
  )
}

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

/**
 * The review sheet for a held order (admin-hold-review.md): the evidence for
 * the hold, then the decision. This part handles proof review (R1); the other
 * kinds follow. `onDecided` tells the page what happened, for its toast.
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
  const decide = useDecideProof(reference)
  const qc = useQueryClient()
  const hold = review.data
  const [form, setForm] = useState<ProofForm>(() => initialProofForm())
  // Errors show once Send was pressed, so a half-typed note is not flagged early.
  const [tried, setTried] = useState(false)
  const [asking, setAsking] = useState(false)
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  const set = (patch: Partial<ProofForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFailure(null)
  }

  /** Refresh the orders and close: the hold was decided meanwhile, or the order moved on. */
  function refresh() {
    void qc.invalidateQueries({ queryKey: adminKeys.all })
    onClose()
  }

  const proof = hold?.proof ?? null
  const errors = proof ? proofErrors(form, proof) : {}
  const shown = tried ? { ...errors, ...failure?.fields } : { ...failure?.fields }

  function ask() {
    setTried(true)
    if (Object.keys(errors).length > 0) return
    setAsking(true)
  }

  function send() {
    if (!hold) return
    setAsking(false)
    decide.mutate(buildProofRequest(form, hold.id), {
      onSuccess: () => onDecided(PROOF_TOAST[form.choice]),
      onError: (error) => setFailure(decisionFailure(error)),
    })
  }

  const noHold = review.error instanceof ApiError && review.error.code === 'hold_not_found'
  const approve = form.choice === 'approve'
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
      locked={decide.isPending || asking}
      onClose={onClose}
      footer={
        <>
          <Button variant="line" size="sm" block={false} disabled={decide.isPending} onClick={onClose}>
            Close
          </Button>
          {proof && hold && (
            <Button variant={approve ? 'primary' : 'danger'} size="sm" block={false} loading={decide.isPending} onClick={ask}>
              {approve ? 'Approve proof' : 'Reject proof'}
            </Button>
          )}
        </>
      }
    >
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

      {hold && (
        <>
          {proof && <ProofEvidenceView proof={proof} />}
          <OtherReports incidents={hold.incidents} />

          {proof && (
            <>
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
              {!approve && (
                <Notice tone="info">If rejected, the order stays Unloading and the driver can send the customer a new code and submit proof again.</Notice>
              )}
            </>
          )}

          {failure && (
            <Notice tone="error">
              <b>{failure.message}</b>
              {failure.changed && (
                <>
                  <br />
                  <button type="button" onClick={refresh} className="mt-1 cursor-pointer border-0 bg-transparent p-0 font-bold text-red underline">
                    Refresh
                  </button>
                </>
              )}
            </Notice>
          )}
        </>
      )}

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
              The order becomes <b>Delivered</b> with {proof?.delivered_litres.toLocaleString('en-NG')} L. Payment is not changed by this decision.
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
    </SideSheet>
  )
}
