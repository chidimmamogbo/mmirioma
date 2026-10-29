/**
 * Wording, money and error handling for the driver cash screens (K1, K2),
 * as designed in docs/design/driver-cash.md (#7, approved G2) against the
 * agreed contract (docs/api/payments.md, "Driver endpoints"). Pure functions
 * only, so the screens stay thin. Nothing here sets a payment status: the
 * office does that when it receives the cash (BR-07, BR-13).
 */
import type { VehicleType } from '../../../domain/partner'
import { ApiError } from '../../../lib/api/client'
import { APP_TIME_ZONE, formatTime } from '../../../lib/format/datetime'
import { nairaInputToKobo } from '../../../lib/format/money'
import type { CashCollection, JobCash } from '../partnerApi'

export { CASH_NOTE_MAX_LENGTH } from '../../../lib/api/driverCash'

const KOBO_PER_NAIRA = 100
const withKobo = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dayParts = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Integer kobo as naira **with kobo**, e.g. `650000` → `₦6,500.00`. Cash
 * screens show kobo because cash must match to the kobo (design decision 6);
 * the rest of the partner app keeps whole naira.
 *
 * @throws RangeError if `kobo` is not a safe integer.
 */
export function formatCash(kobo: number): string {
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`Money must be integer kobo, got ${kobo}`)
  return `${kobo < 0 ? '−' : ''}₦${withKobo.format(Math.abs(kobo) / KOBO_PER_NAIRA)}`
}

/** "rider" in the Keke app, "driver" in the Tanker app (design decision 5). */
export function personWord(vehicle: VehicleType): 'rider' | 'driver' {
  return vehicle === 'tanker' ? 'driver' : 'rider'
}

/** "6:00 pm": the design writes cash times in lower case. */
export function cashTime(iso: string): string {
  return formatTime(iso).toLowerCase()
}

function day(iso: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of dayParts.formatToParts(new Date(iso))) out[p.type] = p.value
  return out
}

/** "Hand over by Mon 26 Oct, 6:00 pm", from the server's due time (never computed here). */
export function handOverBy(iso: string): string {
  const d = day(iso)
  return `Hand over by ${d.weekday} ${d.day} ${d.month}, ${cashTime(iso)}`
}

/** "Mon 26 Oct 2026, 6:00 pm", for the overdue notice. */
export function dueDateTime(iso: string): string {
  const d = day(iso)
  return `${d.weekday} ${d.day} ${d.month} ${d.year}, ${cashTime(iso)}`
}

/** The custody label of a record (design, "Labels"). */
export function custodyLabel(row: Pick<CashCollection, 'status' | 'received_by'>, vehicle: VehicleType): string {
  switch (row.status) {
    case 'collected':
      return `Collected by ${personWord(vehicle)}`
    case 'awaiting_remittance':
      return 'Ready to hand over'
    case 'remitted':
      return row.received_by ? `Received by ${row.received_by.name}` : 'Received'
    case 'reconciled':
      return 'Reconciled'
  }
}

/**
 * The line under the amount due (design decision 8): "Manual quote" only for
 * `manual_quote`; `quote` and any label this build does not know say only how
 * it is paid.
 */
export function amountDueLine(label: JobCash['amount_due_label'] | string): string {
  return label === 'manual_quote' ? 'Manual quote · Pay on delivery: cash after unloading' : 'Pay on delivery: cash after unloading'
}

export type Comparison = 'equal' | 'less' | 'more' | 'none'

/** How the cash typed compares with the amount due. ₦0 is "nothing paid", whatever is due. */
export function compareCash(amount: number, due: number): Comparison {
  if (amount === 0 && due !== 0) return 'none'
  if (amount === due) return 'equal'
  return amount < due ? 'less' : 'more'
}

/** The message under the field for a comparison (design K1 "Record cash"). */
export function comparisonMessage(comparison: Comparison, amount: number, due: number): { tone: 'success' | 'note'; title: string; text: string | null } {
  switch (comparison) {
    case 'equal':
      return { tone: 'success', title: 'Matches the amount due.', text: null }
    case 'less':
      return { tone: 'note', title: 'Less than the amount due.', text: `${formatCash(due - amount)} will show as outstanding.` }
    case 'more':
      return { tone: 'note', title: 'More than the amount due.', text: `The office will review the difference of ${formatCash(amount - due)}.` }
    case 'none':
      return { tone: 'note', title: 'Customer paid nothing.', text: `The full ${formatCash(due)} will show as outstanding.` }
  }
}

/** Whole naira typed by the partner, in kobo; `null` when it is not a whole naira amount. */
export function cashInputToKobo(text: string): number | null {
  return nairaInputToKobo(text)
}

/** What a refused or failed "Record cash" shows (design K1). */
export interface RecordProblem {
  title: string
  text: string
  /** The form closes: the cash cannot be recorded from here. */
  closes: boolean
  /** "Try again" is offered (what was typed is kept, NFR-012). */
  retry: boolean
  /** Field messages from a 422. */
  fields: { amount?: string; note?: string }
}

function fieldsOf(error: ApiError): RecordProblem['fields'] {
  const fields: RecordProblem['fields'] = {}
  if (!Array.isArray(error.details)) return fields
  for (const item of error.details as { loc?: unknown; msg?: unknown }[]) {
    if (!Array.isArray(item.loc) || typeof item.msg !== 'string') continue
    if (item.loc.includes('amount_minor_units')) fields.amount ??= item.msg
    else if (item.loc.includes('note')) fields.note ??= item.msg
  }
  return fields
}

/** Words for an error from `POST .../cash-collection`. */
export function recordProblem(error: unknown): RecordProblem {
  const base = { closes: false, retry: false, fields: {} }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'cash_already_recorded': {
        const recorded = (error.details as { amount_minor_units?: unknown } | null)?.amount_minor_units
        const amount = typeof recorded === 'number' && Number.isSafeInteger(recorded) ? `${formatCash(recorded)} was` : 'Cash was'
        return { ...base, closes: true, title: 'Cash already recorded', text: `${amount} recorded for this order. Contact the office if that is wrong.` }
      }
      case 'transition_requirements_unmet':
        return { ...base, closes: true, title: 'Finish unloading first', text: 'You can record cash once unloading is complete.' }
      case 'order_not_found':
      case 'job_not_found':
        return { ...base, closes: true, title: 'This order is no longer yours', text: 'It may have been reassigned. Go back to your jobs.' }
      case 'validation_error': {
        const fields = fieldsOf(error)
        if (fields.amount || fields.note) return { ...base, fields, title: '', text: '' }
        break
      }
    }
  }
  return { ...base, retry: true, title: 'Not sent', text: 'Check your connection and try again. Nothing was recorded.' }
}

/** Words for an error from `POST /driver/cash/handover`. `reload`: the list changed and is fetched again. */
export function handoverProblem(error: unknown): { title: string; text: string; reload: boolean } {
  if (error instanceof ApiError && error.code === 'cash_collection_changed') {
    return { title: 'Some cash changed', text: 'The office already received some of it. Your list is updated.', reload: true }
  }
  return { title: 'Not sent', text: 'Check your connection and try again.', reload: false }
}
