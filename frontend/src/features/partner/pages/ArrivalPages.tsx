/**
 * The steps from arriving at the customer to a failed delivery when nobody
 * answers (docs/design/driver-arrival-unreachable.md, #250, FR-038): the
 * arrived screen (U2), the contact attempts and the wait with the confirm sheet
 * (U3), and the failed outcome (U4). The "I have arrived" button (U1) is the
 * customer step's own. Shared by the Keke rider and tanker driver apps.
 *
 * The server decides every rule. The end button follows `can_fail_unreachable`
 * (two attempts and the full wait), never the phone's clock (decision 6); the
 * clock only refreshes the job when the wait is over.
 */
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckIcon, PhoneIcon } from '../../../components/icons/icons'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { IconBadge, KeyValue, ScreenHeading } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import type { PartnerJob } from '../../../domain/partner'
import { ApiError } from '../../../lib/api/client'
import { formatTime } from '../../../lib/format/datetime'
import { useSecondsUntil } from '../../../lib/useNow'
import { AttemptList } from '../components/AttemptList'
import { REQUIRED_ATTEMPTS } from '../attempts'
import { JobStep } from '../components/JobStep'
import { StepError } from '../components/StepError'
import { stepErrorKind } from '../stepErrorKind'
import { useOnline } from '../components/useOnline'
import { END_REASON_LABEL, jobEndedAt, jobQuantity, relativeWhen } from '../jobHelpers'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useFailUnreachable, useJob, useRecordContactAttempt, useStartUnloading } from '../queries'

/** U2: the arrival is recorded; start unloading, or report that the customer cannot be reached. */
export function ArrivedStep() {
  return <JobStep stage="collected" step="arrived">{(j) => <ArrivedScreen job={j} />}</JobStep>
}

function ArrivedScreen({ job: j }: { job: PartnerJob }) {
  const { base } = usePartnerApp()
  const navigate = useNavigate()
  const start = useStartUnloading(j.reference)
  const send = () => start.mutate(undefined, { onSuccess: () => navigate(`${base}/jobs/${j.reference}/code`) })
  return (
    <MobileShell>
      <TopBar left={<BackLink to={base} />} right={<Chip tone="green">Arrival recorded</Chip>} />
      <ScrollArea className="gap-3">
        <ScreenHeading className="rise-1" title="You have arrived" sub={j.arrived_at ? `Arrived at ${formatTime(j.arrived_at)}` : undefined} />
        <Card pad className="rise-2 flex items-center gap-3">
          <IconBadge tone="green">
            <CheckIcon size={22} strokeWidth={2.6} roundJoin={false} />
          </IconBadge>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold">{j.customer.contact_name ?? j.customer.area}</div>
            <div className="text-caption text-mute">
              {j.reference} · {jobQuantity(j, 'short')}
            </div>
          </div>
        </Card>
      </ScrollArea>
      <Footer>
        {start.isError && (
          <StepError error={start.error} notSent="Not sent. Check your connection and try again. Nothing changed." onRetry={send} base={base} />
        )}
        <Button loading={start.isPending} onClick={send}>
          Start unloading
        </Button>
        <ButtonLink to={`${base}/jobs/${j.reference}/unreachable`} variant="line-danger">
          Customer not reachable
        </ButtonLink>
      </Footer>
    </MobileShell>
  )
}

/** U3: record the attempts to reach the customer, wait, then fail the job. */
export function UnreachableStep() {
  return <JobStep stage="collected" step="arrived">{(j) => <UnreachableScreen job={j} />}</JobStep>
}

/** What the server said was missing when it refused to end the job (`details.missing`). */
function missingOf(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== 'transition_requirements_unmet') return []
  const missing = (error.details as { missing?: unknown } | null)?.missing
  return Array.isArray(missing) ? missing.filter((m): m is string => typeof m === 'string') : []
}

