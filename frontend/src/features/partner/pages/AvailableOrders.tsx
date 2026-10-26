import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AddressMapArt, MapFrame } from '../../../components/art/Art'
import { BellIcon } from '../../../components/icons/icons'
import { BackLink, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { ScreenHeading } from '../../../components/ui/Content'
import { Segmented } from '../../../components/ui/Controls'
import { IconLink } from '../../../components/ui/IconButton'
import { formatNaira } from '../../../lib/format/money'
import { AvailableJobCard } from '../components/JobParts'
import { jobQuantity } from '../jobHelpers'
import { usePartnerApp } from '../partnerContext'
import { useAvailableJobs, usePartnerProfile } from '../queries'

type View = 'all' | 'mine' | 'map'

/**
 * Open orders near the partner (`r-available`). No countdown: an order stays
 * until a partner accepts it or admin assigns it. Riders only see Keke orders
 * (decision 9), so "All" and "Keke" show the same list.
 */
export function AvailableOrders({ header }: { header?: ReactNode }) {
  const { base, vehicle } = usePartnerApp()
  const jobs = useAvailableJobs()
  const profile = usePartnerProfile()
  const [view, setView] = useState<View>('mine')
  const list = jobs.data ?? []
  const label = vehicle === 'keke' ? 'Keke' : 'Tanker'
  const offline = profile.data && (!profile.data.online || profile.data.approval !== 'approved')

  return (
    <MobileShell>
      <TopBar
        left={<BackLink to={base} />}
        right={
          <IconLink to={`${base}/notifications`} label="Notifications">
            <BellIcon size={22} />
          </IconLink>
        }
      />
      <ScrollArea className="gap-3">
        {header ?? <ScreenHeading className="rise-1" title="Available orders" sub="Orders near you. Accept one to start." />}
        <Segmented
          className="rise-2"
          label="Filter orders"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: `All (${list.length})` },
            { value: 'mine', label: `${label} (${list.length})` },
            { value: 'map', label: 'Map' },
          ]}
        />
        {jobs.isPending && <LoadingBlock label="Loading orders" />}
        {jobs.isError && <ErrorBlock error={jobs.error} onRetry={() => jobs.refetch()} />}
        {jobs.isSuccess && list.length === 0 && (
          <EmptyBlock
            illustration="keke"
            title={offline ? 'You are offline' : 'No orders right now'}
            text={offline ? 'Go online from your dashboard to see orders.' : 'New orders show up here. Check again soon.'}
          />
        )}
        {view === 'map' && list.length > 0 ? (
          <>
            <MapFrame height={300} className="rise-3">
              <AddressMapArt />
              {list.map((j, i) => (
                <Link
                  key={j.reference}
                  to={`${base}/orders/${j.reference}`}
                  aria-label={`${j.reference}, ${jobQuantity(j)}, customer in ${j.customer.area}`}
                  className="absolute flex size-11 items-center justify-center"
                  style={{ left: `${12 + ((i * 37) % 72)}%`, top: `${14 + ((i * 53) % 66)}%` }}
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-chip font-extrabold text-white shadow-control">
                    {i + 1}
                  </span>
                </Link>
              ))}
            </MapFrame>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {list.map((j, i) => (
                <li key={j.reference}>
                  <Link to={`${base}/orders/${j.reference}`} className="mo-card flex items-center gap-3 px-3.5 py-2.5 text-ink no-underline hover:text-ink">
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary text-chip font-extrabold text-white">{i + 1}</span>
                    <span className="flex-1">
                      <span className="block font-bold">{jobQuantity(j)}</span>
                      <span className="text-chip text-mute">Customer in {j.customer.area}</span>
                    </span>
                    {j.earning_minor_units !== null && <span className="font-extrabold">{formatNaira(j.earning_minor_units)}</span>}
                  </Link>
                </li>
              ))}
            </ol>
            <p className="m-0 text-center text-chip text-mute">The map is a guide. Pins are not exact locations.</p>
          </>
        ) : (
          list.map((j) => <AvailableJobCard key={j.reference} job={j} to={`${base}/orders/${j.reference}`} className="rise-3" />)
        )}
        <p className="rise-4 m-0 text-center text-caption text-mute">
          No countdown. An order stays here until a {vehicle === 'keke' ? 'rider' : 'driver'} accepts it or the admin assigns it.
        </p>
      </ScrollArea>
    </MobileShell>
  )
}
