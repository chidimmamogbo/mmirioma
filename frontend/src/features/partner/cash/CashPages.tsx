/**
 * Driver cash screens (docs/design/driver-cash.md, #20): K1 Record cash, K2
 * My cash and K2 Hand over cash, in both partner apps. Wording, money and
 * errors come from `./logic`.
 */
import { useId, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar, TopBarSpacer, TopBarTitle } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { SectionTitle } from '../../../components/ui/Content'
import { INPUT, TextAreaField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { cx } from '../../../lib/cx'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useHandOverCash, useJob, useMyCash, useRecordCash } from '../queries'
import { AmountBlock, ArrivalToast, CashRow, type ToastState } from './CashParts'
import {
  CASH_NOTE_MAX_LENGTH,
  cashInputToKobo,
  compareCash,
  comparisonMessage,
  dueDateTime,
  formatCash,
  handOverBy,
  handoverProblem,
  recordProblem,
  type RecordProblem,
} from './logic'

function TitleBar({ back, title }: { back: string; title: string }) {
  return <TopBar left={<BackLink to={back} />} center={<TopBarTitle>{title}</TopBarTitle>} right={<TopBarSpacer />} />
}

/* ---------- K1 Record cash ---------- */

export function RecordCash() {
  const { reference = '' } = useParams()
  const navigate = useNavigate()
  const { base } = usePartnerApp()
  const job = useJob(reference)
  const record = useRecordCash(reference)
  const fieldId = useId()
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<RecordProblem | null>(null)
  const done = `${base}/jobs/${reference}/done`
  const j = job.data

  if (j && j.stage !== 'delivered') return <Navigate to={jobStepPath(base, j)} replace />
  // Recorded already when the screen opened: the Done screen shows the record. Not after a
  // send: the refresh lands before the send's own navigation, which carries the toast.
  if (j && j.cash?.collection && record.isIdle) return <Navigate to={done} replace />

  const due = j?.cash?.amount_due_minor_units ?? null
  const amount = cashInputToKobo(text)
  const comparison = amount !== null && due !== null ? compareCash(amount, due) : null
  const needsNote = comparison !== null && comparison !== 'equal'
  const amountError = problem?.fields.amount ?? (tried && amount === null ? 'Enter the cash you received in whole naira.' : undefined)
  const noteError = problem?.fields.note ?? (tried && needsNote && !note.trim() ? 'Tell us what happened.' : undefined)
  const sending = record.isPending
  const request = { amount_minor_units: amount ?? 0, note: needsNote ? note.trim() : null }

  function check() {
    setTried(true)
    setProblem(null)
    if (amount === null || (needsNote && !note.trim())) return
    setConfirming(true)
  }

  function send() {
    setConfirming(false)
    record.mutate(request, {
      onSuccess: () => navigate(done, { replace: true, state: { toast: `Cash recorded for ${reference}.` } satisfies ToastState }),
      onError: (error) => setProblem(recordProblem(error)),
    })
  }

  const closed = problem?.closes ?? false
  return (
    <MobileShell>
      <TitleBar back={done} title="Record cash" />
      <ScrollArea className="gap-3">
        {job.isPending && <LoadingBlock />}
        {job.isError && <ErrorBlock error={job.error} onRetry={() => job.refetch()} />}
        {j && (
          <>
            <div className="rise-1 text-center">
              <div className="font-extrabold">{j.reference}</div>
              {j.customer.contact_name && <div className="text-caption text-mute">{j.customer.contact_name}</div>}
            </div>
            {due !== null && <AmountBlock className="rise-1 text-center" caption="Amount due" amount={due} />}
            {closed && problem ? (
              <>
                <Notice tone="error">
                  <b>{problem.title}</b>
                  <br />
                  {problem.text}
                </Notice>
                <ButtonLink to={problem.title === 'This order is no longer yours' ? base : done} variant="alt">
                  {problem.title === 'This order is no longer yours' ? 'Back to my jobs' : 'Back'}
                </ButtonLink>
              </>
            ) : due === null ? (
              <Notice tone="error">
                <b>Finish unloading first</b>
                <br />
                You can record cash once unloading is complete.
              </Notice>
            ) : (
              <>
                <div className="rise-2">
                  <label htmlFor={fieldId} className="mb-1.5 block text-sub font-bold">
                    Cash received
                  </label>
                  <div className="relative">
                    <span aria-hidden="true" className="absolute top-1/2 left-3.5 -translate-y-1/2 font-extrabold text-slate">
                      ₦
                    </span>
                    <input
                      id={fieldId}
                      inputMode="numeric"
                      autoComplete="off"
                      value={text}
                      disabled={sending}
                      aria-invalid={amountError ? true : undefined}
                      aria-describedby={`${fieldId}-msg`}
                      onChange={(e) => {
                        setText(e.target.value)
                        setProblem(null)
                      }}
                      className={cx(INPUT, 'pl-8 text-[18px] font-extrabold', amountError && 'border-[#DC2626] bg-[#FEF2F2]')}
                    />
                  </div>
                  <div id={`${fieldId}-msg`} className={cx('mt-1 text-caption', amountError ? 'font-bold text-red' : 'text-mute')}>
                    {amountError ?? (amount !== null ? formatCash(amount) : 'Whole naira')}
                  </div>
                </div>
                {comparison && amount !== null && (
                  <ComparisonNotice message={comparisonMessage(comparison, amount, due)} />
                )}
                {needsNote && (
                  <TextAreaField
                    label="What happened? (required)"
                    rows={3}
                    maxLength={CASH_NOTE_MAX_LENGTH}
                    value={note}
                    disabled={sending}
                    error={noteError}
                    hint={`${note.length} / ${CASH_NOTE_MAX_LENGTH}`}
                    onChange={(e) => {
                      setNote(e.target.value)
                      setProblem(null)
                    }}
                  />
                )}
                {problem?.retry && (
                  <Notice tone="error">
                    <b>{problem.title}</b>
                    <br />
                    {problem.text}
                    <br />
                    <Button variant="line" size="sm" block={false} className="mt-1.5" onClick={send}>
                      Try again
                    </Button>
                  </Notice>
                )}
              </>
            )}
          </>
        )}
      </ScrollArea>
      {j && due !== null && !closed && (
        <Footer>
          <Button loading={sending} onClick={check}>
            Record cash
          </Button>
        </Footer>
      )}
      <ConfirmDialog
        open={confirming}
        title="Record cash"
        confirmLabel="Record cash"
        cancelLabel="Go back"
        tone="primary"
        onCancel={() => setConfirming(false)}
        onConfirm={send}
      >
        You received {formatCash(request.amount_minor_units)} in cash for {reference}. You can&apos;t change this after you record it.
      </ConfirmDialog>
    </MobileShell>
  )
}

