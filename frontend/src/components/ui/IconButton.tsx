import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'

interface IconButtonBaseProps {
  /** Accessible name; icon buttons have no visible text. */
  label: string
  /** `soft` is the sky-tinted `.ib.soft`; `plain` is transparent. */
  tone?: 'plain' | 'soft'
  /** Red unread dot in the top-right corner (`.dot`). */
  dot?: boolean
  className?: string
  children: ReactNode
}

function classes(tone: 'plain' | 'soft', className?: string) {
  // `relative` anchors the unread dot. Skip it when the caller positions the
  // button itself (e.g. `absolute` in a corner), or the two would conflict.
  const positioned = /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className ?? '')
  return cx(
    !positioned && 'relative',
    'mo-ib',
    tone === 'soft' ? 'mo-ib-soft' : 'mo-ib-plain',
    className,
  )
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-[9px] right-[10px] size-[9px] rounded-full border-2 border-white bg-red-solid"
    />
  )
}

/** The design's 44 × 44 `.ib` icon button, as a router link. */
export function IconLink({ label, tone = 'plain', dot, className, children, to }: IconButtonBaseProps & { to: string }) {
  return (
    <Link to={to} aria-label={label} className={classes(tone, className)}>
      {children}
      {dot && <Dot />}
    </Link>
  )
}

/** The design's 44 × 44 `.ib` icon button, as a `<button>`. */
export function IconButton({
  label,
  tone = 'plain',
  dot,
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonBaseProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button type={type} aria-label={label} className={classes(tone, className)} {...rest}>
      {children}
      {dot && <Dot />}
    </button>
  )
}
