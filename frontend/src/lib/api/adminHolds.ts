/**
 * Types and typed calls for the admin hold review endpoints, mirroring
 * docs/api/deliveries.md, "Admin hold review endpoints" (agreed, G3, PR #91;
 * built in #96). The `hold` field on orders and the history's hold entries
 * are parsed in `adminDispatch.ts`, with the rest of the order detail.
 *
 * Everything that drives a screen (the evidence, the eligibility answer, the
 * cancellation outcome) is checked at runtime with Zod: an unknown value is
 * reported as `ApiError` `invalid_response` rather than shown as the wrong
 * state.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { parseDetail, TRANSITION_REASONS, type AdminOrderDetail, type TransitionReason } from './adminDispatch'
import type { AdminOrderStatus } from './adminOrders'
import { apiClient, ApiError, type ApiClient } from './client'
import { EXCEPTION_CATEGORIES, HOLD_KINDS } from './holdTypes'

const ORDER_STATUSES = [
  'quote_requested',
  'awaiting_payment',
  'awaiting_confirmation',
  'confirmed',
  'assigned',
  'accepted',
  'departed',
  'collected',
  'en_route',
  'arrived',
  'unloading',
  'delivered',
  'cancelled',
  'failed',
  'disputed',
] as const satisfies readonly AdminOrderStatus[]

const personSchema = z.object({ id: z.string(), name: z.string() })

/** Alternative proof evidence (R1). The delivery code itself is never returned. */
const proofSchema = z.object({
  delivered_litres: z.number().int(),
  reason: z.enum(['customer_cannot_receive_code', 'other']).nullable(),
  driver_note: z.string().nullable(),
  arrived_at: z.string().nullable(),
  unloading_completed_at: z.string().nullable(),
  sent_at: z.string(),
  delivery_code: z
    .object({
      issued_at: z.string(),
      sms_status: z.enum(['accepted', 'failed']),
      attempts_used: z.number().int(),
      attempts_limit: z.number().int(),
      expired: z.boolean(),
    })
    .nullable(),
  contact_attempts: z.array(z.object({ attempted_at: z.string() })),
  /** Only when the driver shared it with consent; never a route. */
  location: z
    .object({ latitude: z.number(), longitude: z.number(), accuracy_metres: z.number().nullable() })
    .nullable(),
})
export type ProofEvidence = z.infer<typeof proofSchema>

/** Pickup evidence (R2). */
const pickupSchema = z.object({
  assigned_source: z.object({ id: z.string(), name: z.string(), approximate_location: z.string() }).nullable(),
  used_source: z.union([
    z.object({ assigned: z.literal(true) }),
    z.object({ assigned: z.literal(false), name: z.string() }),
  ]),
  source_reference: z.string().nullable(),
  volume_collected_litres: z.number().int(),
  picked_up_at: z.string(),
  safety_concern: z.boolean(),
  safety_note: z.string().nullable(),
})
export type PickupEvidence = z.infer<typeof pickupSchema>

/** The server's answer on the source for the order's water category (FR-012). */
export const ELIGIBILITY_ANSWERS = ['eligible', 'not_eligible', 'cannot_check'] as const
export type EligibilityAnswer = (typeof ELIGIBILITY_ANSWERS)[number]

const holdReviewSchema = z.object({
  id: z.string(),
  kind: z.enum(HOLD_KINDS),
  since: z.string(),
  order_status: z.enum(ORDER_STATUSES),
  driver: personSchema,
  proof: proofSchema.nullable(),
  pickup: pickupSchema.nullable(),
  /** `message` is shown word for word. */
  source_eligibility: z.object({ answer: z.enum(ELIGIBILITY_ANSWERS), message: z.string() }).nullable(),
  report: z
    .object({
      kind: z.enum(EXCEPTION_CATEGORIES),
      note: z.string().nullable(),
      reported_at: z.string(),
      order_status_then: z.enum(ORDER_STATUSES).nullable(),
    })
    .nullable(),
  incidents: z.array(
    z.object({ kind: z.enum(EXCEPTION_CATEGORIES), reported_at: z.string(), note: z.string().nullable() }),
  ),
  /** True only while the order is `accepted` (row 11): R3 also offers Withdraw job. */
  withdraw_allowed: z.boolean(),
})
/** `HoldReview`: the evidence for the hold shown on an order. */
export type HoldReview = z.infer<typeof holdReviewSchema>

const cancellationOutcomeSchema = z.object({
  reason_code: z.enum(TRANSITION_REASONS),
  /** Integer kobo. */
  customer_charge_minor_units: z.number().int(),
  /** Shown word for word. */
  message: z.string(),
})
export type CancellationOutcome = z.infer<typeof cancellationOutcomeSchema>

