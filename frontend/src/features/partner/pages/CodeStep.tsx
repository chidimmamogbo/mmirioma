import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertCircleTallIcon, TimerIcon } from '../../../components/icons/icons'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { CodeBoxes, Keypad } from '../../../components/ui/CodeEntry'
import { IconBadge, ScreenHeading } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import type { PartnerJob } from '../../../domain/partner'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { USE_MOCKS } from '../../../lib/api/mode'
import { formatNaira } from '../../../lib/format/money'
import { phoneEnding } from '../../../lib/format/phone'
import { mmss, useSecondsUntil } from '../../../lib/useNow'
import { JobMiniCard } from '../components/JobParts'
import { contactSuffix, jobDeliveryType, jobQuantity } from '../jobHelpers'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useCompleteUnloading, useJob, useResendCode, useVerifyCode } from '../queries'

/**
 * Enter the customer's delivery code (`r-otp`, `t-otp`), including the wrong
 * code state (`r-otp-error`). Delivery completes only with the code (FR-035).
 */
export function CodeStep() {
  const { reference = '' } = useParams()
  const { base } = usePartnerApp()
  const job = useJob(reference)
  if (job.isPending || job.isError)
    return (
      <MobileShell>
        <TopBar left={<BackLink to={base} />} />
        <ScrollArea>{job.isPending ? <LoadingBlock /> : <ErrorBlock error={job.error} onRetry={() => job.refetch()} />}</ScrollArea>
      </MobileShell>
    )
  if (job.data.stage !== 'collected') return <Navigate to={jobStepPath(base, job.data)} replace />
  return <CodeEntryScreen job={job.data} />
}

