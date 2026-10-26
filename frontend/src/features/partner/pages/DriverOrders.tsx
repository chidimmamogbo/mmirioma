import { useState } from 'react'
import { BackLink, MobileShell, ScrollArea, TopBar, TopBarSpacer } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { ScreenHeading } from '../../../components/ui/Content'
import { Pills } from '../../../components/ui/Controls'
import type { TankType } from '../../../domain/orders'
import { TankerJobCard } from '../components/JobParts'
import { usePartnerApp } from '../partnerContext'
import { useAvailableJobs, usePartnerProfile } from '../queries'

type Filter = 'all' | TankType

/**
 * Tanker orders near the driver (`t-available`). The server already leaves
 * out orders bigger than the driver's tank; the pills filter by tank type.
 * No countdown: an order stays until a driver accepts or admin assigns it.
 */
export function DriverOrders() {
  const { base } = usePartnerApp()
  const jobs = useAvailableJobs()
  const profile = usePartnerProfile()
  const [filter, setFilter] = useState<Filter>('all')
  const all = jobs.data ?? []
  // A job whose tank type is unknown (#21) only shows under "all".
  const list = all.filter((j) => filter === 'all' || (j.choice?.delivery_type === 'tanker' && j.choice.tank_type === filter))
  const offline = profile.data && (!profile.data.online || profile.data.approval !== 'approved')

  return (
    <MobileShell>
      <TopBar left={<BackLink to={base} />} right={<TopBarSpacer />} />
      <ScrollArea className="gap-3">
        <ScreenHeading className="rise-1" title="Tanker orders" sub="Only orders your tank can carry are shown." />
        <Pills
          className="rise-2"
          label="Tank type"
          wrap={false}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${all.length})` },
            { value: 'ground', label: 'Ground' },
            { value: 'overhead', label: 'Overhead' },
          ]}
        />
        {jobs.isPending && <LoadingBlock label="Loading orders" />}
        {jobs.isError && <ErrorBlock error={jobs.error} onRetry={() => jobs.refetch()} />}
        {jobs.isSuccess && list.length === 0 && (
          <EmptyBlock
            illustration="tanker"
            title={offline ? 'You are offline' : all.length > 0 ? `No ${filter} tank orders` : 'No orders right now'}
            text={offline ? 'Go online from your dashboard to see orders.' : 'New orders show up here. Check again soon.'}
          />
        )}
        {list.map((j) => (
          <TankerJobCard key={j.reference} job={j} to={`${base}/orders/${j.reference}`} className="rise-3" />
        ))}
        <p className="m-0 text-center text-caption text-mute">No countdown. Orders stay until a driver accepts or the admin assigns.</p>
      </ScrollArea>
    </MobileShell>
  )
}
