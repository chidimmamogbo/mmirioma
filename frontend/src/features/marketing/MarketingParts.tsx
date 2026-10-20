import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { InstallHowToSheet } from '../pwa/InstallParts'
import { appFor, type AppKind } from '../pwa/manifest'
import { useInstallAction } from '../pwa/useInstallAction'
import { CONTACT, NAV_LINKS } from './content'
import { MailIcon, MenuBarsIcon, PhoneIcon, PinIcon } from './icons'

/**
 * A marketing image: WebP with the PNG or JPG fallback, fixed size to stop
 * layout shift, lazy unless it is the hero (README "Images").
 */
export function Pic({
  name,
  fallback = 'png',
  width,
  height,
  alt = '',
  className,
  eager = false,
}: {
  /** File name in public/marketing without extension. */
  name: string
  fallback?: 'png' | 'jpg'
  width: number
  height: number
  alt?: string
  className?: string
  /** The first picture on the page: load now, at high priority. */
  eager?: boolean
}) {
  return (
    // `contents` lets the <img> sit in the parent's grid or flex layout
    // directly; the <source> is hidden so it never takes a grid cell itself.
    <picture className="contents">
      <source srcSet={`/marketing/${name}.webp`} type="image/webp" className="hidden" />
      <img
        src={`/marketing/${name}.${fallback}`}
        width={width}
        height={height}
        alt={alt}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  )
}

/** The app's horizontal logo (public/brand), light or dark. */
export function BrandLogo({ dark = false, className }: { dark?: boolean; className?: string }) {
  const base = `/brand/logo-horizontal${dark ? '-dark' : ''}`
  return (
    <picture className="contents">
      <source srcSet={`${base}@1x.webp 1x, ${base}@2x.webp 2x, ${base}@3x.webp 3x`} type="image/webp" className="hidden" />
      <img src={`${base}@2x.png`} alt="MmiriOma" width={207} height={48} className={cx('block w-auto', className)} />
    </picture>
  )
}

/** Uppercase eyebrow label above a section title; `navy` for the dark drivers banner. */
export function Kicker({ children, navy = false, className }: { children: ReactNode; navy?: boolean; className?: string }) {
  return (
    <p className={cx('m-0 text-[13px] font-bold tracking-[2px] uppercase', navy ? 'text-mk-kicker-navy' : 'text-mk-kicker', className)}>{children}</p>
  )
}

/** Centred kicker, h2 and lead line used at the top of most sections. */
export function SectionHead({ kicker, title, lead, className }: { kicker: string; title: ReactNode; lead?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-2.5 text-center', className)}>
      <Kicker>{kicker}</Kicker>
      <h2 className="m-0 font-display text-[clamp(30px,3.8vw,44px)] leading-[1.15] font-extrabold tracking-[-1px] text-ink">{title}</h2>
      {lead && <p className="m-0 max-w-[620px] text-[17px] leading-[1.6] text-slate">{lead}</p>}
    </div>
  )
}

/** Teal "Oma" inside headings like "How MmiriOma Works". */
export function Oma() {
  return (
    <>
      Mmiri<span className="text-mk-teal">Oma</span>
    </>
  )
}

/**
 * Site header (landing and FAQ). Below 960 px the links move into a menu
 * panel under the header; below 600 px "Order Water" moves into it too.
 * The panel closes on a link tap, on Escape and on any navigation, and the
 * page behind it does not scroll while it is open (README "Behaviour").
 */
