/**
 * Wording and formatting for the admin cash screens (K3 to K5,
 * docs/design/admin-cash.md). Labels are the approved design's
 * (cash-remittance.md, "Labels proposed"); nothing here computes a payment
 * status: the server sets it at receipt (payments.md, decision 2).
 */
import { ApiError } from '../../lib/api/client'
import { errorMessage } from '../../lib/api/errorMessage'
import { formatDayDate } from '../../lib/format/datetime'
import type { AdminCashCollection, CashDay } from './adminApi'

const KOBO_PER_NAIRA = 100
const MINUS = '−'
const LAGOS_OFFSET_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const withKobo = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Integer kobo as naira **with kobo**, e.g. `650000` → `₦6,500.00`. Cash
 * screens always show kobo because cash must match to the kobo (approved
 * design); the rest of the admin app uses `formatNaira`.
 *
 * @throws RangeError if `kobo` is not a safe integer.
 */
export function formatCash(kobo: number): string {
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`Money must be integer kobo, got ${kobo}`)
  return `${kobo < 0 ? MINUS : ''}₦${withKobo.format(Math.abs(kobo) / KOBO_PER_NAIRA)}`
}

/** The custody status label of a record (approved "Labels proposed"). */
export function custodyLabel(row: Pick<AdminCashCollection, 'status' | 'received_by'>): string {
  switch (row.status) {
    case 'collected':
      return 'Collected by driver'
    case 'awaiting_remittance':
      return 'Ready to hand over'
    case 'remitted':
      return row.received_by ? `Received by ${row.received_by.name}` : 'Received'
    case 'reconciled':
      return 'Reconciled'
  }
}

/**
 * The payment line K5 shows for a received record, from what the server set
 * at receipt: "Paid · Matches the amount due", "Part paid · ₦2,500.00
 * outstanding" or "Paid · More than due: review ₦5,000.00".
 */
export function paymentAtReceipt(row: Pick<AdminCashCollection, 'payment_status' | 'outstanding_balance_minor_units' | 'overpaid_minor_units'>): string {
  if (row.payment_status === 'partially_paid') return `Part paid · ${formatCash(row.outstanding_balance_minor_units)} outstanding`
  if (row.payment_status === 'paid' && row.overpaid_minor_units > 0) return `Paid · More than due: review ${formatCash(row.overpaid_minor_units)}`
  if (row.payment_status === 'paid') return 'Paid · Matches the amount due'
  return 'Pay on delivery'
}

/** Today's Lagos calendar date, `YYYY-MM-DD`. Lagos is UTC+1 all year. */
export function lagosDate(now = new Date()): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10)
}

/** A calendar date moved by whole days, `YYYY-MM-DD` (no time zone involved). */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** "Mon, 26 Oct 2026" for a Lagos calendar date (noon, so it never rolls over). */
export function formatCashDay(date: string): string {
  return formatDayDate(`${date}T12:00:00+01:00`)
}

/** `true` for a valid `YYYY-MM-DD` the page can ask for. */
export function isCalendarDate(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/** The five K3 figures, in the approved order. */
export function cashFigures(totals: CashDay['totals']): { label: string; value: string }[] {
  return [
    { label: 'Recorded by drivers', value: formatCash(totals.recorded_minor_units) },
    { label: 'Received', value: formatCash(totals.received_minor_units) },
    { label: 'Reconciled', value: formatCash(totals.reconciled_minor_units) },
    { label: 'Still with drivers', value: formatCash(totals.with_drivers_minor_units) },
    { label: 'Differences', value: String(totals.differences) },
  ]
}

/** The record list changed under the administrator (409 `cash_collection_changed`). */
export function isCashChanged(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'cash_collection_changed'
}

/**
 * The message a cash screen shows for a failed action, in the approved
 * wording where the design gives one ("changed meanwhile", "security check
 * failed"); otherwise the server's message or the network wording.
 */
export function cashErrorMessage(error: unknown): string {
  if (isCashChanged(error)) return 'These records changed while you were counting. The list has been reloaded.'
  if (error instanceof ApiError && error.code === 'csrf_failed') return 'Your session check failed. Reload the page and try again.'
  return errorMessage(error)
}

/**
 * The server's message for one body field of a 422 `validation_error`
 * (`details` is a list of `{loc, msg, type}`), so it shows under that field.
 */
export function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError) || error.code !== 'validation_error' || !Array.isArray(error.details)) return undefined
  const match = (error.details as { loc?: unknown[]; msg?: string }[]).find((d) => Array.isArray(d.loc) && d.loc.at(-1) === field)
  return match?.msg
}
