import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { KeyValue, ScreenHeading } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatNaira } from '../../../lib/format/money'
import { RouteCard } from '../components/JobParts'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useAcceptJob, useJob, usePartnerProfile } from '../queries'

/** Order details and accept (`r-order`; the tanker version is `t-order`). */
export function JobDetail() {
  const { reference = '' } = useParams()
  const navigate = useNavigate()
  const { base, role } = usePartnerApp()
  const job = useJob(reference)
  const profile = usePartnerProfile()
  const accept = useAcceptJob()
  const j = job.data

  // Once a job is mine and under way, its own step screen is the right place.
  if (j && j.stage !== 'available' && j.stage !== 'assigned') return <Navigate to={jobStepPath(base, j)} replace />

  const taken = accept.error instanceof ApiError && accept.error.code === 'order_taken'
  const keke = j?.choice.delivery_type === 'keke'
  const fits = j && j.choice.delivery_type === 'tanker' && profile.data?.vehicle.tank_gallons

  return (
    <MobileShell>
      <TopBar left={<BackLink to={`${base}/orders`} />} />
      <ScrollArea className="gap-3">
        {job.isPending && <LoadingBlock />}
        {job.isError && <ErrorBlock error={job.error} onRetry={() => job.refetch()} />}
        {j && (
          <>
            <div className="rise-1 flex items-start justify-between gap-2.5">
              <ScreenHeading title="Order details" sub={<span className="font-bold text-slate">{j.reference}</span>} />
              <Chip tone="amber" className="px-3 py-2 text-[15px]">
                {formatNaira(j.earning_minor_units)}
              </Chip>
            </div>
            <div
              className={cx(
                'rise-2 flex items-center gap-3 overflow-hidden rounded-card px-4 py-3.5',
                keke ? 'bg-[linear-gradient(160deg,#EEF6FF_0%,#DCEBFD_100%)]' : 'bg-[linear-gradient(160deg,#E7F7EE,#C9EEDA)]',
              )}
            >
              <div className="flex-1">
                <div className={cx('text-chip font-extrabold tracking-[0.4px]', keke ? 'text-primary-dark' : 'text-[#15803D]')}>
                  {keke ? 'WATER ORDER' : 'TANKER ORDER'}
                </div>
                {j.choice.delivery_type === 'keke' ? (
                  <>
                    <KeyValue label="Water size" value={`${j.choice.can_size_litres} litres`} />
                    <KeyValue label="Quantity" value={`${j.choice.can_count} cans`} />
                    <KeyValue label="Delivery" value="Keke" />
                  </>
                ) : (
                  <>
                    <KeyValue label="Tank type" value={j.choice.tank_type === 'overhead' ? 'Overhead' : 'Ground'} />
                    <KeyValue label="Capacity" value={`${j.choice.tank_size_gallons?.toLocaleString('en-NG')} gallons`} />
                    {fits && (
                      <KeyValue
                        label="Fits your tank"
                        value={<span className="text-[#15803D]">Yes · {profile.data?.vehicle.tank_gallons?.toLocaleString('en-NG')} gal</span>}
                      />
                    )}
                  </>
                )}
              </div>
              <Illustration name={keke ? 'keke' : 'tanker'} className={cx('animate-drive', keke ? 'w-[132px]' : 'mr-[-26px] w-[150px]')} />
            </div>
            <RouteCard job={j} className="rise-3" />
            <Card pad className="rise-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold">You will earn</span>
                <span className="text-[18px] font-extrabold text-green">{formatNaira(j.earning_minor_units)}</span>
              </div>
              {j.instructions && (
                <div className="rounded-input bg-canvas px-3 py-2.5 text-[13px]">
                  <b>Instructions:</b> {j.instructions}
                </div>
              )}
              <span className="text-chip text-mute">Sample amount. {keke ? 'Rider' : 'Driver'} pay rules are not final.</span>
            </Card>
            {accept.isError && (
              <Notice tone="error">
                {taken ? `Another ${role} already took this order. Pick another one.` : errorMessage(accept.error)}
              </Notice>
            )}
          </>
        )}
      </ScrollArea>
      <Footer>
        <Button
          disabled={!j || taken}
          loading={accept.isPending}
          onClick={() => accept.mutate(reference, { onSuccess: (done) => navigate(jobStepPath(base, done), { replace: true }) })}
        >
          Accept order
        </Button>
        <span className="text-center text-chip text-mute">Once you accept, no other {role} can take it.</span>
      </Footer>
    </MobileShell>
  )
}
