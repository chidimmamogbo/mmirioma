/**
 * Partner menu (`r-menu`, `t-menu`) and the account screens its links open:
 * profile and settings (added; the design links were empty). Partners have no
 * email and no "News and offers" switch in the pilot (#85).
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import {
  BellIcon,
  ChevronRightIcon,
  DocumentFoldIcon,
  HelpCircleIcon,
  HistoryIcon,
  HomeSolidIcon,
  LogOutIcon,
  NavigationIcon,
  PersonIcon,
  SettingsIcon,
  TruckIcon,
  VehicleIcon,
  WalletIcon,
} from '../../../components/icons/icons'
import { DrawerMenu } from '../../../components/layout/DrawerMenu'
import { BackLink, MobileShell, ScrollArea, TopBar, TopBarSpacer, TopBarTitle } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Avatar } from '../../../components/ui/Avatar'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { PARTNER_PAY_ENABLED } from '../../../lib/features'
import { CountBadge, MenuItem } from '../../../components/ui/Content'
import { Toggle } from '../../../components/ui/Controls'
import { Notice } from '../../../components/ui/Notice'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatPhone } from '../../../lib/format/phone'
import { useLogout } from '../../auth/useSession'
import { InstallMenuItem } from '../../pwa/InstallParts'
import { PushSettingRows } from '../../pwa/PushParts'
import { jobStepPath, usePartnerApp } from '../partnerContext'
import { useActiveJobs, useAvailableJobs, usePartnerNotifications, usePartnerProfile, useUpdatePartnerProfile } from '../queries'

export function PartnerMenu() {
  const navigate = useNavigate()
  const { base, vehicle } = usePartnerApp()
  const profile = usePartnerProfile()
  const available = useAvailableJobs()
  const active = useActiveJobs()
  const notes = usePartnerNotifications()
  const logout = useLogout()
  const [leaving, setLeaving] = useState(false)
  const p = profile.data
  const current = active.data?.find((j) => j.stage === 'accepted' || j.stage === 'collected') ?? active.data?.[0]
  const unread = notes.data?.unread_count ?? 0
  const tanker = vehicle === 'tanker'

  return (
    <DrawerMenu
      closeTo={base}
      label={tanker ? 'Driver menu' : 'Rider menu'}
      tone={tanker ? 'green' : 'blue'}
      header={
        <>
          {tanker && <Illustration name="tanker" className="absolute right-[-40px] bottom-[-4px] w-[150px] opacity-50" />}
          <div className="relative flex items-center gap-3">
            <Avatar name={p?.name ?? ''} size={56} fontSize={18} tone={tanker ? 'green' : 'brand'} />
            <div className="flex-1">
              <div className="text-[17px] font-extrabold">{p?.name}</div>
              <div className="text-caption text-slate">
                {tanker ? 'Tanker' : 'Keke rider'} · {p?.vehicle.plate}
              </div>
              {p && (
                <Chip tone={p.online ? 'green' : 'gray'} className={cx('mt-1.5 px-[9px] py-[3px]', tanker && 'bg-white')}>
                  {p.online && <span aria-hidden="true" className="glow size-[7px] rounded-full bg-green-solid" />}
                  {p.approval !== 'approved' ? 'Waiting for approval' : p.online ? 'Online' : 'Offline'}
                </Chip>
              )}
            </div>
          </div>
        </>
      }
      footer={
        <>
          <button
            type="button"
            onClick={() => setLeaving(true)}
            className="flex min-h-[58px] cursor-pointer items-center gap-3.5 border-0 border-t border-solid border-hairline bg-transparent px-5 text-left text-[15px] font-extrabold text-red transition-colors duration-150 hover:bg-red-bg"
          >
            <LogOutIcon size={20} className="text-red" />
            Log out
          </button>
          <ConfirmDialog
            open={leaving}
            title="Log out of the driver app?"
            confirmLabel="Log out"
            loading={logout.isPending}
            onCancel={() => setLeaving(false)}
            onConfirm={() => logout.mutate(undefined, { onSettled: () => navigate('/partner/login', { replace: true }) })}
          >
            You will need your phone number and password to sign in again.
          </ConfirmDialog>
        </>
      }
    >
      <MenuItem to={base} current tone={tanker ? 'green' : 'blue'} icon={<HomeSolidIcon size={20} filled />}>
        Home
      </MenuItem>
      <MenuItem
        to={`${base}/orders`}
        icon={<DocumentFoldIcon size={20} />}
        trailing={
          available.data && available.data.length > 0 ? (
            <Chip tone={tanker ? 'green' : 'blue'} className="px-2 py-0.5">
              {available.data.length}
            </Chip>
          ) : undefined
        }
      >
        {tanker ? 'Tanker orders' : 'Available orders'}
      </MenuItem>
      <MenuItem to={current ? jobStepPath(base, current) : base} icon={<NavigationIcon size={20} />}>
        {tanker ? 'Active delivery' : 'Active order'}
      </MenuItem>
      {tanker ? (
        <>
          {PARTNER_PAY_ENABLED && (
            <MenuItem to={`${base}/earnings`} icon={<WalletIcon size={20} />}>
              Earnings and payouts
            </MenuItem>
          )}
          <MenuItem to={`${base}/history`} icon={<HistoryIcon size={20} />}>
            Trip history
          </MenuItem>
          <MenuItem to={`${base}/vehicle`} icon={<TruckIcon size={20} />}>
            Tanker and papers
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem to={`${base}/history`} icon={<HistoryIcon size={20} />}>
            Order history
          </MenuItem>
          {PARTNER_PAY_ENABLED && (
            <MenuItem to={`${base}/earnings`} icon={<WalletIcon size={20} />}>
              My earnings
            </MenuItem>
          )}
          <MenuItem to={`${base}/vehicle`} icon={<VehicleIcon size={20} />}>
            Vehicle details
          </MenuItem>
        </>
      )}
      <MenuItem to={`${base}/profile`} icon={<PersonIcon size={20} roundJoin={false} />}>
        My profile
      </MenuItem>
      <MenuItem to={`${base}/notifications`} icon={<BellIcon size={20} />} trailing={unread > 0 ? <CountBadge count={unread} label={`${unread} unread`} /> : undefined}>
        Notifications
      </MenuItem>
      <MenuItem to={`${base}/issue`} icon={<HelpCircleIcon size={20} roundJoin={false} />}>
        Support
      </MenuItem>
      <MenuItem to={`${base}/settings`} icon={<SettingsIcon size={20} roundJoin={false} />}>
        Account settings
      </MenuItem>
      <InstallMenuItem app="partner" />
    </DrawerMenu>
  )
}

/** My profile (added): who you are, vehicle and approval, from the menu's "My profile". */
export function PartnerProfilePage() {
  const { base, vehicle } = usePartnerApp()
  const profile = usePartnerProfile()
  const p = profile.data
  return (
    <MobileShell>
      <TopBar left={<BackLink to={`${base}/menu`} />} center={<TopBarTitle>My profile</TopBarTitle>} right={<TopBarSpacer />} />
      <ScrollArea className="gap-3">
        {profile.isPending && <LoadingBlock />}
        {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}
        {p && (
          <>
            <Card className="rise-1 flex flex-col items-center gap-1.5 p-5 text-center">
              <Avatar name={p.name} size={78} fontSize={24} />
              <div className="text-[20px] font-extrabold">{p.name}</div>
              <div className="text-[13px] text-mute">
                {vehicle === 'keke' ? 'Keke rider' : 'Tanker driver'} · {p.vehicle.plate}
              </div>
              <Chip tone={p.approval === 'approved' ? 'green' : p.approval === 'pending' ? 'amber' : 'red'}>
                {p.approval === 'approved' ? 'Approved' : p.approval === 'pending' ? 'Waiting for approval' : 'Suspended'}
              </Chip>
            </Card>
            <Card className="rise-2 px-4 py-1">
              <div className="mo-li">
                <span className="flex-1">
                  <span className="block text-chip text-mute">Phone</span>
                  <span className="font-bold">{formatPhone(p.phone)}</span>
                </span>
              </div>
              <div className="mo-li">
                <span className="flex-1">
                  <span className="block text-chip text-mute">Payout account</span>
                  <span className="font-bold">{p.payout_account_ending ? `Bank account ending ${p.payout_account_ending}` : 'Not added yet. Ask admin.'}</span>
                </span>
              </div>
            </Card>
            <Link to={`${base}/vehicle`} className="mo-card rise-3 flex items-center gap-3 px-4 py-3 font-bold text-ink no-underline hover:text-ink">
              {vehicle === 'keke' ? 'Vehicle and papers' : 'Tanker and papers'}
              <ChevronRightIcon size={18} strokeWidth={2.2} color="#56677D" roundJoin={false} className="ml-auto" />
            </Link>
          </>
        )}
      </ScrollArea>
    </MobileShell>
  )
}

