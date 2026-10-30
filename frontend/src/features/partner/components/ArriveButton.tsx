import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useArriveAtCustomer } from '../queries'
import { StepError } from './StepError'

/**
 * "I have arrived" (U1), the action of the customer step in both apps. It
 * records the arrival on its own (FR-038; no location is sent) and opens the
 * arrived screen. Repeating it is harmless: the server answers an arrived job
 * unchanged.
 *
 * @param reference - The job's order reference.
 * @param className - Overrides for the button, e.g. the tanker app's green.
 */
export function ArriveButton({ reference, className }: { reference: string; className?: string }) {
  const { base } = usePartnerApp()
  const navigate = useNavigate()
  const arrive = useArriveAtCustomer(reference)
  const send = () => arrive.mutate(undefined, { onSuccess: (job) => navigate(jobStepPath(base, job), { replace: true }) })
  return (
    <>
      {arrive.isError && (
        <StepError error={arrive.error} notSent="We could not record your arrival. Check your connection and try again." onRetry={send} base={base} />
      )}
      <Button variant="alt" className={className ?? 'h-[46px]'} loading={arrive.isPending} onClick={send}>
        {arrive.isPending ? 'Recording arrival…' : 'I have arrived'}
      </Button>
    </>
  )
}
