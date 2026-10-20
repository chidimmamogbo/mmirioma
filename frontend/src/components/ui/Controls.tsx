import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'

export interface ControlOption<T extends string> {
  value: T
  label: ReactNode
}

interface GroupProps<T extends string> {
  /** Accessible name of the group, e.g. "Filter orders". */
  label: string
  options: ControlOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * The design's segmented control (`.seg` / `.sbtn`): grey track, the chosen
 * segment is solid blue. Used for filters inside one view (tabs pattern).
 */
export function Segmented<T extends string>({ label, options, value, onChange, className }: GroupProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('grid rounded-icon bg-segment p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'hit-44 h-10 cursor-pointer rounded-segment border-0 text-[14px] font-bold transition-colors duration-200',
              on ? 'bg-primary text-white shadow-segment' : 'bg-transparent text-gray',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The sign-in / create-account switch. Each side is a link to its own route.
 * `white` (sign-in screen): light track, current page is a raised white pill.
 * `blue` (create-account screen): segmented track, current page is solid blue.
 */
export function PageTabs({
  label,
  tabs,
  variant = 'white',
}: {
  label: string
  tabs: { to: string; label: string; current: boolean }[]
  variant?: 'white' | 'blue'
}) {
  return (
    <div role="tablist" aria-label={label} className={cx('grid grid-cols-2 rounded-icon p-1', variant === 'white' ? 'bg-tablist' : 'bg-segment')}>
      {tabs.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          role="tab"
          aria-selected={t.current}
          aria-current={t.current ? 'page' : undefined}
          className={cx(
            'flex h-10 items-center justify-center rounded-segment font-bold no-underline',
            variant === 'white' && t.current && 'bg-white text-ink shadow-[0_2px_8px_rgba(10,37,64,0.1)] hover:text-ink',
            variant === 'white' && !t.current && 'text-mute hover:text-ink',
            variant === 'blue' && t.current && 'bg-primary text-[14px] text-white shadow-segment hover:text-white',
            variant === 'blue' && !t.current && 'text-[14px] text-gray hover:text-ink',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

/**
 * The design's `.pill` filter chips: white with a border, chosen pill is solid
 * ink. `wrap={false}` keeps them on one line that scrolls sideways (c-orders).
 */
export function Pills<T extends string>({ label, options, value, onChange, className, wrap = true }: GroupProps<T> & { wrap?: boolean }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('flex gap-2', wrap ? 'flex-wrap' : 'overflow-x-auto pb-0.5 [scrollbar-width:none]', className)}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'mo-pill hit-44 shrink-0',
              on ? 'border-0 bg-ink text-white' : 'border-[1.5px] border-line bg-white text-slate',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name, e.g. "SMS updates". */
  label: string
  /** On colour: blue for settings, green for the rider "online" switch. */
  tone?: 'blue' | 'green'
  disabled?: boolean
}

/**
 * The design's 50 × 30 switch. The knob moves with `transform` (the design
 * animated `left`), so only transform is animated.
 */
export function Toggle({ checked, onChange, label, tone = 'blue', disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'hit-44 relative h-[30px] w-[50px] shrink-0 cursor-pointer rounded-[15px] border-0 transition-colors duration-[250ms]',
        checked ? (tone === 'green' ? 'bg-green-solid' : 'bg-primary') : 'bg-[#CBD5E1]',
      )}
    >
      <ToggleKnob checked={checked} />
    </button>
  )
}

/** Knob of the switch; also used inside larger switch rows such as "You are online". */
export function ToggleKnob({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)]',
        'transition-transform duration-[250ms] ease-[ease]',
        checked && 'translate-x-5',
      )}
    />
  )
}
