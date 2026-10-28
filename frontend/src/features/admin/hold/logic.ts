/**
 * Deciding a hold in admin (#166), as designed in
 * docs/design/admin-hold-review.md (#128, approved G2) against the agreed
 * contract (docs/api/deliveries.md, "Admin hold review endpoints"). This part
 * covers proof review (R1). Pure functions only, so the screens stay thin.
 */
import type { ProofEvidence, ProofOverrideRequest } from '../../../lib/api/adminHolds'
import { ApiError } from '../../../lib/api/client'
import type { AgreementMethod } from '../../../lib/api/confirmationTypes'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatTime } from '../../../lib/format/datetime'
import { lagosIso, lagosNowTime, lagosToday } from '../confirm/logic'

/** A decision note, and the customer's details, are at most this long (contract). */
export const NOTE_MAX = 500

/** Why there is no delivery code, in staff words (design R1). */
export const PROOF_REASON_LABEL: Record<NonNullable<ProofEvidence['reason']>, string> = {
  customer_cannot_receive_code: 'Customer cannot receive the code',
  other: 'Other',
}

/** How the customer confirmed (design R1; the contract's codes). */
export const CONFIRM_METHOD_LABEL: Record<AgreementMethod, string> = {
  phone_call: 'Phone call with the customer',
  in_person_to_staff: 'Customer confirmed in person to staff',
  other: 'Other (details required)',
}

/** The order's status in staff words (docs/api/orders.md, "Order statuses"): the sheet shows the server's own status, not the admin grouping. */
export const STAFF_STATUS_LABEL: Record<string, string> = {
  quote_requested: 'Request received',
  awaiting_payment: 'Awaiting payment',
  awaiting_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  assigned: 'Assigned - awaiting driver',
  accepted: 'Driver accepted',
  departed: 'Driver departed',
  collected: 'Water collected',
  en_route: 'On the way',
  arrived: 'Driver arrived',
  unloading: 'Unloading',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Delivery failed',
  disputed: 'Disputed',
}

/** The driver's other reports on the job, by type (deliveries.md, incidents). An unknown type shows as "Report". */
export const INCIDENT_LABEL: Record<string, string> = {
  running_late: 'Running late',
  unsafe_access: 'Unsafe access',
  unsafe_transfer: 'Unsafe transfer',
  volume_issue: 'Volume issue',
  source_concern: 'Source concern',
  vehicle_problem: 'Vehicle problem',
  other: 'Other',
}

/** The delivery code line: whether it was issued, the SMS, the attempts and whether it expired. The code itself is never shown. */
export function deliveryCodeLine(code: ProofEvidence['delivery_code']): string {
  if (!code) return 'No code was issued.'
  const sms = code.sms_status === 'accepted' ? 'SMS accepted' : 'SMS not accepted'
  return `Issued ${formatTime(code.issued_at)} · ${sms} · ${code.attempts_used} of ${code.attempts_limit} attempts used · ${code.expired ? 'Expired' : 'Not expired'}`
}

export interface ProofForm {
  choice: 'approve' | 'reject'
  /** How the customer confirmed (approve only). */
  method: AgreementMethod
  /** When they confirmed, Lagos time: `YYYY-MM-DD` and `HH:MM` (approve only). */
  date: string
  time: string
  /** Details of the confirmation: required for "Other", optional otherwise (approve only). */
  details: string
  /** The dispatcher's own note: required, 1 to 500. For a rejection, the reason. */
  note: string
}

export function initialProofForm(now: Date = new Date()): ProofForm {
  return { choice: 'approve', method: 'phone_call', date: lagosToday(now), time: lagosNowTime(now), details: '', note: '' }
}

export interface ProofErrors {
  when?: string
  details?: string
  note?: string
}

/** The clock tolerance the contract gives the confirmation time (2 minutes). */
const CLOCK_TOLERANCE_MS = 2 * 60_000

/**
 * The checks the contract makes, worded for the form: a note of 1 to 500
 * characters; for an approval, a confirmation time that is not in the future
 * and not before unloading was completed, and details for "Other".
 */
export function proofErrors(form: ProofForm, evidence: ProofEvidence, now: Date = new Date()): ProofErrors {
  const errors: ProofErrors = {}
  const note = form.note.trim()
  if (note.length < 1 || note.length > NOTE_MAX) errors.note = `Write a note (up to ${NOTE_MAX} characters).`
  if (form.choice === 'reject') return errors
  if (!form.date || !form.time) {
    errors.when = 'Enter when the customer confirmed.'
  } else {
    const at = Date.parse(lagosIso(form.date, form.time))
    if (Number.isNaN(at)) errors.when = 'Enter when the customer confirmed.'
    else if (at > now.getTime() + CLOCK_TOLERANCE_MS) errors.when = "The time can't be in the future."
    else if (evidence.unloading_completed_at && at < Date.parse(evidence.unloading_completed_at) - CLOCK_TOLERANCE_MS) {
      errors.when = `The time can't be before unloading was completed (${formatTime(evidence.unloading_completed_at)}).`
    }
  }
  if (form.method === 'other' && !form.details.trim()) errors.details = 'Add details for Other.'
  return errors
}

