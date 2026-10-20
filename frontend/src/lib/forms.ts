/**
 * Form helpers shared by React Hook Form + Zod screens.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from './api/client'
import { normalizeNigerianPhone } from './format/phone'

/** Message the auth design uses for a bad phone number (docs/api/auth.md). */
export const PHONE_MESSAGE = 'Enter a Nigerian mobile number, for example 0803 123 4567.'

/** A Nigerian mobile number in any accepted input form. */
export const phoneField = z
  .string()
  .trim()
  .min(1, 'Enter your phone number.')
  .refine((v) => normalizeNigerianPhone(v) !== null, PHONE_MESSAGE)

/** New password rule from the auth contract: 8 to 128 characters, no composition rules. */
export const newPasswordField = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use 128 characters or fewer.')

/** Optional email; empty text means "no email". */
export const optionalEmailField = z
  .string()
  .trim()
  .max(254, 'This email is too long.')
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address, like you@example.com.')

/**
 * Put a backend `validation_error` (details `[{loc, msg}]`) on the matching
 * form fields. `loc` is like `["body", "phone"]`; `fields` maps API field
 * names to form field names where they differ.
 *
 * @returns true if at least one field error was set.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: Record<string, Path<T>>,
): boolean {
  if (!(error instanceof ApiError) || error.code !== 'validation_error' || !Array.isArray(error.details)) return false
  let applied = false
  for (const d of error.details as { loc?: unknown[]; msg?: string }[]) {
    const name = typeof d.loc?.at(-1) === 'string' ? (d.loc.at(-1) as string) : null
    const field = name ? fields[name] : undefined
    if (field) {
      setError(field, { type: 'server', message: d.msg ?? 'Check this field.' })
      applied = true
    }
  }
  return applied
}

/** Seconds to wait from a 429 `too_many_attempts` error, if present. */
export function retryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== 'too_many_attempts') return null
  const details = error.details as { retry_after_seconds?: unknown } | null
  return typeof details?.retry_after_seconds === 'number' ? details.retry_after_seconds : null
}
