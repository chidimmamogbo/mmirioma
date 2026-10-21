import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import { AlertCircleIcon, EyeIcon, EyeOffIcon } from '../icons/icons'

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
 *
 * With `type="password"` it adds a Show/Hide button inside the field, so
 * people can check what they typed. The button only switches the input type;
 * the value, autofill and React Hook Form state are untouched.
 */
export function TextField({ label, optional, hint, error, className, id, ref, type, ...input }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
  const isPassword = type === 'password'
  const [shown, setShown] = useState(false)
  const control = (
    <input
      ref={ref}
      id={fieldId}
      type={isPassword && shown ? 'text' : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cx(INPUT, isPassword && 'pr-[52px]', error && 'border-[#DC2626] bg-[#FEF2F2]')}
      {...input}
    />
  )
  return (
    <div className={className}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      {isPassword ? (
        <div className="relative">
          {control}
          <button
            type="button"
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            aria-controls={fieldId}
            onClick={() => setShown((v) => !v)}
            className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-mute transition-colors duration-150 hover:bg-sky hover:text-primary-dark"
          >
            {shown ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
          </button>
        </div>
      ) : (
        control
      )}
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
