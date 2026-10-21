import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wave } from '../../../components/art/Art'
import { CameraBodyIcon, ChevronLeftIcon, ChevronRightIcon } from '../../../components/icons/icons'
import { MobileShell, ScrollArea, TopBarSpacer } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Toggle } from '../../../components/ui/Controls'
import { Notice } from '../../../components/ui/Notice'
import type { CustomerProfile } from '../../../domain/orders'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatPhone } from '../../../lib/format/phone'
import { useLogout } from '../../auth/useSession'
import { PushSettingRows } from '../../pwa/PushParts'
import { useProfile, useUpdateProfile } from '../queries'

/** Largest photo accepted, before it is stored (keeps uploads small on mobile data). */
const MAX_PHOTO_BYTES = 500_000

const PREFS: { key: keyof CustomerProfile['preferences']; title: string; sub: string }[] = [
  { key: 'sms_updates', title: 'SMS updates', sub: 'Order status and delivery codes' },
  { key: 'whatsapp_updates', title: 'WhatsApp updates', sub: 'Rider arrival and receipts' },
  { key: 'offers_and_news', title: 'Offers and news', sub: 'Points promos, now and then' },
]

/** Profile and settings (`c-profile`). */
export function Profile() {
  const navigate = useNavigate()
  const profile = useProfile()
  const update = useUpdateProfile()
  const logout = useLogout()
  const [leaving, setLeaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const p = profile.data

  function pickPhoto(file: File | undefined) {
    setPhotoError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) return setPhotoError('Choose a photo (JPG or PNG).')
    if (file.size > MAX_PHOTO_BYTES) return setPhotoError('That photo is too large. Choose one under 500 KB.')
    const reader = new FileReader()
    reader.onload = () => update.mutate({ photo_url: String(reader.result) })
    reader.readAsDataURL(file)
  }

  const since = p
    ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(p.customer_since))
    : ''

  return (
    <MobileShell>
      <ScrollArea className="gap-0 p-0">
        <div className="relative overflow-hidden bg-[linear-gradient(160deg,#0B4FA8_0%,#1570D8_60%,#16A0B8_100%)] px-4 pt-3 pb-14 text-white">
          <div className="relative z-[2] flex items-center justify-between">
            <Link to="/menu" aria-label="Back" className="mo-ib text-white hover:text-white">
              <ChevronLeftIcon size={22} strokeWidth={2.4} roundJoin={false} />
            </Link>
            <h1 className="m-0 text-[17px] font-extrabold">My profile</h1>
            <TopBarSpacer />
          </div>
          {p && (
            <div className="rise-1 relative z-[2] mt-1.5 flex flex-col items-center gap-1.5">
              <span className="relative">
                <Avatar name={p.name} size={78} fontSize={24} photoUrl={p.photo_url} className="shadow-[0_0_0_4px_rgba(255,255,255,0.35)]" />
                <button
                  type="button"
                  aria-label="Change photo"
                  onClick={() => fileRef.current?.click()}
                  className="hit-44 absolute right-[-2px] bottom-[-2px] flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-gold text-ink"
                >
                  <CameraBodyIcon size={14} strokeWidth={2.4} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => pickPhoto(e.target.files?.[0])}
                />
              </span>
              <div className="text-[20px] font-extrabold">{p.name}</div>
              <div className="text-[13px] text-[#DCEBFD]">Customer since {since}</div>
            </div>
          )}
          <Wave fill="#F4F7FB" className="bottom-[-1px]" />
        </div>
        <div className="relative z-[3] mt-[-26px] flex flex-col gap-3 px-gutter pb-5">
          {profile.isPending && <LoadingBlock label="Loading your profile" />}
          {profile.isError && <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} />}
          {photoError && <Notice tone="error">{photoError}</Notice>}
          {update.isError && <Notice tone="error">{errorMessage(update.error)}</Notice>}
          {p && (
            <>
              <Card className="rise-2 grid grid-cols-3 py-3 text-center">
                <Stat value={p.stats.orders} label="Orders" />
                <div className="border-x border-solid border-hairline">
                  <Stat value={p.stats.points} label="Points" valueClass="text-gold-ink" />
                </div>
                <Stat value={p.stats.addresses} label="Addresses" />
              </Card>
              <Card className="rise-3 px-4 py-1">
                <div className="mo-li">
                  <span className="flex-1">
                    <span className="block text-chip text-mute">Phone</span>
                    <span className="font-bold">{formatPhone(p.phone)}</span>
                  </span>
                  {p.phone_verified ? (
                    <Chip tone="green" className="px-2 py-[3px]">Verified</Chip>
                  ) : (
                    <Chip tone="amber" className="px-2 py-[3px]">Not verified yet</Chip>
                  )}
                </div>
                <div className="mo-li">
                  <span className="min-w-0 flex-1">
                    <span className="block text-chip text-mute">Email (optional)</span>
                    <span className="block truncate font-bold">{p.email ?? 'Add an email for updates and offers'}</span>
                  </span>
                  <Link to="/profile/email" className="hit-44 text-[13px] font-bold text-primary no-underline hover:text-primary-dark">
                    {p.email ? 'Edit' : 'Add'}
                  </Link>
                </div>
                <div className="mo-li">
                  <span className="flex-1">
                    <span className="block text-chip text-mute">Signed in with</span>
                    <span className="font-bold">Phone number and password</span>
                  </span>
                </div>
              </Card>
              <Card className="rise-4 px-4 py-1">
                <PushSettingRows app="customer" />
                {PREFS.map((pref) => (
                  <div key={pref.key} className="mo-li">
                    <span className="flex-1">
                      <span className="block font-bold">{pref.title}</span>
                      <span className="text-chip text-mute">{pref.sub}</span>
                    </span>
                    <Toggle
                      label={pref.title}
                      checked={p.preferences[pref.key]}
                      onChange={(v) => update.mutate({ preferences: { [pref.key]: v } })}
                    />
                  </div>
                ))}
              </Card>
              <Card className="rise-5 px-4 py-1">
                <SettingLink to="/profile/password">Change password</SettingLink>
                <SettingLink to="/privacy">Privacy notice</SettingLink>
                <Link to="/profile/delete" className="mo-li font-bold text-red hover:text-red">
                  Delete my account
                </Link>
              </Card>
              <Button variant="line-danger" onClick={() => setLeaving(true)}>
                Log out
              </Button>
              <ConfirmDialog
                open={leaving}
                title="Log out of MmiriOma?"
                confirmLabel="Log out"
                loading={logout.isPending}
                onCancel={() => setLeaving(false)}
                onConfirm={() => logout.mutate(undefined, { onSettled: () => navigate('/signin', { replace: true }) })}
              >
                You will need your phone number and password to sign in again.
              </ConfirmDialog>
            </>
          )}
        </div>
      </ScrollArea>
    </MobileShell>
  )
}

function Stat({ value, label, valueClass }: { value: number; label: string; valueClass?: string }) {
  return (
    <div>
      <div className={`text-[20px] font-extrabold ${valueClass ?? ''}`}>{value}</div>
      <div className="text-chip text-mute">{label}</div>
    </div>
  )
}

function SettingLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mo-li font-bold hover:text-ink">
      {children}
      <ChevronRightIcon size={18} strokeWidth={2.2} color="#56677D" roundJoin={false} className="ml-auto" />
    </Link>
  )
}