/** Account settings (added): alerts, password. */
export function PartnerSettings() {
  const { base, vehicle } = usePartnerApp()
  const profile = usePartnerProfile()
  const update = useUpdatePartnerProfile()
  const p = profile.data

  const prefs: { key: 'new_order_alerts' | 'sms_updates'; title: string; sub: string }[] = [
    { key: 'new_order_alerts', title: 'New order alerts', sub: 'When orders appear near you' },
    { key: 'sms_updates', title: 'SMS updates', sub: 'Assignments and payouts' },
  ]

  return (
    <MobileShell>
      <TopBar left={<BackLink to={`${base}/menu`} />} center={<TopBarTitle>Account settings</TopBarTitle>} right={<TopBarSpacer />} />
      <ScrollArea className="gap-3">
        {profile.isPending && <LoadingBlock />}
        {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}
        {p && (
          <>
            <Card className="rise-1 px-4 py-1">
              <PushSettingRows app="partner" tone={vehicle === 'tanker' ? 'green' : 'blue'} />
              {prefs.map((pr) => (
                <div key={pr.key} className="mo-li">
                  <span className="flex-1">
                    <span className="block font-bold">{pr.title}</span>
                    <span className="text-chip text-mute">{pr.sub}</span>
                  </span>
                  <Toggle label={pr.title} checked={p.preferences[pr.key]} onChange={(v) => update.mutate({ preferences: { [pr.key]: v } })} />
                </div>
              ))}
            </Card>
            {update.isSuccess && <Notice tone="success">Saved.</Notice>}
            {update.isError && <Notice tone="error">{errorMessage(update.error)}</Notice>}
            <Card className="rise-2 px-4 py-1">
              <Link to="/partner/password" className="mo-li font-bold hover:text-ink">
                Change password
                <ChevronRightIcon size={18} strokeWidth={2.2} color="#56677D" roundJoin={false} className="ml-auto" />
              </Link>
              <Link to="/privacy" className="mo-li font-bold hover:text-ink">
                Privacy notice
                <ChevronRightIcon size={18} strokeWidth={2.2} color="#56677D" roundJoin={false} className="ml-auto" />
              </Link>
            </Card>
          </>
        )}
      </ScrollArea>
    </MobileShell>
  )
}
