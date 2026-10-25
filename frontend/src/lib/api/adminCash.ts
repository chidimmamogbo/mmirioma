/**
 * Types and typed calls for the admin cash endpoints, mirroring
 * docs/api/payments.md, "Admin endpoints" (agreed G3, 2026-10-22; backend
 * #123, not built yet). The order detail's `payment` and the driver
 * endpoints are not here: K6 and the driver screens (#124) add them.
 *
 * Everything that drives a screen (statuses, amounts, the overdue flag) is
 * checked at runtime with Zod: an unknown value is reported as `ApiError`
 * `invalid_response` rather than shown as the wrong state.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { apiClient, ApiError, type ApiClient } from './client'

/** Custody steps of one collection (payments.md, "Rules"). Only forward. */
export const COLLECTION_STATUSES = ['collected', 'awaiting_remittance', 'remitted', 'reconciled'] as const
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]

/** Payment statuses the pilot uses (payments.md, "Payment status"); set on receipt, never inferred. */
export const PILOT_PAYMENT_STATUSES = ['pending_collection', 'partially_paid', 'paid'] as const
export type PilotPaymentStatus = (typeof PILOT_PAYMENT_STATUSES)[number]

const personSchema = z.object({ id: z.string(), name: z.string() })

/** `AdminCashCollection`: the driver's `CashCollection` plus what the office needs. */
export const collectionSchema = z.object({
  id: z.string(),
  order_reference: z.string(),
  /** What the driver recorded (or the office corrected), integer kobo. */
  amount_minor_units: z.number().int(),
  /** The order's frozen price snapshot total. */
  amount_due_minor_units: z.number().int(),
  /** The driver's note; required by the server when the amount differs from the amount due. */
  note: z.string().nullable(),
  status: z.enum(COLLECTION_STATUSES),
  collected_at: z.string(),
  remittance_due_at: z.string(),
  /** From the server; never computed by the client (payments.md, "The 6:00 PM rule"). */
  overdue: z.boolean(),
  remitted_at: z.string().nullable(),
  received_by: personSchema.nullable(),
  reconciled_at: z.string().nullable(),
  driver: personSchema,
  customer: z.object({ name: z.string(), phone: z.string() }),
  payment_status: z.enum(PILOT_PAYMENT_STATUSES).nullable(),
  outstanding_balance_minor_units: z.number().int(),
  overpaid_minor_units: z.number().int(),
  remittance_id: z.string().nullable(),
  reconciled_by: personSchema.nullable(),
  /** `null` when never corrected (decision 6). */
  original_amount_minor_units: z.number().int().nullable().default(null),
  corrected_by: personSchema.nullable().default(null),
  corrected_at: z.string().nullable().default(null),
  correction_reason: z.string().nullable().default(null),
})
export type AdminCashCollection = z.infer<typeof collectionSchema>

const cashDaySchema = z.object({
  /** Lagos calendar date. */
  date: z.string(),
  totals: z.object({
    recorded_minor_units: z.number().int(),
    received_minor_units: z.number().int(),
    reconciled_minor_units: z.number().int(),
    with_drivers_minor_units: z.number().int(),
    /** A count, not money: counted differences recorded at receipt on `date`. */
    differences: z.number().int(),
  }),
  /** Overdue first, then by name (server order). */
  drivers: z.array(
    z.object({
      driver: z.object({ id: z.string(), name: z.string(), vehicle: z.string().nullable() }),
      held_minor_units: z.number().int(),
      ready_minor_units: z.number().int(),
      remittance_due_at: z.string().nullable(),
      overdue: z.boolean(),
      last_received_at: z.string().nullable(),
    }),
  ),
  /** Every `remitted` collection, any day, oldest first. */
  awaiting_reconciliation: z.array(collectionSchema),
})
/** `GET /admin/cash`: one Lagos operating day (K3). */
export type CashDay = z.infer<typeof cashDaySchema>
export type CashDriverRow = CashDay['drivers'][number]

const driverCashSchema = z.object({
  driver: personSchema,
  /** Every `collected` and `awaiting_remittance` collection of the driver. */
  collections: z.array(collectionSchema),
})
/** `GET /admin/cash/drivers/{driver_id}` (K4). */
export type DriverCash = z.infer<typeof driverCashSchema>

