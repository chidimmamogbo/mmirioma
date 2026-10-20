import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** Chip colours from the design (`.c-blue`, `.c-green`, ...). */
export type ChipTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray' | 'gold'


interface ChipProps {
  tone?: ChipTone
  /** Optional leading icon. Status chips always pair colour with words. */
  icon?: ReactNode
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** The design's `.chip`: 12 px bold pill, 5 × 10 padding. */
export function Chip({ tone = 'blue', icon, className, style, children }: ChipProps) {
  return (
    <span
      className={cx(
        'mo-chip',
        `mo-chip-${tone}`,
        className,
      )}
      style={style}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * The design's gold `.sample` tag. Every sample naira amount, points value or
 * earning must sit next to one ("SAMPLE PRICES", "SAMPLE DATA", ...).
 */
export function SampleTag({ children = 'SAMPLE', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'rounded-sample bg-gold-tint px-1.5 py-0.5 text-sample font-extrabold tracking-[0.4px] text-gold-ink',
        className,
      )}
    >
      {children}
    </span>
  )
}
