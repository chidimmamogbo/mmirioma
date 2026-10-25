/**
 * Types and typed calls for the driver's cash, mirroring docs/api/payments.md,
 * "Driver endpoints" (agreed G3 2026-10-22, #98; amendments 1-3 agreed
 * 2026-10-23): `GET /driver/cash` (K2 My cash), `POST /driver/cash/handover`
 * (K2 Hand over cash), `POST /driver/jobs/{reference}/cash-collection` (K1
 * Record cash), and the job's `cash` object (K1 Cash card), which the job
 * schemas in `driverJobs.ts` embed.
 *
 * Responses are checked with Zod: the amounts and statuses drive what the
 * driver is told about cash in their care, so an unexpected value is
 * reported as `ApiError` `invalid_response` rather than shown wrongly.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { COLLECTION_STATUSES } from './adminCash'
import { apiClient, ApiError, type ApiClient } from './client'

export { COLLECTION_STATUSES, type CollectionStatus } from './adminCash'

/** `CashCollection`, the driver's view of one order's cash. Money in integer kobo. */
export const cashCollectionSchema = z.object({
  id: z.string(),
  order_reference: z.string(),
  /** What the driver recorded (or the office corrected). */
  amount_minor_units: z.number().int(),
  /** The order's frozen price snapshot total. */
  amount_due_minor_units: z.number().int(),
  note: z.string().nullable(),
  status: z.enum(COLLECTION_STATUSES),
  collected_at: z.string(),
  /** 6:00 pm Africa/Lagos, computed by the server (payments.md, "The 6:00 PM rule"). */
  remittance_due_at: z.string(),
  /** From the server; never computed by the client. */
  overdue: z.boolean(),
  remitted_at: z.string().nullable(),
  /** Who received it, once `remitted`. */
  received_by: z.object({ id: z.string(), name: z.string() }).nullable(),
  reconciled_at: z.string().nullable(),
})
export type CashCollection = z.infer<typeof cashCollectionSchema>

/** `GET /driver/cash` and the handover's 200 body. */
const driverCashSchema = z.object({
  /** Sum of the driver's `collected` and `awaiting_remittance` amounts. */
  on_hand_minor_units: z.number().int(),
  /** The `awaiting_remittance` part of it. */
  ready_minor_units: z.number().int(),
  /** The earliest due time among the cash on hand; `null` when none. */
  remittance_due_at: z.string().nullable(),
  /** True if any cash on hand is overdue. */
  overdue: z.boolean(),
  /** Cash on hand plus what was received or reconciled in the last 7 days, newest first. */
  collections: z.array(cashCollectionSchema),
})
export type DriverCash = z.infer<typeof driverCashSchema>

/**
 * The job's `cash` object (K1 Cash card): on every driver job response, also
 * the "My jobs" summaries, because a delivered job's own address answers 404
 * (payments.md, amendment 2). `null` until unloading is complete, and on a job
 * that ended without unloading (no Cash card).
 */
export const jobCashSchema = z.object({
  /** The order's frozen price snapshot total, in kobo. Never set by the driver (BR-13). */
  amount_due_minor_units: z.number().int(),
  /** `manual_quote` in the pilot: shown as "Manual quote". */
  amount_due_label: z.enum(['manual_quote', 'quote']),
  /** The order's cash record once recorded. */
  collection: cashCollectionSchema.nullable(),
  /** True while cash can be recorded (the detail also lists `record_cash`). */
  record_allowed: z.boolean(),
})
export type JobCash = z.infer<typeof jobCashSchema>

/** Most records one handover may carry (payments.md, `POST /driver/cash/handover`). */
export const MAX_HANDOVER_RECORDS = 50

/** Longest cash note the server accepts. */
export const CASH_NOTE_MAX_LENGTH = 500

/** Body of `POST /driver/jobs/{reference}/cash-collection`. */
export interface RecordCashRequest {
  /** Cash received, integer kobo: whole naira, ₦0 or more. */
  amount_minor_units: number
  /** Required by the server when the amount differs from the amount due. */
  note: string | null
}

/**
 * Check a response against a schema.
 *
 * @throws {ApiError} `invalid_response` if it does not match.
 */
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError({
      kind: 'parse',
      status: 200,
      code: 'invalid_response',
      message: 'The server returned an unexpected response.',
      cause: result.error,
    })
  }
  return result.data
}

const CASH_PATH = '/api/v1/driver/cash'

/**
 * The signed-in driver's cash (`GET /driver/cash`, K2).
 *
 * @param signal - Cancels the request.
 * @param client - Override for tests; defaults to the shared client.
 * @throws {ApiError} `invalid_response`; shared 401/403.
 */
export async function getMyCash(signal?: AbortSignal, client: ApiClient = apiClient): Promise<DriverCash> {
  return parse(driverCashSchema, await client.request<unknown>(CASH_PATH, { signal }))
}

/**
 * Mark the chosen `collected` records ready to hand over
 * (`POST /driver/cash/handover`, K2). Moves no money: the cash stays the
 * driver's responsibility until an administrator receives it.
 *
 * @param collectionIds - 1 to 50 distinct collection ids.
 * @returns The driver's cash after the change.
 * @throws {ApiError} `cash_collection_changed` (409: a record is not this
 *   driver's or no longer `collected`; nothing changed, `details.collection_ids`);
 *   `validation_error` (422); `csrf_failed` (403); `network_error`.
 */
export async function handOverCash(collectionIds: string[], client: ApiClient = apiClient): Promise<DriverCash> {
  const body = await client.request<unknown>(`${CASH_PATH}/handover`, {
    method: 'POST',
    body: { collection_ids: collectionIds },
  })
  return parse(driverCashSchema, body)
}

/**
 * Record the cash the customer paid after unloading
 * (`POST /driver/jobs/{reference}/cash-collection`, K1, BR-15). The server
 * answers 201 for a new record and 200 with the same record for a repeat of
 * the same amount and note, so "Try again" after a lost response is safe
 * (NFR-011).
 *
 * @param reference - The job's order reference.
 * @param request - Amount in kobo and the note.
 * @returns The recorded cash (`collected`), with the server's "Hand over by" time.
 * @throws {ApiError} `cash_already_recorded` (409, `details.amount_minor_units`);
 *   `transition_requirements_unmet` (409, `details.missing`
 *   `unloading_completed` or `price_recorded`); `order_not_found` (404);
 *   `validation_error` (422); `csrf_failed` (403); `network_error`.
 */
export async function recordCash(
  reference: string,
  request: RecordCashRequest,
  client: ApiClient = apiClient,
): Promise<CashCollection> {
  const body = await client.request<unknown>(`/api/v1/driver/jobs/${encodeURIComponent(reference)}/cash-collection`, {
    method: 'POST',
    body: request,
  })
  return parse(cashCollectionSchema, body)
}