/** The request for the form. Call only when `proofErrors` finds nothing. */
export function buildProofRequest(form: ProofForm, holdId: string): ProofOverrideRequest {
  const note = form.note.trim()
  if (form.choice === 'reject') return { hold_id: holdId, decision: 'reject', note }
  return {
    hold_id: holdId,
    decision: 'approve',
    customer_acknowledgment: { method: form.method, confirmed_at: lagosIso(form.date, form.time), note: form.details.trim() || null },
    note,
  }
}

/** "This order has changed." with Refresh: every stale case (design decision 11). */
export const CHANGED_MESSAGE = 'This order has changed.'

export interface DecisionFailure {
  message: string
  /** The hold or the order moved on: offer Refresh instead of a retry. */
  changed: boolean
  /** A field the server refused (422), to show under it. */
  fields: ProofErrors
  /** Continue only: the server's new answer on the source (409 `source_not_eligible`), so the card can update. */
  eligibility?: 'not_eligible' | 'cannot_check'
}

/** Whether a decision note is valid: 1 to 500 characters once trimmed. */
export const noteError = (note: string): string | undefined =>
  note.trim().length < 1 || note.trim().length > NOTE_MAX ? `Write a note (up to ${NOTE_MAX} characters).` : undefined

/** The server's answer on a source, as the card shows it (design R2). */
export const ELIGIBILITY_CHIP = {
  eligible: { label: 'Can be used', tone: 'green' },
  not_eligible: { label: 'Cannot be used', tone: 'red' },
  cannot_check: { label: 'Cannot be checked', tone: 'amber' },
} as const

/** The kind of unsafe report (R3). */
export const REPORT_KIND_LABEL: Record<string, string> = { unsafe_access: 'Unsafe access', unsafe_transfer: 'Unsafe transfer' }

/** Why Continue is off when the source cannot be used (design R2). */
export const CONTINUE_OFF = 'Continue is only possible when the source can be used. Fail or cancel the order instead.'

/** Which form field a 422 `loc` points at. */
function fieldOf(loc: unknown): keyof ProofErrors | null {
  if (!Array.isArray(loc)) return null
  if (loc.includes('confirmed_at')) return 'when'
  if (loc.includes('customer_acknowledgment') && loc.includes('note')) return 'details'
  if (loc.at(-1) === 'note') return 'note'
  return null
}

/**
 * Words for a refused decision (design R1 errors). A stale hold or order is
 * "This order has changed."; the rest are the contract's messages, or plain
 * words for a lost connection (what was typed is kept).
 */
export function decisionFailure(error: unknown): DecisionFailure {
  const none: ProofErrors = {}
  if (!(error instanceof ApiError)) return { message: errorMessage(error), changed: false, fields: none }
  switch (error.code) {
    case 'hold_not_open':
    case 'hold_not_found':
    case 'invalid_order_transition':
      return { message: CHANGED_MESSAGE, changed: true, fields: none }
    case 'own_delivery_override':
      return { message: "You can't approve proof for a delivery you made.", changed: false, fields: none }
    case 'source_not_eligible': {
      // The server's sentence as written, and its new answer for the card.
      const answer = (error.details as { answer?: unknown } | null)?.answer
      return { message: error.message, changed: false, fields: none, ...(answer === 'not_eligible' || answer === 'cannot_check' ? { eligibility: answer } : {}) }
    }
    case 'assignment_not_found':
      return { message: 'This order has no driver assigned', changed: false, fields: none }
    case 'csrf_failed':
      return { message: 'Your security check failed. Reload the page.', changed: false, fields: none }
    case 'validation_error': {
      const fields: ProofErrors = {}
      if (Array.isArray(error.details)) {
        for (const item of error.details as { loc?: unknown; msg?: unknown }[]) {
          const field = fieldOf(item.loc)
          if (field && typeof item.msg === 'string' && !fields[field]) fields[field] = item.msg
        }
      }
      return { message: 'Check the fields marked below.', changed: false, fields }
    }
    default:
      if (error.kind === 'network') return { message: 'No connection. What you typed is kept. Try again.', changed: false, fields: none }
      return { message: errorMessage(error), changed: false, fields: none }
  }
}

/** Toast text after a decision (design decision 13). */
export const PROOF_TOAST = {
  approve: 'Proof approved. The order is now Delivered.',
  reject: 'Proof rejected. The driver can send a new code.',
} as const

export const CONTINUE_TOAST = 'Continued. The driver can go on to the customer.'
export const RESUME_TOAST = 'Resumed. The driver can continue.'
export const WITHDRAW_TOAST = 'Job withdrawn. The order is back to Confirmed.'
