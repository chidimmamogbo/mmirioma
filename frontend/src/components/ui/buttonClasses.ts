import { cx } from '../../lib/cx'

/**
 * `.btn` variants: primary (blue), alt (sky tint), line (white with border),
 * plus danger (solid red) and line-danger (white with red text) for
 * destructive actions such as deleting an account or logging out.
 */
export type ButtonVariant = 'primary' | 'alt' | 'line' | 'danger' | 'line-danger'
/** `md` is the 54 px main button; `sm` is the 42 px `.btn.sm`. */
export type ButtonSize = 'md' | 'sm'

export interface ButtonStyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Full width (the design default for mobile). Set false for inline admin buttons. */
  block?: boolean
  className?: string
}

/**
 * Classes for the design button, so links and buttons look identical. Base
 * and colours come from the components layer (styles/components.css), so a
 * screen's `className` can always override them.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = true,
  className,
  disabled = false,
}: ButtonStyleProps & { disabled?: boolean }): string {
  return cx(
    'mo-btn',
    size === 'sm' && 'mo-btn-sm hit-44',
    block && 'w-full',
    disabled ? 'mo-btn-disabled' : `mo-btn-${variant}`,
    className,
  )
}
