/**
 * Partner menu (`r-menu`, `t-menu`) and the account screens its links open:
 * profile and settings (added; the design links were empty). Settings holds
 * the optional email for updates and newsletters (decision 6).
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
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
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { CountBadge, MenuItem } from '../../../components/ui/Content'
import { Toggle } from '../../../components/ui/Controls'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatPhone } from '../../../lib/format/phone'
import { applyServerFieldErrors, optionalEmailField } from '../../../lib/forms'
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
  const p = profile.data
  const current = active.data?.find((j) => j.stage === 'accepted' || j.stage === 'collected') ?? active.data?.[0]
  const unread = notes.data?.filter((n) => !n.read).length ?? 0
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
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/partner/login', { replace: true }) })}
          className="flex min-h-[58px] cursor-pointer items-center gap-3.5 border-0 border-t border-solid border-hairline bg-transparent px-5 text-left text-[15px] font-extrabold text-red"
        >
          <LogOutIcon size={20} className="text-red" />
          Log out
        </button>
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
          <MenuItem to={`${base}/earnings`} icon={<WalletIcon size={20} />}>
            Earnings and payouts
          </MenuItem>
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
          <MenuItem to={`${base}/earnings`} icon={<WalletIcon size={20} />}>
            My earnings
          </MenuItem>
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
                <span className="min-w-0 flex-1">
                  <span className="block text-chip text-mute">Email (optional)</span>
                  <span className="block truncate font-bold">{p.email ?? 'Not added'}</span>
                </span>
                <Link to={`${base}/settings`} className="hit-44 text-[13px] font-bold text-primary no-underline">
                  {p.email ? 'Edit' : 'Add'}
                </Link>
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

const emailSchema = z.object({ email: optionalEmailField })

/** Account settings (added): optional email, alerts, password. */
export function PartnerSettings() {
  const { base, vehicle } = usePartnerApp()
  const profile = usePartnerProfile()
  const update = useUpdatePartnerProfile()
  const p = profile.data
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), values: { email: p?.email ?? '' } })

  const onSubmit = handleSubmit((v) =>
    update.mutate({ email: v.email || null }, { onError: (e) => applyServerFieldErrors(e, setError, { email: 'email' }) }),
  )

  const prefs: { key: 'new_order_alerts' | 'sms_updates' | 'offers_and_news'; title: string; sub: string }[] = [
    { key: 'new_order_alerts', title: 'New order alerts', sub: 'When orders appear near you' },
    { key: 'sms_updates', title: 'SMS updates', sub: 'Assignments and payouts' },
    { key: 'offers_and_news', title: 'News and offers', sub: 'Newsletters and promos, now and then' },
  ]

  return (
    <MobileShell>
      <TopBar left={<BackLink to={`${base}/menu`} />} center={<TopBarTitle>Account settings</TopBarTitle>} right={<TopBarSpacer />} />
      <ScrollArea className="gap-3">
        {profile.isPending && <LoadingBlock />}
        {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}
        {p && (
          <>
            <Card pad className="rise-1">
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
                <TextField
                  label="Email address"
                  optional
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  hint="For updates, newsletters and offers. Your phone stays your sign-in."
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Button type="submit" variant="alt" size="sm" loading={update.isPending}>
                  Save email
                </Button>
              </form>
            </Card>
            <Card className="rise-2 px-4 py-1">
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
            {update.isError && !errors.email && <Notice tone="error">{errorMessage(update.error)}</Notice>}
            <Card className="rise-3 px-4 py-1">
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
