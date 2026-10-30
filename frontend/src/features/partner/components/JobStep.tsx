import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { BackLink, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import type { PartnerJob } from '../../../domain/partner'
import { jobStepPath, tripStep, usePartnerApp, type TripStep } from '../partnerContext'
import { useJob } from '../queries'

/**
 * Loads the job in the URL and renders `children` only when it is at `stage`
 * (and, when `step` is given, at that trip step). Any other stage or step
 * redirects to its screen, so a reload or a back tap never shows a step that no
 * longer applies. Used by the Keke and tanker trips.
 *
 * Without `step`, a collected job stays on the screen whatever its step, as the
 * refill and loading screens do not tell steps apart.
 *
 * A job that has loaded stays on screen when a later refresh fails; only a job
 * that never loaded shows the full-screen error.
 */
export function JobStep({ stage, step, children }: { stage: PartnerJob['stage']; step?: TripStep; children: (job: PartnerJob) => ReactNode }) {
  const { reference = '' } = useParams()
  const { base } = usePartnerApp()
  const job = useJob(reference)
  if (job.isPending)
    return (
      <MobileShell>
        <TopBar left={<BackLink to={base} />} />
        <ScrollArea>
          <LoadingBlock />
        </ScrollArea>
      </MobileShell>
    )
  // Only a job that never loaded gets the error screen. A step action ends with
  // a refresh of the job, and when that refresh fails (the connection is lost,
  // or the job was reassigned and now answers 404) the cached job is kept. The
  // step stays on screen so its own notice can say what happened, in the
  // design's words ("Not sent...", "This job was reassigned...").
  if (job.isError && job.data === undefined)
    return (
      <MobileShell>
        <TopBar left={<BackLink to={base} />} />
        <ScrollArea>
          <ErrorBlock error={job.error} onRetry={() => job.refetch()} />
        </ScrollArea>
      </MobileShell>
    )
  if (job.data.stage !== stage || (step !== undefined && tripStep(job.data) !== step)) return <Navigate to={jobStepPath(base, job.data)} replace />
  return <>{children(job.data)}</>
}
