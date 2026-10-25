/**
 * Types and typed calls for the driver job endpoints used by the driver app's
 * My jobs (J1) and Job offer (J2) screens, mirroring docs/api/deliveries.md,
 * "Driver job endpoints" (part 1, agreed G3 2026-10-19, PR #50) and "part 2"
 * (agreed G3 2026-10-20, #51; built in #75).
 *
 * The job list, the job detail, accept and decline (J1, J2), and every step
 * of the active job (A1-A8, approved G2 2026-10-23). Every job carries its
 * K1 Cash card (`cash`, schema in `driverCash.ts`); recording the cash
 * (`recordCash`) is there too.
 *
 * Responses are checked at runtime with Zod: the list and the detail drive
 * what the driver may do, so an unexpected value is reported as `ApiError`
 * `invalid_response` instead of showing the wrong state.
 *
 * If the contract changes, update these types and schemas in the same PR.
 */

import { z } from 'zod'
import { DECLINE_REASONS, type DeclineReason } from './adminDispatch'
import type { AdminOrderStatus } from './adminOrders'
import { apiClient, ApiError, type ApiClient } from './client'
import { jobCashSchema } from './driverCash'
import { HOLD_KINDS } from './holdTypes'

export { DECLINE_REASONS, type DeclineReason }

/** Every order status the API can send (deliveries contract, "Statuses"). */
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

/** Where J1 lists a job; computed by the server in Africa/Lagos. */
export const JOB_SECTIONS = ['offer', 'today', 'upcoming', 'done'] as const
export type JobSection = (typeof JOB_SECTIONS)[number]

/**
 * `offered` (not yet accepted, FR-032), `accepted`, or `completed` (the job
 * ended: delivered, disputed, failed or cancelled).
 */