/** How the administrator confirmed the delivery with the customer (R1). */
export type CustomerAcknowledgmentMethod = 'phone_call' | 'in_person_to_staff' | 'other'

/** Body of `POST .../proof-overrides`. */
export type ProofOverrideRequest =
  | {
      hold_id: string
      decision: 'approve'
      customer_acknowledgment: {
        method: CustomerAcknowledgmentMethod
        /** Aware ISO timestamp. */
        confirmed_at: string
        /** Required with `other`. */
        note: string | null
      }
      note: string
    }
  | { hold_id: string; decision: 'reject'; note: string }

/** Body of `POST .../hold/continue` and `.../hold/resume`. */
export interface HoldDecisionRequest {
  hold_id: string
  /** Required, 1-500 characters. For resume, the safe alternative. */
  note: string
}

/** Fail reasons agreed for the hold review screens (row 20). */
export type FailReason = Extract<TransitionReason, 'source_quality_concern' | 'unsafe_access' | 'other'>

/** Body of `POST .../transition`: only fail (row 20) and the no-charge cancel (row 23). */
export type AdminTransitionRequest =
  | {
      to: 'failed'
      expected_status: AdminOrderStatus
      reason_code: FailReason
      note: string | null
      hold_id: string | null
    }
  | {
      to: 'cancelled'
      expected_status: AdminOrderStatus
      reason_code: 'mmirioma_unable'
      note: string | null
      hold_id: string | null
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

const orderPath = (reference: string) => `/api/v1/admin/orders/${encodeURIComponent(reference)}`

/**
 * The evidence for the order's open hold (`GET .../hold`, R1-R3).
 *
 * @throws {ApiError} `hold_not_found` or `order_not_found` (404); `invalid_response`.
 */
export async function getHoldReview(
  reference: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<HoldReview> {
  return parse(holdReviewSchema, await client.request<unknown>(`${orderPath(reference)}/hold`, { signal }))
}

/**
 * Approve (row 18) or reject alternative proof (`POST .../proof-overrides`).
 *
 * @returns The order after the decision.
 * @throws {ApiError} `own_delivery_override` (403, BR-13); `hold_not_open`
 *   or `invalid_order_transition` (409); `validation_error` (422);
 *   `csrf_failed` (403); `network_error`.
 */
export async function decideProof(
  reference: string,
  request: ProofOverrideRequest,
  client: ApiClient = apiClient,
): Promise<AdminOrderDetail> {
  return parseDetail(
    await client.request<unknown>(`${orderPath(reference)}/proof-overrides`, { method: 'POST', body: request }),
  )
}

/**
 * Let the driver continue after a source review (`POST .../hold/continue`, R2).
 *
 * @throws {ApiError} `source_not_eligible` or `hold_not_open` (409);
 *   `csrf_failed`; `network_error`.
 */
export async function continueSource(
  reference: string,
  request: HoldDecisionRequest,
  client: ApiClient = apiClient,
): Promise<AdminOrderDetail> {
  return parseDetail(
    await client.request<unknown>(`${orderPath(reference)}/hold/continue`, { method: 'POST', body: request }),
  )
}

/**
 * Resume a job after an unsafe stop (`POST .../hold/resume`, R3).
 *
 * @throws {ApiError} `hold_not_open` (409); `csrf_failed`; `network_error`.
 */
export async function resumeUnsafe(
  reference: string,
  request: HoldDecisionRequest,
  client: ApiClient = apiClient,
): Promise<AdminOrderDetail> {
  return parseDetail(
    await client.request<unknown>(`${orderPath(reference)}/hold/resume`, { method: 'POST', body: request }),
  )
}

/**
 * What cancelling with `mmirioma_unable` would cost the customer
 * (`GET .../cancellation-outcome`, FR-044). The CANCEL dialog shows the
 * server's sentence, never one worked out here.
 *
 * @throws {ApiError} `invalid_order_transition` (409); `order_not_found` (404).
 */
export async function getCancellationOutcome(
  reference: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CancellationOutcome> {
  const path = `${orderPath(reference)}/cancellation-outcome?reason_code=mmirioma_unable`
  return parse(cancellationOutcomeSchema, await client.request<unknown>(path, { signal }))
}

/**
 * Fail a delivery or cancel with `mmirioma_unable` (`POST .../transition`).
 *
 * @throws {ApiError} `invalid_order_transition` or `hold_not_open` (409);
 *   `validation_error` (422); `csrf_failed`; `network_error`.
 */
export async function transitionOrder(
  reference: string,
  request: AdminTransitionRequest,
  client: ApiClient = apiClient,
): Promise<AdminOrderDetail> {
  return parseDetail(
    await client.request<unknown>(`${orderPath(reference)}/transition`, { method: 'POST', body: request }),
  )
}
