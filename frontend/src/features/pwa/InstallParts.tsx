import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CloseIcon, DownloadIcon } from '../../components/icons/icons'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { IconBadge, MenuItem } from '../../components/ui/Content'
import { cx } from '../../lib/cx'
import { APP_NAME, type AppKind } from './manifest'
import { isSnoozed, snooze } from './remindLater'
import { useInstallAction } from './useInstallAction'

/** Green buttons for the tanker driver app, as on its other screens. */
const GREEN = 'bg-[#15803D] shadow-[0_10px_22px_rgba(21,128,61,0.3)] hover:bg-[#14532D]'

/**
 * iPhone and iPad how-to (Safari has no install prompt): three steps to add
 * the app to the home screen. A modal dialog; Escape or the close button
 * closes it.
 */
export function InstallHowToSheet({ app, onClose }: { app: AppKind; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // Move focus into the dialog and close it on Escape.
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-[rgba(10,37,64,.55)]" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-howto-title"
        className="animate-sheet relative flex w-full max-w-[440px] flex-col gap-3 rounded-t-[28px] bg-white px-5 pt-2.5 pb-[max(22px,env(safe-area-inset-bottom))] text-ink shadow-[0_-16px_40px_rgba(10,37,64,0.25)] outline-none"
      >
        <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-[3px] bg-input-line" />
        <div className="flex items-center justify-between gap-3">
          <h2 id="install-howto-title" className="m-0 text-[19px] font-extrabold">
            Add {APP_NAME[app]} to your home screen
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="mo-ib shrink-0 cursor-pointer border-0 bg-transparent text-ink">
            <CloseIcon size={20} />
          </button>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px]">
          <HowToStep n={1}>
            Tap <b>Share</b> <ShareGlyph /> in Safari's toolbar.
          </HowToStep>
          <HowToStep n={2}>
            Scroll down and tap <b>Add to Home Screen</b>.
          </HowToStep>
          <HowToStep n={3}>
            Tap <b>Add</b>. Open {APP_NAME[app]} from its icon, like any app.
          </HowToStep>
        </ol>
        <Button onClick={onClose}>Got it</Button>
      </div>
    </div>
  )
}

function HowToStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky text-[13px] font-extrabold text-primary">{n}</span>
      <span className="pt-[3px] leading-[1.45]">{children}</span>
    </li>
  )
}

/** Safari's share icon (box with an arrow up), so people know what to look for. */
function ShareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline align-[-2px] text-primary">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

/**
 * "Install the app" card for a dashboard (decision Q8). Hidden once
 * installed, when the browser cannot install, or for a week after "Not now".
 */
export function InstallCard({ app, tone = 'blue', className }: { app: AppKind; tone?: 'blue' | 'green'; className?: string }) {
  const action = useInstallAction()
  const key = `install-${app}`
  const [hidden, setHidden] = useState(() => isSnoozed(key))
  if (hidden || !action.available) return null

  return (
    <>
      <Card pad className={cx('flex items-start gap-3', className)}>
        <IconBadge tone={tone === 'green' ? 'green' : 'blue'}>
          <DownloadIcon size={20} />
        </IconBadge>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <div className="text-[15px] font-extrabold">Install the {APP_NAME[app]} app</div>
            <div className="text-caption text-mute">Open it from your home screen, like any app. No app store needed.</div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" block={false} className={cx('px-4', tone === 'green' && GREEN)} onClick={() => void action.install()}>
              Install
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
      {action.howToOpen && <InstallHowToSheet app={app} onClose={action.closeHowTo} />}
    </>
  )
}

/** "Install the app" row for the drawer menus. Hidden once installed or when the browser cannot install. */
export function InstallMenuItem({ app }: { app: AppKind }) {
  const action = useInstallAction()
  if (!action.available) return null
  return (
    <>
      <MenuItem icon={<DownloadIcon size={20} />} onClick={() => void action.install()}>
        Install the app
      </MenuItem>
      {action.howToOpen && <InstallHowToSheet app={app} onClose={action.closeHowTo} />}
    </>
  )
}