function ComparisonNotice({ message }: { message: ReturnType<typeof comparisonMessage> }) {
  return (
    <Notice tone={message.tone}>
      <b>{message.title}</b>
      {message.text && (
        <>
          <br />
          {message.text}
        </>
      )}
    </Notice>
  )
}

/* ---------- K2 My cash ---------- */

export function MyCash() {
  const { base, vehicle } = usePartnerApp()
  const cash = useMyCash()
  const c = cash.data
  const onHand = c?.collections.filter((r) => r.status === 'collected' || r.status === 'awaiting_remittance') ?? []
  const handedOver = c?.collections.filter((r) => r.status === 'remitted' || r.status === 'reconciled') ?? []
  const canHandOver = onHand.some((r) => r.status === 'collected')

  return (
    <MobileShell>
      <TitleBar back={`${base}/menu`} title="My cash" />
      <ScrollArea className="gap-3">
        <ArrivalToast />
        {cash.isPending && <LoadingBlock label="Loading your cash" />}
        {cash.isError && <ErrorBlock error={cash.error} onRetry={() => cash.refetch()} />}
        {c && (
          <>
            {c.overdue && c.remittance_due_at && (
              <Notice tone="error">
                <b>Overdue</b>
                <br />
                This cash was due at the office by {dueDateTime(c.remittance_due_at)}. Hand it over as soon as you can.
              </Notice>
            )}
            {c.on_hand_minor_units > 0 ? (
              <Card pad className="rise-1 flex flex-col gap-3">
                <AmountBlock caption="To hand over" amount={c.on_hand_minor_units} line={c.remittance_due_at ? handOverBy(c.remittance_due_at) : undefined} />
                {canHandOver && <ButtonLink to={`${base}/cash/handover`}>Hand over cash</ButtonLink>}
              </Card>
            ) : (
              <EmptyBlock illustration={vehicle} title="No cash to hand over" text="Cash you record after a delivery shows here." />
            )}
            {onHand.length > 0 && (
              <section aria-label="To hand over">
                <SectionTitle>To hand over</SectionTitle>
                <Card className="divide-y divide-hairline px-3.5">
                  {onHand.map((row) => (
                    <CashRow key={row.id} row={row} vehicle={vehicle} />
                  ))}
                </Card>
              </section>
            )}
            {handedOver.length > 0 && (
              <section aria-label="Handed over (last 7 days)">
                <SectionTitle>Handed over (last 7 days)</SectionTitle>
                <Card className="divide-y divide-hairline px-3.5">
                  {handedOver.map((row) => (
                    <CashRow key={row.id} row={row} vehicle={vehicle} />
                  ))}
                </Card>
              </section>
            )}
          </>
        )}
      </ScrollArea>
    </MobileShell>
  )
}