export const JOB_STATUSES = ['offered', 'accepted', 'completed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

/**
 * What the driver may do now (`allowed_actions`); the server still checks
 * every request. `record_cash` is added by the cash contract
 * (docs/api/payments.md, agreed G3 2026-10-22, #98).
 */
export const JOB_ACTIONS = [
  'accept',
  'decline',
  'start_job',
  'record_pickup',
  'leave_for_customer',
  'arrive',
  'record_contact_attempt',
  'record_failed_attempt',
  'start_unloading',
  'complete_unloading',
  'submit_proof',
  'request_new_code',
  'report_incident',
  'record_cash',
] as const
export type JobAction = (typeof JOB_ACTIONS)[number]

const isJobAction = (value: string): value is JobAction => (JOB_ACTIONS as readonly string[]).includes(value)

/**
 * `allowed_actions`, keeping only the actions this build knows. An action a
 * later server adds is one this app cannot offer anyway, so it is dropped
 * rather than failing the whole job as `invalid_response`.
 */
const allowedActionsSchema = z.array(z.string()).transform((actions) => actions.filter(isJobAction))

/** A reason the driver must not continue that is not an order status (FR-034, FR-035, SRS §8). */
const driverHoldSchema = z.object({
  kind: z.enum(HOLD_KINDS),
  /** When the hold opened (UTC ISO). */
  since: z.string(),
  /** Server text. */
  message: z.string(),
})
export type DriverHold = z.infer<typeof driverHoldSchema>

/** `DriverJobSummary`: one job on the My jobs list (J1). Times are UTC ISO. */
export const driverJobSummarySchema = z.object({
  /** Identifies the job in every driver job path. */
  order_reference: z.string(),
  /** `null` only for a job that is in no J1 group (not listed by the server). */
  section: z.enum(JOB_SECTIONS).nullable(),
  job_status: z.enum(JOB_STATUSES),
  order_status: z.enum(ORDER_STATUSES),
  /** The confirmed delivery window; `null` until one is set. */
  delivery_window_start_at: z.string().nullable(),
  delivery_window_end_at: z.string().nullable(),
  /** First line of the delivery address, up to 120 characters. */
  delivery_area: z.string().nullable(),
  /** Ordered litres. */
  quantity_litres: z.number().int(),
  source_name: z.string().nullable(),
  /** When the dispatcher assigned the job to this driver. */
  offered_at: z.string(),
  hold: driverHoldSchema.nullable(),
  /** Set once the job ends with a delivery. */
  delivered_litres: z.number().int().nullable(),
  ended_at: z.string().nullable(),
  /** Reason code of a failure or cancellation, e.g. `customer_unreachable`. */
  end_reason: z.string().nullable(),
  /** Demo data (BR-09). */
  is_simulated: z.boolean(),
  /**
   * The K1 Cash card once unloading is complete (payments.md, amendment 2),
   * else `null`. Read as `null` if a response leaves it out.
   */
  cash: jobCashSchema.nullable().default(null),
})
export type DriverJobSummary = z.infer<typeof driverJobSummarySchema>

/** `DriverJobDetail`: the live job (J2 offer detail; later the active job). */
export const driverJobDetailSchema = driverJobSummarySchema.extend({
  /**
   * First name and last initial, and the phone for the call button. Only
   * while the job is accepted: `null` for an offer (FR-032).
   */
  receiver: z.object({ display_name: z.string(), phone: z.string() }).nullable(),
  delivery_address: z.string().nullable(),
  landmark: z.string().nullable(),
  /** The design's "Access notes"; shown on the offer too. */
  delivery_instructions: z.string().nullable(),
  source: z.object({ id: z.string(), name: z.string(), approximate_location: z.string() }).nullable(),
  pickup: z
    .object({
      source_id: z.string().nullable(),
      other_source_name: z.string().nullable(),
      source_reference: z.string().nullable(),
      volume_collected_litres: z.number().int(),
      picked_up_at: z.string(),
      safety_concern: z.boolean(),
    })
    .nullable(),
  arrived_at: z.string().nullable(),
  contact_attempts: z.array(z.object({ attempted_at: z.string() })),
  /** Never contains the code itself. */
  delivery_code: z
    .object({
      issued_at: z.string(),
      expires_at: z.string(),
      attempts_left: z.number().int(),
      sms_status: z.enum(['accepted', 'failed']),
    })
    .nullable(),
  allowed_actions: allowedActionsSchema,
  unloading_completed_at: z.string().nullable(),
  unreachable_allowed_at: z.string().nullable(),
})
export type DriverJobDetail = z.infer<typeof driverJobDetailSchema>

/** `DriverJobList`: the four J1 groups, each already in the server's order. */
const driverJobListSchema = z.object({
  offers: z.array(driverJobSummarySchema),
  today: z.array(driverJobSummarySchema),
  upcoming: z.array(driverJobSummarySchema),
  done: z.array(driverJobSummarySchema),
  /** When the server built the list (UTC ISO); the offline "Last updated" time. */
  generated_at: z.string(),
})
export type DriverJobList = z.infer<typeof driverJobListSchema>

/** Body of `POST .../decline` (design J2-b). */
export interface DeclineRequest {
  reason: DeclineReason
  /** Trimmed, up to 300 characters; required when `reason` is `other`. */
  note: string | null
}

/** Longest decline note the server accepts. */
export const DECLINE_NOTE_MAX_LENGTH = 300

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

const JOBS_PATH = '/api/v1/driver/jobs'
const jobPath = (reference: string) => `${JOBS_PATH}/${encodeURIComponent(reference)}`

/**
 * The signed-in driver's jobs, grouped for My jobs (`GET /driver/jobs`).
 *
 * @param signal - Cancels the request.
 * @param client - Override for tests; defaults to the shared client.
 * @throws {ApiError} `invalid_response`; shared 401/403.
 */
export async function listDriverJobs(signal?: AbortSignal, client: ApiClient = apiClient): Promise<DriverJobList> {
  return parse(driverJobListSchema, await client.request<unknown>(JOBS_PATH, { signal }))
}

/**
 * One live job (`GET /driver/jobs/{reference}`).
 *
 * @param reference - Order reference, e.g. `MO-7KQ2M9XH4T`.
 * @throws {ApiError} `order_not_found` (404: missing, never this driver's,
 *   or no longer theirs, T-07); `invalid_response`; shared 401/403.
 */
export async function getDriverJob(
  reference: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<DriverJobDetail> {
  return parse(driverJobDetailSchema, await client.request<unknown>(jobPath(reference), { signal }))
}

/**
 * Accept an offer (`POST .../accept`, row 9, FR-032). Safe to repeat: a
 * second accept returns the job unchanged.
 *
 * @returns The accepted job, now with `receiver` and its J1 `section`.
 * @throws {ApiError} `order_not_found` (404: the offer is gone);
 *   `csrf_failed` (403); `network_error`.
 */
export async function acceptDriverJob(reference: string, client: ApiClient = apiClient): Promise<DriverJobDetail> {
  const body = await client.request<unknown>(`${jobPath(reference)}/accept`, { method: 'POST' })
  return parse(driverJobDetailSchema, body)
}

/**
 * Decline an offer with a reason (`POST .../decline`, row 10, FR-032). The
 * order goes back to the dispatcher; the customer is told nothing.
 *
 * @throws {ApiError} `order_not_found` (404: the offer is gone); `forbidden`
 *   (403: already accepted, only the dispatcher can take it back);
 *   `validation_error` (422); `csrf_failed` (403); `network_error`.
 */
export async function declineDriverJob(
  reference: string,
  request: DeclineRequest,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.request<unknown>(`${jobPath(reference)}/decline`, { method: 'POST', body: request })
}

// ---------------------------------------------------------------------------
// The active job (A1-A8, #97): the rest of parts 1 and 2.
// ---------------------------------------------------------------------------

/** Statuses the driver reaches with `POST .../transition` (contract part 2). */
export type DriverStep = 'departed' | 'en_route' | 'unloading' | 'failed'

/**
 * Body of `POST .../transition`. `collected`, `arrived` and `delivered` have
 * their own endpoints (pickup, arrive, proof).
 */
export interface TransitionRequest {
  to: DriverStep
  /** Optional, up to 500 characters. */
  note?: string | null
}

/** A consented location (WGS 84). Sent only after the driver agreed (FR-035). */
export interface DriverLocation {
  latitude: number
  longitude: number
  accuracy_metres?: number | null
}

/** Body of `POST .../arrive`, and the location part of the proof. */
export interface LocationEvidence {
  /** Only with `location_consent: true`. */
  location?: DriverLocation | null
  location_consent: boolean
}

/** Body of `POST .../pickup` (FR-034, design A2). */
export interface PickupRequest {
  source: { assigned: true } | { assigned: false; name: string }
  /** Optional, up to 100 characters. */
  source_reference: string | null
  /** Whole litres, 1 or more. */
  volume_collected_litres: number
  /** Aware timestamp; not in the future, not before the job started. */
  picked_up_at: string
  safety_concern: boolean
  /** Required when `safety_concern` is true; up to 500 characters. */
  safety_note: string | null
}

/** Reasons for other proof (FR-035, design A5-n). */
export const ALTERNATIVE_PROOF_REASONS = ['customer_cannot_receive_code', 'other'] as const
export type AlternativeProofReason = (typeof ALTERNATIVE_PROOF_REASONS)[number]

/** Body of `POST .../proof`: exactly one of `delivery_code` and `alternative_proof`. */
export interface ProofRequest extends LocationEvidence {
  /** Whole litres, 1 or more; never prefilled with the ordered amount. */
  delivered_litres: number
  unloading_confirmed: true
  delivery_code: string | null
  alternative_proof: { reason: AlternativeProofReason; note: string | null } | null
}

/** Problem types a driver can report (FR-036, design A6). */
export const INCIDENT_TYPES = [
  'running_late',
  'unsafe_access',
  'unsafe_transfer',
  'volume_issue',
  'source_concern',
  'vehicle_problem',
  'other',
] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

/** Body of `POST .../incidents`. */
export interface IncidentRequest {
  type: IncidentType
  /** Up to 500 characters; required for `other`. */
  note: string | null
  /** Only for `running_late`; never changes the customer's window. */
  new_estimated_arrival_at: string | null
}

const incidentReadSchema = z.object({
  id: z.string(),
  order_reference: z.string(),
  type: z.enum(INCIDENT_TYPES),
  note: z.string().nullable(),
  new_estimated_arrival_at: z.string().nullable(),
  created_at: z.string(),
  /** The job's hold after the report: `unsafe_stop` for the unsafe types. */
  hold: driverHoldSchema.nullable(),
})
export type IncidentRead = z.infer<typeof incidentReadSchema>

/**
 * What a step that may end the job answers: the live job, or the job as a
 * `done` summary once it has ended (proof with a code, the failed step).
 * Told apart by `allowed_actions`, which only the detail carries.
 */
export type JobStepResult = { ended: false; job: DriverJobDetail } | { ended: true; job: DriverJobSummary }

function parseStepResult(body: unknown): JobStepResult {
  if (typeof body === 'object' && body !== null && 'allowed_actions' in body) {
    return { ended: false, job: parse(driverJobDetailSchema, body) }
  }
  return { ended: true, job: parse(driverJobSummarySchema, body) }
}

/**
 * A plain step (`POST .../transition`, rows 12, 14, 16, 19): Start job
 * (`departed`), Leave for customer (`en_route`), Start unloading
 * (`unloading`), Record failed attempt (`failed`). Repeating the step just
 * made is harmless.
 *
 * @returns The live job, or the `done` job after `failed`.
 * @throws {ApiError} `order_not_found` (404); `invalid_order_transition`,
 *   `job_on_hold`, `transition_requirements_unmet` (409, `details.missing`);
 *   `validation_error` (422); `csrf_failed`; `network_error`.
 */
export async function transitionDriverJob(
  reference: string,
  request: TransitionRequest,
  client: ApiClient = apiClient,
): Promise<JobStepResult> {
  const body = await client.request<unknown>(`${jobPath(reference)}/transition`, { method: 'POST', body: request })
  return parseStepResult(body)
}

/**
 * Record water collected at the source (`POST .../pickup`, row 13, FR-034).
 * Another source or a safety concern opens hold `source_review`.
 *
 * @throws {ApiError} 404 `order_not_found`; 409 `pickup_already_recorded`,
 *   `job_on_hold`, `invalid_order_transition`; 422 `validation_error`.
 */
export async function recordPickup(
  reference: string,
  request: PickupRequest,
  client: ApiClient = apiClient,
): Promise<DriverJobDetail> {
  const body = await client.request<unknown>(`${jobPath(reference)}/pickup`, { method: 'POST', body: request })
  return parse(driverJobDetailSchema, body)
}

/**
 * Record arrival (`POST .../arrive`, row 15), with a location only if the
 * driver agreed (FR-035). No delivery code is issued at arrival (#67).
 *
 * @throws {ApiError} 404; 409 `invalid_order_transition`, `job_on_hold`; 422.
 */
export async function arriveDriverJob(
  reference: string,
  request: LocationEvidence,
  client: ApiClient = apiClient,
): Promise<DriverJobDetail> {
  const body = await client.request<unknown>(`${jobPath(reference)}/arrive`, { method: 'POST', body: request })
  return parse(driverJobDetailSchema, body)
}

/**
 * Record one attempt to reach the customer (`POST .../contact-attempts`,
 * FR-038). The server records the time.
 *
 * @throws {ApiError} 404; 409 `invalid_order_transition`.
 */
export async function recordContactAttempt(reference: string, client: ApiClient = apiClient): Promise<DriverJobDetail> {
  const body = await client.request<unknown>(`${jobPath(reference)}/contact-attempts`, { method: 'POST' })
  return parse(driverJobDetailSchema, body)
}

/**
 * Record that unloading is complete (`POST .../unloading-complete`, #67):
 * the server issues the delivery code and sends it by SMS.
 *
 * @throws {ApiError} 404; 409 `invalid_order_transition`, `job_on_hold`.
 */
export async function completeUnloading(reference: string, client: ApiClient = apiClient): Promise<DriverJobDetail> {
  const body = await client.request<unknown>(`${jobPath(reference)}/unloading-complete`, { method: 'POST' })
  return parse(driverJobDetailSchema, body)
}

/**
 * Send the customer a new delivery code (`POST .../delivery-code`, FR-035).
 *
 * @throws {ApiError} 404; 409 `delivery_code_still_valid`,
 *   `invalid_order_transition`, `transition_requirements_unmet`; 429
 *   `rate_limited` (`details.retry_after_seconds`).
 */
export async function requestNewCode(reference: string, client: ApiClient = apiClient): Promise<DriverJobDetail> {
  const body = await client.request<unknown>(`${jobPath(reference)}/delivery-code`, { method: 'POST' })
  return parse(driverJobDetailSchema, body)
}

/**
 * Prove the delivery (`POST .../proof`, row 17, FR-035) with the customer's
 * code, or ask an administrator for other proof (202, hold `proof_review`).
 *
 * @returns The `done` job when delivered; the held live job for other proof.
 * @throws {ApiError} 400 `delivery_code_invalid` (`details.attempts_remaining`),
 *   `delivery_code_expired`; 409 `transition_requirements_unmet`,
 *   `job_on_hold`; 422; 404.
 */
export async function submitProof(
  reference: string,
  request: ProofRequest,
  client: ApiClient = apiClient,
): Promise<JobStepResult> {
  const body = await client.request<unknown>(`${jobPath(reference)}/proof`, { method: 'POST', body: request })
  return parseStepResult(body)
}

/**
 * Report a problem to the dispatcher (`POST .../incidents`, FR-036). It
 * changes no order status; the unsafe types stop the job (hold `unsafe_stop`).
 *
 * @throws {ApiError} 404; 409 `job_not_active`; 422.
 */
export async function reportIncident(
  reference: string,
  request: IncidentRequest,
  client: ApiClient = apiClient,
): Promise<IncidentRead> {
  const body = await client.request<unknown>(`${jobPath(reference)}/incidents`, { method: 'POST', body: request })
  return parse(incidentReadSchema, body)
}