function CodeEntryScreen({ job: j }: { job: PartnerJob }) {
  const navigate = useNavigate()
  const { base, vehicle } = usePartnerApp()
  const verify = useVerifyCode(j.reference)
  const resend = useResendCode(j.reference)
  const unloaded = useCompleteUnloading(j.reference)
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState<string | null>(null)

  const resendAt = j.code_resend_at ? Date.parse(j.code_resend_at) : 0
  const wait = useSecondsUntil(resendAt)
  // No tries count yet means no code was issued yet: wait for it, never "locked" (@chidimmamogbo on #12).
  const waiting = j.code_tries_left === null
  const locked = (j.code_tries_left !== null && j.code_tries_left <= 0) || (verify.error instanceof ApiError && verify.error.code === 'code_locked')
  const firstName = j.customer.contact_name?.split(' ')[0] ?? 'the customer'
  const keke = jobDeliveryType(j, vehicle) === 'keke'
  const tankType = j.choice?.delivery_type === 'tanker' ? j.choice.tank_type : null
  const issueLink = `${base}/issue?ref=${j.reference}&type=code_not_working`

  function submit() {
    verify.mutate(code, {
      onSuccess: () => navigate(`${base}/jobs/${j.reference}/done`, { replace: true }),
      onError: () => {
        setWrong(code)
      },
    })
  }

  function tryAgain() {
    setWrong(null)
    setCode('')
    verify.reset()
  }

  const showError = wrong !== null || locked
  return (
    <MobileShell>
      <TopBar left={<BackLink to={`${base}/jobs/${j.reference}/customer`} />} />
      <ScrollArea className="gap-3.5">
        <ScreenHeading
          className="rise-1"
          title="Enter delivery code"
          sub={
            showError
              ? `${j.reference}${contactSuffix(j)}`
              : keke
                ? `Pour the water first. Then ask the customer for the 6-digit code we sent to their phone${j.customer.phone ? ` ending ${phoneEnding(j.customer.phone)}` : ''}.`
                : `Pump the water in first, then ask ${firstName} for the 6-digit code sent to their phone.`
          }
        />
        {!showError && (
          <JobMiniCard
            className="rise-2"
            job={j}
            sub={keke ? `${jobQuantity(j)}${contactSuffix(j)}` : `${jobQuantity(j, 'short')}${tankType ? ` · ${tankType} tank` : ''}`}
            trailing={j.earning_minor_units !== null ? <Chip tone="amber">{formatNaira(j.earning_minor_units)}</Chip> : undefined}
          />
        )}
        <CodeBoxes className="rise-3" value={showError ? (wrong ?? '') : code} invalid={showError} />
        {showError ? (
          <>
            <div role="alert" className="rise-2 flex items-start gap-2.5 rounded-option border-[1.5px] border-solid border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-3 text-sub text-[#7F1D1D]">
              <AlertCircleTallIcon size={20} strokeWidth={2.2} color="#DC2626" roundJoin={false} className="shrink-0" />
              {locked ? (
                <div>
                  <b>Too many wrong codes.</b> The code is locked. Ask admin to confirm the delivery.
                </div>
              ) : (
                <div>
                  <b>That code is not right.</b> Ask the customer to read it again. You have{' '}
                  <b>
                    {j.code_tries_left} {j.code_tries_left === 1 ? 'try' : 'tries'} left
                  </b>
                  .
                </div>
              )}
            </div>
            {!locked && (
              <Button className="rise-3" onClick={tryAgain}>
                Try again
              </Button>
            )}
            <Card pad className="rise-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <IconBadge tone="gold">
                  <TimerIcon size={20} strokeWidth={2.2} roundJoin={false} />
                </IconBadge>
                <div className="flex-1">
                  <div className="font-extrabold">Code expired?</div>
                  <div className="text-caption text-mute">Codes expire after [CODE TIME LIMIT]. You can send a new one.</div>
                </div>
              </div>
              <Button
                variant="alt"
                className="h-[46px]"
                disabled={wait > 0}
                loading={resend.isPending}
                onClick={() => resend.mutate(undefined, { onSuccess: tryAgain })}
              >
                {wait > 0 ? `Send a new code in ${mmss(wait)}` : 'Send a new code'}
              </Button>
              {resend.isSuccess && <Notice tone="success">A new code was sent to the customer.</Notice>}
              {resend.isError && <Notice tone="error">{errorMessage(resend.error)}</Notice>}
            </Card>
            <Link to={issueLink} className="rise-5 text-center text-sub font-bold text-primary no-underline hover:text-primary-dark">
              Still not working? Ask admin to confirm the delivery
            </Link>
          </>
        ) : waiting ? (
          <>
            <Notice className="rise-3">
              <b>Waiting for the delivery code.</b> We send it to the customer when you finish unloading.
            </Notice>
            {/* The code is issued only after unloading (FR-035, #13). */}
            <Button className="rise-4" loading={unloaded.isPending} onClick={() => unloaded.mutate()}>
              Unloading done, send the code
            </Button>
            {unloaded.isError && <Notice tone="error">{errorMessage(unloaded.error)}</Notice>}
          </>
        ) : (
          <>
            <div className="rise-3 flex justify-between text-[13px]">
              <span className="text-mute">Code sent to customer</span>
              <button
                type="button"
                disabled={wait > 0 || resend.isPending}
                onClick={() => resend.mutate()}
                className="cursor-pointer border-0 bg-transparent p-0 font-bold text-primary disabled:cursor-default"
              >
                {wait > 0 ? `Resend in ${mmss(wait)}` : 'Resend code'}
              </button>
            </div>
            {resend.isSuccess && <Notice tone="success">A new code was sent to the customer.</Notice>}
            <div className="rise-4">
              <Keypad value={code} onChange={setCode} disabled={verify.isPending} />
            </div>
            {verify.isError && !(verify.error instanceof ApiError && ['invalid_code', 'code_locked'].includes(verify.error.code)) && (
              <Notice tone="error">{errorMessage(verify.error)}</Notice>
            )}
            {USE_MOCKS && j.demo_code && (
              <p className="m-0 text-center text-chip text-mute">
                Demo: the customer's code is <b className="tracking-[2px]">{j.demo_code}</b>
              </p>
            )}
          </>
        )}
      </ScrollArea>
      {!showError && (
        <Footer>
          <Button disabled={code.length !== 6} loading={verify.isPending} onClick={submit}>
            Verify code
          </Button>
          <Link to={issueLink} className="p-1 text-center text-sub font-bold text-primary no-underline hover:text-primary-dark">
            Code not working? Get help
          </Link>
        </Footer>
      )}
      <span className="sr-only" aria-live="polite">
        {verify.isPending ? `Checking the code` : ''}
      </span>
    </MobileShell>
  )
}