function UnreachableScreen({ job: j }: { job: PartnerJob }) {
  const { base } = usePartnerApp()
  const navigate = useNavigate()
  const job = useJob(j.reference)
  const online = useOnline()
  const attempt = useRecordContactAttempt(j.reference)
  const fail = useFailUnreachable(j.reference)
  const [confirming, setConfirming] = useState(false)

  const attempts = j.contact_attempts ?? []
  const allowedAt = j.unreachable_allowed_at ?? null
  const untilMs = allowedAt ? Date.parse(allowedAt) : 0
  const secondsLeft = useSecondsUntil(untilMs)
  const waitOver = secondsLeft <= 0

  // Fetch the job again when the wait ends: the end button follows the server's `allowed_actions`, which only
  // changes then. Cleans up on leaving the screen or when the time changes.
  const refetch = job.refetch
  useEffect(() => {
    if (!untilMs || untilMs <= Date.now()) return
    const id = window.setTimeout(() => void refetch(), untilMs - Date.now() + 500)
    return () => window.clearTimeout(id)
  }, [untilMs, refetch])

  const needed = Math.max(0, REQUIRED_ATTEMPTS - attempts.length)
  const canEnd = j.can_fail_unreachable === true
  const until = allowedAt ? formatTime(allowedAt) : null
  const helper =
    needed > 0
      ? `Record two attempts first. ${needed} more needed.`
      : !canEnd && until
        ? `You can end this job from ${until}.`
        : null

  // A refused end means this screen was stale: close the sheet and say what was missing (the job is refreshed).
  const missing = missingOf(fail.error)
  const refused = missing.length > 0 ? (missing.includes('contact_attempts_recorded') ? 'Record two attempts first.' : `You can end this job from ${until ?? 'the wait-until time'}.`) : null

  function confirmFail() {
    fail.mutate(undefined, {
      onSuccess: () => navigate(`${base}/jobs/${j.reference}/failed`, { replace: true }),
      onError: (error) => {
        if (stepErrorKind(error) !== 'not_sent') setConfirming(false)
      },
    })
  }

  return (
    <MobileShell>
      <TopBar left={<BackLink to={`${base}/jobs/${j.reference}/arrived`} />} right={<Chip tone="amber">{waitOver ? 'Wait over' : `in ${Math.ceil(secondsLeft / 60)} min`}</Chip>} />
      <ScrollArea className="gap-3">
        <ScreenHeading
          className="rise-1"
          title="Customer not reachable"
          sub={until ? `Try to reach the customer twice, then wait until ${until}. After that you can end this delivery.` : undefined}
        />
        <Card pad className="rise-2">
          {j.arrived_at && <KeyValue label="Arrived at" value={formatTime(j.arrived_at)} />}
          {until && <KeyValue label="Wait until" value={until} />}
        </Card>
        <div className="rise-3 flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-extrabold">Attempts</h2>
          {j.customer.phone && (
            <a href={`tel:${j.customer.phone}`} className="flex items-center gap-1.5 text-sub font-bold text-primary no-underline">
              <PhoneIcon size={16} strokeWidth={2.2} />
              Call customer
            </a>
          )}
        </div>
        <AttemptList className="rise-3" attempts={attempts} />
        {!online && <Notice tone="note">You are offline. Connect to record an attempt.</Notice>}
        {attempt.isError && <StepError error={attempt.error} notSent="We could not record this attempt. Try again." base={base} />}
        <Button variant="alt" className="rise-4 h-[46px]" disabled={!online} loading={attempt.isPending} onClick={() => attempt.mutate()}>
          {attempt.isPending ? 'Recording…' : 'I tried to reach the customer'}
        </Button>
        {refused && (
          <Notice tone="error">
            {refused} The screen is refreshed.
          </Notice>
        )}
        {fail.isError && missing.length === 0 && stepErrorKind(fail.error) !== 'not_sent' && <StepError error={fail.error} notSent="" base={base} />}
      </ScrollArea>
      <Footer>
        {helper && <p className="m-0 text-center text-sub text-mute">{helper}</p>}
        <Button variant="danger" disabled={!canEnd || !online} onClick={() => setConfirming(true)}>
          Customer not reachable, fail the job
        </Button>
      </Footer>
      <ConfirmDialog
        open={confirming}
        title="End this delivery?"
        confirmLabel="Fail the delivery"
        cancelLabel="Back"
        loading={fail.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirmFail}
      >
        This records that the customer could not be reached after two attempts. You cannot undo it.
        {fail.isError && stepErrorKind(fail.error) === 'not_sent' && <b className="mt-2 block text-red">Not sent. Check your connection and try again.</b>}
      </ConfirmDialog>
    </MobileShell>
  )
}

/** U4: the delivery failed. The fixed reason and the server's time; nothing about money or the water on board. */
export function JobFailed() {
  const { reference = '' } = useParams()
  const { base } = usePartnerApp()
  const job = useJob(reference)
  const j = job.data
  if (j && j.stage !== 'failed') return <Navigate to={jobStepPath(base, j)} replace />
  const reason = j?.end_reason ? END_REASON_LABEL[j.end_reason] : undefined
  const endedAt = j ? jobEndedAt(j) : null
  return (
    <MobileShell>
      <ScrollArea className="items-center gap-3 pt-[30px] text-center">
        {job.isPending && <LoadingBlock />}
        {job.isError && <ErrorBlock error={job.error} onRetry={() => job.refetch()} />}
        {j && (
          <>
            <h1 className="rise-1 m-0 text-[26px] font-extrabold tracking-[-0.5px] text-red">Delivery failed</h1>
            <p className="rise-2 m-0 text-sub text-mute">The dispatcher will contact you.</p>
            <Card pad className="rise-3 box-border w-full text-left">
              <KeyValue label="Order" value={j.reference} />
              {reason && <KeyValue label="Reason" value={reason} />}
              {endedAt && <KeyValue label="Recorded at" value={relativeWhen(endedAt)} />}
            </Card>
            <div className="rise-4 flex w-full flex-col gap-2">
              <ButtonLink to={base}>Back to dashboard</ButtonLink>
            </div>
          </>
        )}
      </ScrollArea>
    </MobileShell>
  )
}

