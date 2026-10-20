import type { ReactNode } from 'react'

/** Props shared by every design icon. */
export interface IconProps {
  /** Width and height in px. The design uses 14 to 32; most icons are 20 or 22. */
  size?: number
  /** Stroke width as drawn in the design for this use (2, 2.2, 2.4 or 2.6). */
  strokeWidth?: number
  /**
   * Fill the shape with the current colour instead of stroking it. The design
   * does this for active tab icons and rating stars.
   */
  filled?: boolean
  /**
   * Draw joins round. Most design icons do; a few uses leave joins at the SVG
   * default (miter), so this can be turned off per use.
   */
  roundJoin?: boolean
  /** Colour; defaults to the text colour (`currentColor`). */
  color?: string
  className?: string
  /** Accessible name. Without it the icon is decorative and hidden from assistive tech. */
  label?: string
}

/**
 * Base 24 × 24 icon wrapper matching the attributes used throughout the design
 * handoff: `fill="none"`, round line caps, round joins and `currentColor`.
 */
export function Icon({
  size = 20,
  strokeWidth = 2,
  filled = false,
  roundJoin = true,
  color = 'currentColor',
  className,
  label,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? undefined : color}
      strokeWidth={filled ? undefined : strokeWidth}
      strokeLinecap={filled ? undefined : 'round'}
      strokeLinejoin={filled || !roundJoin ? undefined : 'round'}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  )
}