export function MarketingHeader({ current }: { current: 'home' | 'faq' }) {
  const location = useLocation()
  // The menu belongs to the location it was opened on, so any navigation
  // (a link, Back) closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.key

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isCurrent = (to: string) => (current === 'faq' ? to === '/faq' : to === '/')

  return (
    <header className="relative z-[5] border-0 border-b border-solid border-[#E6EEF7] bg-white">
      <div className="mk-wrap flex min-h-[76px] items-center justify-between gap-6">
        <Link to="/" aria-label="MmiriOma home" className="flex shrink-0 items-center">
          <BrandLogo className="h-11" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-[30px] text-[15px] font-medium max-[960.98px]:hidden">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              aria-current={isCurrent(l.to) ? 'page' : undefined}
              className={cx(
                'inline-flex min-h-11 items-center no-underline',
                isCurrent(l.to) ? 'font-bold text-primary hover:text-primary' : 'text-slate hover:text-ink',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            to="/order"
            className="inline-flex min-h-[46px] items-center rounded-[10px] bg-primary px-6 text-[15px] font-semibold whitespace-nowrap text-white no-underline hover:bg-primary-dark hover:text-white max-[600.98px]:hidden"
          >
            Order Water
          </Link>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mk-mobile-menu"
            onClick={() => setOpenOn(open ? null : location.key)}
            className="hidden size-[46px] cursor-pointer items-center justify-center rounded-[10px] border border-solid border-input-line bg-white text-ink max-[960.98px]:inline-flex"
          >
            <MenuBarsIcon />
          </button>
        </div>
      </div>
      {open && (
        <nav id="mk-mobile-menu" aria-label="Mobile" className="border-0 border-t border-solid border-[#E6EEF7] bg-white">
          <div className="mk-wrap flex flex-col pt-2 pb-4">
            {NAV_LINKS.map((l, i) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpenOn(null)}
                aria-current={isCurrent(l.to) ? 'page' : undefined}
                className={cx(
                  'flex min-h-12 items-center font-semibold text-ink no-underline hover:text-primary',
                  i < NAV_LINKS.length - 1 && 'border-0 border-b border-solid border-[#EEF3F9]',
                )}
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/order"
              onClick={() => setOpenOn(null)}
              className="mt-3 flex min-h-[50px] items-center justify-center rounded-[10px] bg-primary font-bold text-white no-underline hover:bg-primary-dark hover:text-white"
            >
              Order Water
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}

const FOOT_LINK = 'text-mk-foot-text no-underline hover:text-white'

function FootColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-3 text-[15px]">
      <p className="m-0 mb-1 font-bold text-white">{label}</p>
      {children}
    </nav>
  )
}

/**
 * Site footer. `full` is the landing page's (five columns, rises 36 px under
 * the rounded section above it); `short` is the FAQ page's. Social icons stay
 * hidden until the real profile links exist.
 */
export function MarketingFooter({ variant }: { variant: 'full' | 'short' }) {
  const full = variant === 'full'
  return (
    <footer className={cx('bg-mk-navy text-mk-foot-text', full && 'mt-[-36px] pt-9')}>
      <div className="mk-wrap flex flex-col gap-12 pt-16 pb-7">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-x-8 gap-y-10">
          <div className="mk-foot-brand flex max-w-[360px] min-w-0 flex-col gap-[18px]">
            <BrandLogo dark className="h-[46px] self-start" />
            <p className="m-0 text-[15px] leading-[1.65]">MmiriOma delivers water to homes, offices and businesses across Enugu. Water at your gate.</p>
          </div>
          <FootColumn label="Quick Links">
            {(full ? NAV_LINKS : NAV_LINKS.filter((l) => l.to === '/' || l.to === '/faq')).map((l) => (
              <Link key={l.label} to={l.to} className={FOOT_LINK}>
                {l.label}
              </Link>
            ))}
          </FootColumn>
          <FootColumn label="Legal">
            <Link to="/terms" className={FOOT_LINK}>
              Terms of Service
            </Link>
            <Link to="/privacy" className={FOOT_LINK}>
              Privacy Policy
            </Link>
            {full && (
              <Link to="/privacy#cookies" className={FOOT_LINK}>
                Cookie Policy
              </Link>
            )}
          </FootColumn>
          {full && (
            <FootColumn label="Account">
              <Link to="/order" className={FOOT_LINK}>
                Order Water
              </Link>
              <Link to="/partner/signup" className={FOOT_LINK}>
                Become a Rider or Driver
              </Link>
              <Link to="/admin/login" className={FOOT_LINK}>
                Staff Login
              </Link>
            </FootColumn>
          )}
          <div className={cx('flex flex-col text-[15px]', full ? 'gap-3.5' : 'gap-3')}>
            <p className="m-0 mb-1 font-bold text-white">Contact</p>
            <span className="flex items-center gap-2.5">
              {full && <PinIcon size={16} className="shrink-0 text-white" />}
              {CONTACT.place}
            </span>
            <a href={`mailto:${CONTACT.email}`} className={cx(FOOT_LINK, 'flex items-center gap-2.5')}>
              {full && <MailIcon className="shrink-0 text-white" />}
              {CONTACT.email}
            </a>
            <a href={CONTACT.phoneHref} className={cx(FOOT_LINK, 'flex items-center gap-2.5')}>
              {full && <PhoneIcon className="shrink-0 text-white" />}
              {CONTACT.phoneLabel}
            </a>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-0 border-t border-solid border-mk-foot-rule pt-6 text-[14px] text-mk-foot-muted">
          <span>© 2026 MmiriOma. All rights reserved.</span>
          <span>Water at your gate.</span>
        </div>
      </div>
    </footer>
  )
}

/** Where "Install …" goes when this browser cannot show the install prompt (README link map). */
const FALLBACK: Record<AppKind, string> = { customer: '/signin', partner: '/partner/login' }
/** Where "Open app" goes once installed. */
const APP_HOME: Record<AppKind, string> = { customer: '/app', partner: '/partner/' }

/**
 * "Install Customer App" / "Install Driver App" (decisions Q2 and Q3).
 *
 * - The page's own app (the customer app on these pages): shows the browser's
 *   prompt, or the iPhone how-to; with neither, goes to sign-in.
 * - The partner app: a page can only install the app its manifest names, so
 *   this opens the partner login with a full page load; that page carries the
 *   partner manifest and its own install card.
 * - Already running as the installed app: "Open app".
 */
export function InstallAppButton({ app, children, className }: { app: AppKind; children: ReactNode; className: string }) {
  const action = useInstallAction()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (action.standalone || action.installed) {
    return (
      <Link to={APP_HOME[app]} className={className}>
        Open app
      </Link>
    )
  }

  async function onClick() {
    if (appFor(pathname) !== app) {
      window.location.assign(FALLBACK[app])
      return
    }
    if (!(await action.install())) navigate(FALLBACK[app])
  }

  return (
    <>
      <button type="button" onClick={() => void onClick()} className={cx('cursor-pointer border-0', className)}>
        {children}
      </button>
      {action.howToOpen && <InstallHowToSheet app={app} onClose={action.closeHowTo} />}
    </>
  )
}