/* ---------- K2 Hand over cash ---------- */

export function HandOverCash() {
  const navigate = useNavigate()
  const { base, vehicle } = usePartnerApp()
  const cash = useMyCash()
  const handOver = useHandOverCash()
  // Ticks are kept as the records un-ticked, so every record (also after a reload) starts ticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [problem, setProblem] = useState<ReturnType<typeof handoverProblem> | null>(null)
  const rows = cash.data?.collections.filter((r) => r.status === 'collected') ?? []
  const chosen = rows.filter((r) => !unticked.has(r.id))
  const total = chosen.reduce((sum, r) => sum + r.amount_minor_units, 0)

  function toggle(id: string) {
    setProblem(null)
    setUnticked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function send() {
    setProblem(null)
    handOver.mutate(
      chosen.map((r) => r.id),
      {
        onSuccess: () => navigate(`${base}/cash`, { replace: true, state: { toast: 'Marked ready to hand over.' } satisfies ToastState }),
        onError: (error) => setProblem(handoverProblem(error)),
      },
    )
  }

  return (
    <MobileShell>
      <TitleBar back={`${base}/cash`} title="Hand over cash" />
      <ScrollArea className="gap-3">
        {cash.isPending && <LoadingBlock label="Loading your cash" />}
        {cash.isError && <ErrorBlock error={cash.error} onRetry={() => cash.refetch()} />}
        {/* Nothing left to hand over when the screen opened. Not after a send: its own navigation carries the toast. */}
        {cash.isSuccess && rows.length === 0 && handOver.isIdle && <Navigate to={`${base}/cash`} replace />}
        {problem && (
          <Notice tone="error">
            <b>{problem.title}</b>
            <br />
            {problem.text}
          </Notice>
        )}
        {rows.length > 0 && (
          <>
            <Card className="divide-y divide-hairline px-3.5">
              {rows.map((row) => {
                const id = `tick-${row.id}`
                return (
                  <label key={row.id} htmlFor={id} className="block cursor-pointer">
                    <CashRow
                      row={row}
                      vehicle={vehicle}
                      check={
                        <input
                          id={id}
                          type="checkbox"
                          className="size-5 shrink-0"
                          checked={!unticked.has(row.id)}
                          disabled={handOver.isPending}
                          onChange={() => toggle(row.id)}
                          aria-label={`Hand over ${formatCash(row.amount_minor_units)} for ${row.order_reference}`}
                        />
                      }
                    />
                  </label>
                )
              })}
            </Card>
            <AmountBlock caption="Total to hand over" amount={total} />
            <Notice tone="note">
              <b>Still your responsibility</b>
              <br />
              The cash stays with you until an administrator confirms receiving it.
            </Notice>
          </>
        )}
      </ScrollArea>
      {rows.length > 0 && (
        <Footer>
          <Button loading={handOver.isPending} disabled={chosen.length === 0} onClick={send}>
            Ready to hand over
          </Button>
        </Footer>
      )}
    </MobileShell>
  )
}
