import { Suspense, useId, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell'
import { LoadingBlock, LoadingScreen } from '../../components/layout/StateScreens'
import { Card } from '../../components/ui/Card'
import { Chip, SampleTag } from '../../components/ui/Chip'
import { INPUT } from '../../components/ui/Field'
import { ADMIN_STATUS_LABEL, type AdminOrderStatus, type AdminPaymentStatus } from '../../domain/admin'
import type { ApprovalStatus } from '../../domain/partner'
import { cx } from '../../lib/cx'
import { RequireRole } from '../auth/RequireRole'
import { APPROVAL_LABEL, APPROVAL_TONE, DETAIL_PANEL_ID, PAYMENT_LABEL, PAYMENT_TONE, STATUS_TONE } from './adminFormat'
import { useShellData } from './queries'

/** `/admin/*` layout route: staff only (RequireRole), each page loads on demand. */
export function AdminArea() {
  return (
    <RequireRole role="admin">
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    </RequireRole>
  )
}

/**
 * Every admin page's frame: the shell (logo, search, bell, profile, full
 * sidebar on every page, decision 17) with live badge counts.
 */
export function AdminFrame({
  searchPlaceholder,
  onSearch,
  children,
}: {
  /** Header search placeholder; each page searches its own records. */
  searchPlaceholder: string
  onSearch?: (query: string) => void
  children: ReactNode
}) {
  const shell = useShellData()
  return (
    <AdminShell
      searchPlaceholder={searchPlaceholder}
      onSearch={onSearch}
      user={shell.data?.user ?? { name: ' ', role: 'Staff' }}
      counts={shell.data?.counts}
      unread={shell.data?.unread}
    >
      {children}
    </AdminShell>
  )
}

/** Page title block (a-* pages): 26 px title, muted line, actions on the right. */
export function PageHead({ title, sub, actions, back, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode; className?: string }) {
  return (
    <div className={cx('rise-1 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {back}
        <h1 className="m-0 text-admin-title leading-[1.2] font-extrabold tracking-[-0.4px]">{title}</h1>
        {sub && <p className="mt-1 mb-0 text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  )
}

/** A white admin card with an optional title row. */
export function Panel({ title, action, sample, className, children }: { title?: ReactNode; action?: ReactNode; sample?: string; className?: string; children: ReactNode }) {
  return (
    <Card className={cx('flex min-w-0 flex-col gap-3 p-4', className)}>
      {(title || action || sample) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>}
          <div className="flex items-center gap-2">
            {sample && <SampleTag>{sample}</SampleTag>}
            {action}
          </div>
        </div>
      )}
      {children}
    </Card>
  )
}

export function StatusChip({ status }: { status: AdminOrderStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{ADMIN_STATUS_LABEL[status]}</Chip>
}

export function PaymentChip({ status }: { status: AdminPaymentStatus }) {
  return <Chip tone={PAYMENT_TONE[status]}>{PAYMENT_LABEL[status]}</Chip>
}

export function ApprovalChip({ status }: { status: ApprovalStatus }) {
  return <Chip tone={APPROVAL_TONE[status]}>{APPROVAL_LABEL[status]}</Chip>
}

/** Online or offline, as a word with the chip colour (never colour alone). */
export function OnlineChip({ online }: { online: boolean }) {
  return <Chip tone={online ? 'blue' : 'gray'}>{online ? 'Online' : 'Offline'}</Chip>
}

/** A labelled native select in the design's input style. */
export function SelectField({
  label,
  error,
  className,
  children,
  ...rest
}: { label: ReactNode; error?: string; className?: string; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-bold">
        {label}
      </label>
      <select id={id} aria-invalid={error ? true : undefined} className={cx(INPUT, 'cursor-pointer', error && 'border-[#DC2626] bg-[#FEF2F2]')} {...rest}>
        {children}
      </select>
      {error && (
        <p role="alert" className="mt-1.5 mb-0 text-caption font-bold text-red">
          {error}
        </p>
      )}
    </div>
  )
}

/** Loading state sized for a panel. */
export function PanelLoading({ label }: { label: string }) {
  return (
    <Card className="p-4">
      <LoadingBlock label={label} />
    </Card>
  )
}

/** The design's two-column page: main content and a sticky side panel on wide screens. */
export function SplitLayout({ main, side, sideWidth = 'lg:w-[360px]' }: { main: ReactNode; side: ReactNode; sideWidth?: string }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">{main}</div>
      <aside id={DETAIL_PANEL_ID} className={cx('flex w-full shrink-0 scroll-mt-4 flex-col gap-3 lg:sticky lg:top-4', sideWidth)}>
        {side}
      </aside>
    </div>
  )
}

/** Pill tabs that are links (a-pricing: Pricing · Loyalty points · Payouts and payments). */
export function LinkTabs({ label, tabs, className }: { label: string; tabs: { to: string; label: string }[]; className?: string }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label={label} className={cx('flex flex-wrap gap-2', className)}>
      {tabs.map((t) => {
        const on = pathname === t.to
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={on ? 'page' : undefined}
            className={cx('mo-pill hit-44 no-underline', on ? 'border-0 bg-ink text-white hover:text-white' : 'border-[1.5px] border-solid border-line bg-white text-slate hover:border-primary hover:text-ink')}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * A naira amount input that holds integer kobo (SRS §5): the person types
 * whole naira ("25,000"), the value is kobo. Empty is `null`.
 */
export function NairaInput({ label, value, onChange, className }: { label: string; value: number | null; onChange: (kobo: number | null) => void; className?: string }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      className={cx(INPUT, 'w-full max-w-36', className)}
      value={value === null ? '' : (value / 100).toLocaleString('en-NG')}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '')
        onChange(digits === '' ? null : Number(digits) * 100)
      }}
    />
  )
}
