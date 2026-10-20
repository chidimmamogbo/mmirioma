import { useState } from 'react'
import { BellIcon } from '../../components/icons/icons'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { IconBadge } from '../../components/ui/Content'
import { Toggle } from '../../components/ui/Controls'
import { Notice } from '../../components/ui/Notice'
import { errorMessage } from '../../lib/api/errorMessage'
import { cx } from '../../lib/cx'
import { InstallCard } from './InstallParts'
import type { AppKind } from './manifest'
import { pushBlocked, pushSupport } from './push'
import { usePushSettings, useSetPush } from './queries'
import { isSnoozed, snooze } from './remindLater'
import { useInstallAction } from './useInstallAction'

const GREEN = 'bg-[#15803D] shadow-[0_10px_22px_rgba(21,128,61,0.3)] hover:bg-[#14532D]'

/** What phone notifications cover in each app (decision Q10 of round 2). */
const COVERS: Record<AppKind, string> = {
  customer: 'Rider assigned, on the way, delivered and payment confirmed',
  partner: 'Orders admin assigns you and payouts',
}

/**
 * "Phone notifications" rows for a settings card (`mo-li` rows). Explains
 * why push is not possible when it is not (browser, iPhone outside the
 * installed app, blocked), so the switch never looks broken.
 */
export function PushSettingRows({ app, tone = 'blue' }: { app: AppKind; tone?: 'blue' | 'green' }) {
  const support = pushSupport()
  const settings = usePushSettings(support === 'supported')
  const save = useSetPush()
  const blocked = pushBlocked()
  const s = settings.data
  const enabled = Boolean(s?.enabled) && !blocked

  let note: string | null = null
  if (support === 'install-first') note = 'On iPhone, add the app to your home screen first, then turn them on here.'
  else if (support === 'unsupported') note = 'This browser cannot show notifications.'
  else if (blocked) note = 'Blocked for this site. Allow notifications in your browser settings.'

  return (
    <>
      <div className="mo-li">
        <span className="flex-1">
          <span className="block font-bold">Phone notifications</span>
          <span className="text-chip text-mute">{note ?? COVERS[app]}</span>
        </span>
        {!note && (
          <Toggle
            label="Phone notifications"
            tone={tone}
            checked={enabled}
            disabled={!s || save.isPending}
            onChange={(v) => save.mutate({ enabled: v, new_orders: v && Boolean(s?.new_orders) })}
          />
        )}
      </div>
      {app === 'partner' && enabled && (
        <div className="mo-li">
          <span className="flex-1">
            <span className="block font-bold">New orders near you</span>
            <span className="text-chip text-mute">Off by default: it can ring all day</span>
          </span>
          <Toggle
            label="New orders near you"
            tone={tone}
            checked={Boolean(s?.new_orders)}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ enabled: true, new_orders: v })}
          />
        </div>
      )}
      {settings.isError && <Notice tone="error" className="my-2">{errorMessage(settings.error)}</Notice>}
      {save.isError && <Notice tone="error" className="my-2">{errorMessage(save.error)}</Notice>}
    </>
  )
}

/**
 * "Turn on notifications" card for a dashboard. Shown only when push is
 * possible here and still off; "Not now" hides it for a week. Asking for
 * permission happens only when "Turn on" is tapped.
 */
function NotifyCard({ app, tone, className }: { app: AppKind; tone: 'blue' | 'green'; className?: string }) {
  const supported = pushSupport() === 'supported' && !pushBlocked()
  const settings = usePushSettings(supported)
  const save = useSetPush()
  const key = `push-${app}`
  const [hidden, setHidden] = useState(() => isSnoozed(key))
  if (!supported || hidden || !settings.data || settings.data.enabled) return null

  return (
    <Card pad className={cx('flex items-start gap-3', className)}>
      <IconBadge tone={tone === 'green' ? 'green' : 'blue'}>
        <BellIcon size={20} />
      </IconBadge>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <div className="text-[15px] font-extrabold">Turn on notifications</div>
          <div className="text-caption text-mute">{COVERS[app]}, even when the app is closed.</div>
        </div>
        {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            block={false}
            loading={save.isPending}
            className={cx('px-4', tone === 'green' && GREEN)}
            onClick={() => save.mutate({ enabled: true, new_orders: false })}
          >
            Turn on
          </Button>
          <button
            type="button"
            onClick={() => {
              snooze(key)
              setHidden(true)
            }}
            className="hit-44 cursor-pointer border-0 bg-transparent px-2 text-[13px] font-bold text-mute"
          >
            Not now
          </button>
        </div>
      </div>
    </Card>
  )
}

/**
 * The one app card a dashboard shows: "Install the app" while that is
 * possible and not put off, otherwise "Turn on notifications".
 */
export function HomeAppCard({ app, tone = 'blue', className }: { app: AppKind; tone?: 'blue' | 'green'; className?: string }) {
  const install = useInstallAction()
  const [installSnoozed] = useState(() => isSnoozed(`install-${app}`))
  if (install.available && !installSnoozed) return <InstallCard app={app} tone={tone} className={className} />
  return <NotifyCard app={app} tone={tone} className={className} />
}
