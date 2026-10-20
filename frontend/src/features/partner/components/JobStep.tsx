import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { BackLink, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import type { PartnerJob } from '../../../domain/partner'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useJob } from '../queries'

/**
 * Loads the job in the URL and renders `children` only when it is at `stage`.
 * Any other stage redirects to that stage's screen, so a reload or a back tap
 * never shows a step that no longer applies. Used by the Keke and tanker trips.
 */
export function JobStep({ stage, children }: { stage: PartnerJob['stage']; children: (job: PartnerJob) => ReactNode }) {
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
  if (job.isError)
    return (
      <MobileShell>
        <TopBar left={<BackLink to={base} />} />
        <ScrollArea>
          <ErrorBlock error={job.error} onRetry={() => job.refetch()} />
        </ScrollArea>
      </MobileShell>
    )
  if (job.data.stage !== stage) return <Navigate to={jobStepPath(base, job.data)} replace />
  return <>{children(job.data)}</>
}
