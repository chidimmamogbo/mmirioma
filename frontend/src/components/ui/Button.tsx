import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { buttonClasses, type ButtonStyleProps } from './buttonClasses'

interface ButtonProps extends ButtonStyleProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /**
   * Shows that an action is running. The label stays (so the width does not
   * jump), clicks are blocked and `aria-busy` is set (NFR-022).
   */
  loading?: boolean
  /** Passed to the `<button>` (React 19 ref-as-prop), e.g. to focus it. */
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

/** The design's `.btn` as a `<button>`. Defaults to `type="button"`. */
export function Button({
  variant,
  size,
  block,
  className,
  loading = false,
  disabled,
  type = 'button',
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const inactive = Boolean(disabled) || loading
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className, disabled: Boolean(disabled) })}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={inactive ? undefined : onClick}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends ButtonStyleProps, Omit<LinkProps, 'className'> {
  children: ReactNode
}

/** The design's `.btn` as a router link (most design buttons navigate). */
export function ButtonLink({ variant, size, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
    </Link>
  )
}

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The design's `.btn` as a link that leaves the app (maps directions, phone
 * dialer). Opens in a new tab for web URLs.
 */
export function ExternalButton({
  href,
  variant,
  size,
  block,
  className,
  children,
}: ButtonStyleProps & { href: string; children: ReactNode }) {
  const web = href.startsWith('http')
  return (
    <a
      href={href}
      target={web ? '_blank' : undefined}
      rel={web ? 'noopener noreferrer' : undefined}
      className={buttonClasses({ variant, size, block, className })}
    >
      {children}
    </a>
  )
}