const remittanceSchema = z.object({
  id: z.string(),
  driver: personSchema,
  recorded_minor_units: z.number().int(),
  counted_minor_units: z.number().int(),
  /** Counted minus recorded; negative is short. */
  difference_minor_units: z.number().int(),
  note: z.string().nullable(),
  received_by: personSchema,
  remitted_at: z.string(),
  orders: z.array(
    z.object({
      reference: z.string(),
      payment_status: z.enum(PILOT_PAYMENT_STATUSES),
      outstanding_balance_minor_units: z.number().int(),
      overpaid_minor_units: z.number().int(),
      /** `null` when no SMS was due (₦0.00 recorded). */
      sms_status: z.enum(['accepted', 'failed']).nullable(),
    }),
  ),
})
/** `POST /admin/cash-remittances` 201 (K4 received). */
export type Remittance = z.infer<typeof remittanceSchema>

const reconciliationSchema = z.object({ collections: z.array(collectionSchema) })

/** Body of `POST /admin/cash-collections/{id}/correction` (K4, decision 6). */
export interface CorrectionRequest {
  /** Whole naira in kobo, `>= 0`, different from the current amount. */
  amount_minor_units: number
  /** Required, 1-500 characters. */
  reason: string
}

/** Body of `POST /admin/cash-remittances` (K4). */
export interface ReceiveRequest {
  driver_id: string
  /** 1-50 of this driver's `collected` or `awaiting_remittance` collections. */
  collection_ids: string[]
  /** Whole naira in kobo, `>= 0`. */
  counted_minor_units: number
  /** Required when counted differs from the recorded total; up to 500. */
  note: string | null
}

/** Body of `POST /admin/cash-reconciliations` (K5). */
export interface ReconcileRequest {
  /** 1-50 `remitted` collections. */
  collection_ids: string[]
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

/**
 * The cash page for one Lagos day (`GET /admin/cash?date=`, K3).
 *
 * @param date - Lagos `YYYY-MM-DD`; the server defaults to today.
 * @throws {ApiError} `validation_error` (422) for a malformed date; `invalid_response`.
 */
export async function getCashDay(date: string, signal?: AbortSignal, client: ApiClient = apiClient): Promise<CashDay> {
  const body = await client.request<unknown>(`/api/v1/admin/cash?date=${encodeURIComponent(date)}`, { signal })
  return parse(cashDaySchema, body)
}

/**
 * A driver's cash on hand (`GET /admin/cash/drivers/{driver_id}`, K4).
 *
 * @throws {ApiError} `driver_not_found` (404); `invalid_response`.
 */
export async function getDriverCash(
  driverId: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<DriverCash> {
  const body = await client.request<unknown>(`/api/v1/admin/cash/drivers/${encodeURIComponent(driverId)}`, { signal })
  return parse(driverCashSchema, body)
}

/**
 * Correct a recorded amount before it is received (K4, decision 6).
 *
 * @throws {ApiError} `cash_collection_not_found` (404); `cash_collection_changed`
 *   (409, received meanwhile); `validation_error` (422); `csrf_failed`; `network_error`.
 */
export async function correctCollection(
  collectionId: string,
  request: CorrectionRequest,
  client: ApiClient = apiClient,
): Promise<AdminCashCollection> {
  const body = await client.request<unknown>(
    `/api/v1/admin/cash-collections/${encodeURIComponent(collectionId)}/correction`,
    { method: 'POST', body: request },
  )
  return parse(collectionSchema, body)
}

/**
 * Receive cash from one driver (K4). Sets each order's payment status; the
 * payment SMS goes after the commit and its outcome is per order.
 *
 * @throws {ApiError} `driver_not_found` (404); `cash_collection_changed` (409,
 *   `details.collection_ids`); `validation_error` (422); `csrf_failed`; `network_error`.
 */
export async function receiveCash(request: ReceiveRequest, client: ApiClient = apiClient): Promise<Remittance> {
  const body = await client.request<unknown>('/api/v1/admin/cash-remittances', { method: 'POST', body: request })
  return parse(remittanceSchema, body)
}

/**
 * Reconcile received collections (K5). Never changes a payment status.
 *
 * @throws {ApiError} `cash_collection_changed` (409); `validation_error` (422);
 *   `csrf_failed`; `network_error`.
 */
export async function reconcileCollections(
  request: ReconcileRequest,
  client: ApiClient = apiClient,
): Promise<AdminCashCollection[]> {
  const body = await client.request<unknown>('/api/v1/admin/cash-reconciliations', { method: 'POST', body: request })
  return parse(reconciliationSchema, body).collections
}
