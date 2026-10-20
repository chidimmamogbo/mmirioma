import { Link, useParams } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { ChevronRightIcon } from '../../../components/icons/icons'
import { MenuLink, MobileShell, ProfileLink, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Card, CardLink } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { SectionHeader, TextLink } from '../../../components/ui/Content'
import { HomeAppCard } from '../../pwa/PushParts'
import { ToggleKnob } from '../../../components/ui/Controls'
import { Notice } from '../../../components/ui/Notice'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatNaira } from '../../../lib/format/money'
import { AssignedSheet } from '../components/AssignedSheet'
import { TankTypeChip } from '../components/JobParts'
import { PartnerTabs } from '../components/PartnerChrome'
import { greeting } from '../greeting'
import { jobQuantity, tankerTripLine } from '../jobHelpers'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useActiveJobs, useAvailableJobs, useEarnings, usePartnerProfile, useSetOnline } from '../queries'

/** How many pool orders the dashboard lists before "View all". */
const HOME_LIST = 2

/**
 * Tanker driver dashboard (`t-home`): green hero, online switch, three stats
 * and the first tanker orders near the driver. An order admin assigned opens
 * as the same bottom sheet as the rider app (no tanker design exists for it).
 */
export function DriverHome() {
  const { reference } = useParams()
  const { base } = usePartnerApp()
  const profile = usePartnerProfile()
  const earnings = useEarnings()
  const active = useActiveJobs()
  const available = useAvailableJobs()
  const setOnline = useSetOnline()

  const p = profile.data
  const e = earnings.data
  const assigned = active.data?.find((j) => j.stage === 'assigned' && (!reference || j.reference === reference))
  const inProgress = active.data?.find((j) => j.stage === 'accepted' || j.stage === 'collected')
  const list = available.data ?? []
  const approved = p?.approval === 'approved'
  const online = Boolean(p?.online)

  return (
    <MobileShell>
      <TopBar left={<MenuLink to={`${base}/menu`} />} right={<ProfileLink to={`${base}/menu`} name={p?.name ?? '·'} tone="green" />} />
      <ScrollArea className="gap-3">
        {profile.isPending && <LoadingBlock />}
        {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}
        {p && (
          <>
            <div className="rise-1 relative box-border min-h-[132px] overflow-hidden rounded-[22px] bg-[linear-gradient(160deg,#E7F7EE_0%,#C9EEDA_100%)] p-4">
              <Illustration name="tanker" className="animate-drive absolute right-[-24px] bottom-1.5 w-[200px]" />
              <div className="relative max-w-[170px]">
                <div className="text-[13px] font-bold text-[#15803D]">Tanker driver</div>
                <h1 className="m-0 text-[21px] leading-[1.2] font-extrabold">
                  {greeting()}, {p.name.split(' ')[0]}!
                </h1>
                <div className="mt-1 text-caption text-slate">
                  {p.vehicle.plate} · {p.vehicle.description}
                </div>
              </div>
            </div>

            {!approved ? (
              <Notice tone={p.approval === 'suspended' ? 'error' : 'note'} className="rise-2">
                {p.approval === 'suspended' ? (
                  <>
                    <b>Your account is suspended.</b> You cannot get new orders. Contact admin to find out why.
                  </>
                ) : (
                  <>
                    <b>Waiting for approval.</b> Admin checks your tanker and papers before you can go online.{' '}
                    <Link to={`${base}/vehicle`} className="font-bold text-primary no-underline">
                      Upload your papers
                    </Link>
                  </>
                )}
              </Notice>
            ) : (
              <button
                type="button"
                aria-pressed={online}
                disabled={setOnline.isPending}
                onClick={() => setOnline.mutate(!online)}
                className={cx(
                  'rise-2 flex w-full cursor-pointer items-center gap-3 rounded-stat border-[1.5px] border-solid bg-white px-4 py-3.5 text-ink transition-colors duration-[250ms]',
                  online ? 'border-[#86EFAC]' : 'border-line',
                )}
              >
                <span className={cx('size-3 shrink-0 rounded-full', online ? 'glow bg-green-solid' : 'bg-[#CBD5E1]')} aria-hidden="true" />
                <span className="flex flex-1 flex-col text-left">
                  <span className="text-[16px] font-extrabold">{online ? 'You are online' : 'You are offline'}</span>
                  <span className="text-caption text-slate">{online ? 'Tanker orders near you will show up' : 'Go online to see and accept orders'}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cx('relative h-[30px] w-[52px] shrink-0 rounded-[15px] transition-colors duration-[250ms]', online ? 'bg-green-solid' : 'bg-[#CBD5E1]')}
                >
                  <span className={cx('absolute top-0 left-0 transition-transform duration-[250ms]', online && 'translate-x-[2px]')}>
                    <ToggleKnob checked={online} />
                  </span>
                </span>
              </button>
            )}
            {setOnline.isError && <Notice tone="error">{errorMessage(setOnline.error)}</Notice>}

            <div className="rise-3 grid grid-cols-3 gap-2">
              <Stat label="Today" value={e ? formatNaira(e.today_minor_units) : '…'} />
              <Stat label="Trips" value={e ? String(e.deliveries_today) : '…'} />
              <Stat label="Wallet" value={e ? formatNaira(e.wallet_minor_units) : '…'} to={`${base}/earnings`} />
            </div>

            {inProgress && (
              <Link
                to={jobStepPath(base, inProgress)}
                className="rise-4 relative flex items-center gap-3 overflow-hidden rounded-stat bg-[linear-gradient(120deg,#14532D,#15803D)] px-3.5 py-3 text-white no-underline hover:text-white"
              >
                <Illustration name="tanker" className="animate-drive w-[78px]" />
                <span className="flex flex-1 flex-col">
                  <span className="text-chip font-bold text-[#BBF7D0]">ACTIVE DELIVERY</span>
                  <span className="font-extrabold">
                    {inProgress.reference} · {jobQuantity(inProgress)}
                  </span>
                  <span className="text-caption text-[#DCFCE7]">
                    {inProgress.stage === 'accepted' ? `Load at ${inProgress.station.name}` : `Head to ${inProgress.customer.area}`}
                  </span>
                </span>
                <ChevronRightIcon size={20} strokeWidth={2.4} color="#fff" roundJoin={false} />
              </Link>
            )}

            <HomeAppCard app="partner" tone="green" className="rise-4" />

            <SectionHeader
              className="rise-4"
              title={`Tanker orders near you (${list.length})`}
              action={
                <TextLink to={`${base}/orders`} className="text-sub">
                  View all
                </TextLink>
              }
            />
            {available.isPending && <LoadingBlock lines={1} label="Loading orders" />}
            {available.isError && <ErrorBlock error={available.error} onRetry={() => available.refetch()} />}
            {available.isSuccess && list.length === 0 && (
              <EmptyBlock
                illustration="tanker"
                title={!approved ? 'No orders yet' : online ? 'No orders right now' : 'You are offline'}
                text={!approved ? 'Orders show here once admin approves you.' : online ? 'Orders your tank can carry show up here.' : 'Go online to see orders near you.'}
              />
            )}
            {list.slice(0, HOME_LIST).map((j, i) => (
              <CardLink key={j.reference} to={`${base}/orders/${j.reference}`} className={cx('flex items-center gap-3 p-3.5', i === 0 ? 'rise-4' : 'rise-5')}>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[16px] font-extrabold">{jobQuantity(j)}</span>
                    <TankTypeChip job={j} />
                  </div>
                  <div className="mt-1 text-caption text-mute">
                    {j.station.name} {j.station.distance_km} km → {j.customer.area} {j.customer.distance_km} km
                  </div>
                  <div className="text-caption text-mute">{tankerTripLine(j)}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Chip tone="amber" className="text-[13px]">
                    {formatNaira(j.earning_minor_units)}
                  </Chip>
                  <Illustration name="tanker" className="w-[92px]" />
                </div>
              </CardLink>
            ))}
          </>
        )}
      </ScrollArea>
      <PartnerTabs current="home" />
      {assigned && <AssignedSheet job={assigned} />}
    </MobileShell>
  )
}

function Stat({ label, value, to }: { label: string; value: string; to?: string }) {
  const body = (
    <>
      <div className="text-[11.5px] text-mute">{label}</div>
      <div className="text-[17px] font-extrabold">{value}</div>
    </>
  )
  return to ? (
    <CardLink to={to} className="p-3">
      {body}
    </CardLink>
  ) : (
    <Card className="p-3">{body}</Card>
  )
}
