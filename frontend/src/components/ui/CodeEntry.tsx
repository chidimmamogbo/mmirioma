import { useEffect } from 'react'
import { cx } from '../../lib/cx'

interface CodeBoxesProps {
  /** Digits entered so far. */
  value: string
  /** Number of boxes (the delivery code has 6). */
  length?: number
  /** Wrong code: red boxes and a short shake (`.bad` + `.shake` in the design). */
  invalid?: boolean
  /** Box size; the rider screens use 48 × 58, the base `.otp` is 44 × 54. */
  size?: 'md' | 'lg'
  className?: string
}

/**
 * Read-only row of code boxes (`.otp`). Filled boxes are tinted blue, the next
 * empty box blinks. Screen readers get the whole state as one label.
 */
export function CodeBoxes({ value, length = 6, invalid = false, size = 'lg', className }: CodeBoxesProps) {
  const digits = value.split('')
  return (
    <div
      role="group"
      aria-label={`Code entered: ${value.length} of ${length} digits`}
      className={cx('flex justify-between gap-2', invalid && 'animate-shake', className)}
    >
      {Array.from({ length }, (_, i) => {
        const filled = i < digits.length
        const next = i === digits.length && !invalid
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cx(
              'box-border flex items-center justify-center rounded-input border-[1.5px] text-[22px] font-extrabold text-ink',
              size === 'lg' ? 'h-[58px] w-12' : 'h-[54px] w-11',
              invalid
                ? 'border-[#DC2626] bg-[#FEF2F2] text-red'
                : filled
                  ? 'border-primary bg-sky'
                  : next
                    ? 'blink border-primary bg-white'
                    : 'border-input-line bg-white',
            )}
          >
            {digits[i] ?? ''}
          </span>
        )
      })}
    </div>
  )
}

interface KeypadProps {
  value: string
  onChange: (value: string) => void
  /** Maximum digits; extra presses are ignored. */
  length?: number
  disabled?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'] as const

/**
 * The design's on-screen number pad (3 × 4, 54 px keys) for the delivery code.
 *
 * It also accepts the physical keyboard (digits, Backspace, Escape) so the
 * screen works with a keyboard and on desktop. The listener is added while the
 * keypad is mounted and enabled, and removed on unmount.
 */
export function Keypad({ value, onChange, length = 6, disabled = false }: KeypadProps) {
  useEffect(() => {
    if (disabled) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (/^\d$/.test(e.key)) {
        if (value.length < length) onChange(value + e.key)
      } else if (e.key === 'Backspace') {
        onChange(value.slice(0, -1))
      } else if (e.key === 'Escape') {
        onChange('')
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [value, onChange, length, disabled])

  function press(key: (typeof KEYS)[number]) {
    if (key === 'clear') onChange('')
    else if (key === 'delete') onChange(value.slice(0, -1))
    else if (value.length < length) onChange(value + key)
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => {
        const action = key === 'clear' || key === 'delete'
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-label={key === 'clear' ? 'Clear code' : key === 'delete' ? 'Delete digit' : key}
            onClick={() => press(key)}
            className={cx(
              'h-button cursor-pointer rounded-icon border-0 text-[22px] font-bold text-ink active:scale-[0.97]',
              'transition-transform duration-150',
              action ? 'bg-[#E8EEF6]' : 'bg-white',
            )}
          >
            {key === 'clear' ? 'C' : key === 'delete' ? '⌫' : key}
          </button>
        )
      })}
    </div>
  )
}
