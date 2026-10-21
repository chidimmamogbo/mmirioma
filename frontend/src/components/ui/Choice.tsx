import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { CheckIcon } from '../icons/icons'

interface OptionTileProps {
  /** Whether this option is chosen: `aria-pressed`, blue border, tint, shadow and (by default) a tick. */
  selected: boolean
  onSelect: () => void
  /**
   * Show the blue tick when selected. Most tiles do; a few design tiles (the
   * can count) show selection with the border, tint and shadow only.
   */
  tick?: boolean
  /** Show the empty ring top-right when not selected (`.ring`), as some screens do. */
  showRing?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * The design's `.opt` option tile (jerrycan size, can count, tank type...).
 * A toggle button with `aria-pressed`; group several inside a `<fieldset>`
 * with a `<legend>` so screen readers hear the question.
 */
export function OptionTile({
  selected,
  onSelect,
  tick = true,
  showRing = false,
  disabled = false,
  className,
  style,
  children,
}: OptionTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      style={style}
      className={cx(
        'mo-opt',
        selected && 'border-primary bg-sky shadow-selected',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {selected && tick ? (
        <span className="absolute top-2 right-2 flex size-[22px] items-center justify-center rounded-full bg-primary text-white">
          <CheckIcon size={12} strokeWidth={3.4} color="#fff" roundJoin={false} />
        </span>
      ) : (
        !selected &&
        showRing && (
          <span className="absolute top-2 right-2 size-5 rounded-full border-2 border-ring-line" aria-hidden="true" />
        )
      )}
      {children}
    </button>
  )
}

/** The design's `.radio` circle (visual only; the row carries the radio role). */
export function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'box-border size-[22px] shrink-0 rounded-full bg-white',
        on ? 'border-[7px] border-primary' : 'border-2 border-radio-line',
      )}
    />
  )
}

interface RadioRowProps {
  checked: boolean
  onSelect: () => void
  className?: string
  children: ReactNode
}

/**
 * A selectable row with a radio dot (saved addresses, eligible riders, save
 * address options). Use inside an element with `role="radiogroup"`.
 */
export function RadioRow({ checked, onSelect, className, children }: RadioRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cx(
        'box-border flex w-full cursor-pointer items-center gap-2.5 rounded-icon border-2 px-3 py-2.5 text-left text-ink',
        checked ? 'border-primary bg-sky' : 'border-line bg-white hover:border-[#93C5FD]',
        className,
      )}
    >
      <RadioDot on={checked} />
      {children}
    </button>
  )
}
