import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import { AlertCircleIcon } from '../icons/icons'

/** Classes of the design's `.in` input. */
export const INPUT = 'mo-in'

interface FieldShellProps {
  label: ReactNode
  /** Shows "(optional)" after the label in muted text, as the design does. */
  optional?: boolean
  /** Helper text under the control. */
  hint?: ReactNode
  /** Error text; also marks the control invalid and links it with aria-describedby. */
  error?: string
}

function FieldMessages({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 mb-0 text-caption text-mute">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 mb-0 flex items-center gap-1.5 text-caption font-bold text-red">
          <AlertCircleIcon size={16} />
          {error}
        </p>
      )}
    </>
  )
}

function Label({ htmlFor, label, optional }: { htmlFor: string; label: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-label font-bold">
      {label}
      {optional && <span className="font-normal text-mute"> (optional)</span>}
    </label>
  )
}

type TextFieldProps = FieldShellProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    ref?: Ref<HTMLInputElement>
    className?: string
  }

/**
 * Labelled text input (`.lbl` + `.in`). Works with React Hook Form's
 * `register()`, which passes `ref`, `name`, `onChange` and `onBlur`.
 */
export function TextField({ label, optional, hint, error, className, id, ref, ...input }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  return (
    <div className={className}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(INPUT, error && 'border-[#DC2626] bg-[#FEF2F2]')}
        {...input}
      />
      <FieldMessages id={fieldId} hint={hint} error={error} />
    </div>
  )
}

type TextAreaFieldProps = FieldShellProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    ref?: Ref<HTMLTextAreaElement>
    className?: string
  }

/** Labelled multi-line input with the same look as `.in`. */
export function TextAreaField({ label, optional, hint, error, className, id, ref, ...input }: TextAreaFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  return (
    <div className={className}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(INPUT, 'h-auto min-h-[96px] resize-y py-3', error && 'border-[#DC2626] bg-[#FEF2F2]')}
        {...input}
      />
      <FieldMessages id={fieldId} hint={hint} error={error} />
    </div>
  )
}
