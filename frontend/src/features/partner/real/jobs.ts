/**
 * Partner job adapters (#12, #13): the job lists, one job, accept and
 * decline, the trip steps and problem reports, against the driver job
 * endpoints in docs/api/deliveries.md (client:
 * `lib/api/driverJobs.ts`). Conversions follow
 * docs/architecture/api-mapping.md, "Partner job stage", "Partner job fields
 * the backend does not send" and "Available orders and declining". A field
 * the backend does not send is `null` and the screens leave it out; nothing
 * is filled in:
 *
 * - `choice`, `tank_note`: `null` until #21 sends the cans or tank to jobs.
 * - distances and minutes: `null`, no OSRM (SRS §12.1).
 * - `earning_minor_units`: `null`, partner pay is out of the MVP.
 * - `assigned_by`, `accepted_at`, `code_resend_at`, `pickup`, `remaining`:
 *   `null`, the job does not carry them.
 * - receiver, addresses and code tries: `null` when the job does not carry
 *   them (offers, ended jobs, before the code is issued).
 *
 * The fork's trip has fewer steps than the backend, so one partner step sends
 * several backend steps, each only if the job has not made it yet, so a
 * retry carries on where the last attempt stopped (agreed for #13):
 *
 * - `confirmPickup`: `departed`, the pickup, `en_route`.
 * - `completeUnloading`: arrival (no location), `unloading`, unloading
 *   complete (the server sends the code).
 * - `verifyCode`: the proof, with the litres recorded at pickup.
 *
 * Arrival and the unreachable customer (#250, FR-038) are separate steps, one
 * request each: `arriveAtCustomer`, `startUnloading`, `recordContactAttempt`
 * and `failUnreachable`.
 *
 * Server errors pass through unchanged as `ApiError`, except the wrong-code
 * errors, renamed to the codes the code screen reads.
 */
import { DECLINE_LABEL, ISSUE_LABEL, type DeclineReason, type JobStage, type PartnerIssueType, type PartnerJob } from '../../../domain/partner'
import { litresFromGallons } from '../../../domain/quantity'
import { formatDayDate } from '../../../lib/format/datetime'
import { apiClient, ApiError, type ApiClient } from '../../../lib/api/client'
import {
  acceptDriverJob,
  arriveDriverJob,
  completeUnloading as completeDriverUnloading,
  DECLINE_NOTE_MAX_LENGTH,
  declineDriverJob,
  getDriverJob,
  listDriverJobs,
  recordContactAttempt as recordDriverContactAttempt,
  recordPickup,
  reportIncident,
  requestNewCode,
  submitProof,
  transitionDriverJob,
  type DeclineRequest,
  type DriverJobDetail,
  type DriverJobSummary,
  type IncidentRequest,
  type JobStepResult,
} from '../../../lib/api/driverJobs'
import { notConnected } from '../../../lib/api/notConnected'
import { getPartnerProfile } from './account'

/** Shown for the station while the dispatcher has not picked a water source (agreed for #12). */
export const STATION_NOT_SET = 'Station not set yet'
/** Shown for the delivery place in the rare case the job has no address line. */
export const ADDRESS_NOT_KNOWN = 'Address not known yet'

/**
 * The design's stage (api-mapping.md, "Partner job stage"). An offer is
 * `assigned` (the partner may accept or decline). Otherwise the order status
 * decides. Statuses before dispatch cannot belong to an accepted job; if one
 * ever does, it reads as `accepted` rather than failing.
 */
export function jobStage(job: Pick<DriverJobSummary, 'job_status' | 'order_status'>): JobStage {
  if (job.job_status === 'offered') return 'assigned'
  switch (job.order_status) {
    case 'collected':
    case 'en_route':
    case 'arrived':
    case 'unloading':
      return 'collected'
    case 'delivered':
      return 'delivered'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
    case 'disputed':
      return 'under_review'
    default:
      return 'accepted'
  }
}

/** Backend job (list summary or detail) to the design's `PartnerJob`. */
export function partnerJobFromRead(job: DriverJobSummary | DriverJobDetail): PartnerJob {
  const detail = 'allowed_actions' in job ? job : null
  const stationName = detail?.source?.name ?? job.source_name ?? STATION_NOT_SET
  const area = job.delivery_area ?? ADDRESS_NOT_KNOWN
  return {
    reference: job.order_reference,
    quantity_litres: job.quantity_litres,
    choice: null,
    tank_note: null,
    station: {
      name: stationName,
      address: detail?.source?.approximate_location ?? null,
      area: stationName,
      distance_km: null,
      minutes: null,
    },
    customer: {
      name: area,
      address: detail?.delivery_address ?? null,
      area,
      landmark: detail?.landmark ?? null,
      distance_km: null,
      minutes: null,
      contact_name: detail?.receiver?.display_name ?? null,
      phone: detail?.receiver?.phone ?? null,
    },
    instructions: detail?.delivery_instructions ?? null,
    earning_minor_units: null,
    stage: jobStage(job),
    assigned_by: null,
    code_tries_left: detail?.delivery_code?.attempts_left ?? null,
    code_resend_at: null,
    code_sms_status: detail?.delivery_code?.sms_status ?? null,
    accepted_at: null,
    collected_at: detail?.pickup?.picked_up_at ?? null,
    delivered_at: job.order_status === 'delivered' ? job.ended_at : null,
    pickup: null,
    remaining: null,
    cash: job.cash,
    ...(detail
      ? {
          // Arrival and the unreachable customer (#250). The two flags come from the server's own list of what
          // the driver may do now, never from the phone's clock (design decision 6).
          arrived_at: detail.arrived_at,
          contact_attempts: detail.contact_attempts.map((attempt) => attempt.attempted_at),
          unreachable_allowed_at: detail.unreachable_allowed_at,
          can_start_unloading: detail.allowed_actions.includes('start_unloading'),
          can_fail_unreachable: detail.allowed_actions.includes('record_failed_attempt'),
        }
      : {}),
  }
}

/**
 * The pool of jobs any partner may take. The MVP has no pool: offers reach
 * one partner through `GET /driver/jobs` (`offers`, FR-031, FR-032), so this
 * is always empty and the screen shows its normal empty state
 * (api-mapping.md, "Available orders and declining").
 */
export async function listAvailableJobs(): Promise<PartnerJob[]> {
  return []
}

/** Offers, then today's and upcoming accepted jobs (`GET /driver/jobs`). */
export async function listMyActiveJobs(client: ApiClient = apiClient): Promise<PartnerJob[]> {
  const list = await listDriverJobs(undefined, client)
  return [...list.offers, ...list.today, ...list.upcoming].map(partnerJobFromRead)
}

/** Ended jobs, newest first as the server orders them (`done` of `GET /driver/jobs`). */
export async function listHistory(client: ApiClient = apiClient): Promise<PartnerJob[]> {
  return (await listDriverJobs(undefined, client)).done.map(partnerJobFromRead)
}

/**
 * One job (`GET /driver/jobs/{reference}`). That endpoint answers 404 once a
 * job has ended, so an ended job is taken from the `done` list instead, with
 * the summary fields only (@chidimmamogbo on #12).
 *
 * @throws {ApiError} `order_not_found` (404) when the job is in no list either.
 */
export async function getJob(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  try {
    return partnerJobFromRead(await getDriverJob(reference, undefined, client))
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'order_not_found') throw error
    const ended = (await listDriverJobs(undefined, client)).done.find((job) => job.order_reference === reference)
    if (!ended) throw error
    return partnerJobFromRead(ended)
  }
}

/** Accept an offer (`POST .../accept`, FR-032). */
export async function acceptJob(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  return partnerJobFromRead(await acceptDriverJob(reference, client))
}

/** The design's decline reasons to the backend's (api-mapping.md, "Available orders and declining"). */
const BACKEND_REASON: Record<DeclineReason, DeclineRequest['reason']> = {
  not_available: 'not_available',
  too_large: 'vehicle_cannot_carry',
  outside_area: 'too_far',
  vehicle_problem: 'other',
  station_unavailable: 'other',
}

/**
 * The decline body. For `other`, the design's label comes first so the
 * dispatcher sees what the partner chose (FR-032), then the partner's note,
 * cut so the whole text fits in 300 characters.
 */
export function declineRequest(reason: DeclineReason, note: string, label: string): DeclineRequest {
  const backendReason = BACKEND_REASON[reason]
  const trimmed = note.trim()
  if (backendReason !== 'other') return { reason: backendReason, note: trimmed ? trimmed.slice(0, DECLINE_NOTE_MAX_LENGTH) : null }
  const text = trimmed ? `${label}. ${trimmed}` : label
  return { reason: 'other', note: text.slice(0, DECLINE_NOTE_MAX_LENGTH) }
}

/**
 * Decline an offer with a reason (`POST .../decline`, FR-032). The label of a
 * reason sent as `other` names the partner's vehicle ("My tanker has a
 * problem"), so the profile is read for those.
 */
export async function declineJob(reference: string, reason: DeclineReason, note: string, client: ApiClient = apiClient): Promise<void> {
  const label = BACKEND_REASON[reason] === 'other' ? DECLINE_LABEL[reason]((await getPartnerProfile(client)).vehicle.type) : ''
  await declineDriverJob(reference, declineRequest(reason, note, label), client)
}

/** The live job after a step: a `done` summary once it has ended. */
const stepJob = (result: JobStepResult): DriverJobDetail | DriverJobSummary => result.job

/**
 * Litres collected, from what the partner confirmed: the tanker's gallon
 * count (4 L each, FR-021), or the ordered litres for a Keke, whose screen
 * only lets the rider leave with every can loaded.
 */
export function collectedLitres(job: Pick<DriverJobDetail, 'quantity_litres'>, gallonsLoaded: number | null): number {
  return gallonsLoaded === null ? job.quantity_litres : litresFromGallons(gallonsLoaded)
}

/**
 * Replaces the server's generic text for a Start job refused before the
 * delivery day (409 `transition_requirements_unmet` with
 * `details.missing` containing `delivery_day_reached`, issue #241) with one
 * that names the day. The code and details stay as the server sent them.
 * Any other error, or a job with no window, is returned unchanged.
 *
 * @param error - What the Start job request threw.
 * @param windowStartAt - The job's delivery window start (UTC ISO), or `null`.
 */
function withDeliveryDayMessage(error: unknown, windowStartAt: string | null): unknown {
  if (!(error instanceof ApiError) || error.code !== 'transition_requirements_unmet' || windowStartAt === null) return error
  const missing = (error.details as { missing?: unknown } | null)?.missing
  if (!Array.isArray(missing) || !missing.includes('delivery_day_reached')) return error
  return new ApiError({
    kind: error.kind,
    status: error.status,
    code: error.code,
    message: `This job can start from ${formatDayDate(windowStartAt)}. Come back on that day.`,
    details: error.details,
    cause: error,
  })
}

/**
 * Pickup (`refill`, `pickup` and `loading` screens): Start job (`departed`),
 * the pickup at the job's assigned source, then Leave for customer
 * (`en_route`). The receipt tick and the photo have no field in the
 * contract and are not sent.
 *
 * @throws {ApiError} `transition_requirements_unmet` (`delivery_day_reached`)
 *   before the delivery day; `job_on_hold`; `pickup_already_recorded`;
 *   `validation_error` (for example no source assigned); `order_not_found`.
 */
export async function confirmPickup(
  reference: string,
  pickup: { loaded: boolean; receipt: boolean; photo_url: string | null; gallons_loaded: number | null },
  client: ApiClient = apiClient,
): Promise<PartnerJob> {
  let job: DriverJobDetail | DriverJobSummary = await getDriverJob(reference, undefined, client)
  if (job.order_status === 'accepted') {
    const windowStartAt = job.delivery_window_start_at
    try {
      job = stepJob(await transitionDriverJob(reference, { to: 'departed' }, client))
    } catch (error) {
      throw withDeliveryDayMessage(error, windowStartAt)
    }
  }
  if (job.order_status === 'departed') {
    job = await recordPickup(
      reference,
      {
        source: { assigned: true },
        source_reference: null,
        volume_collected_litres: collectedLitres(job, pickup.gallons_loaded),
        picked_up_at: new Date().toISOString(),
        safety_concern: false,
        safety_note: null,
      },
      client,
    )
  }
  if (job.order_status === 'collected') job = stepJob(await transitionDriverJob(reference, { to: 'en_route' }, client))
  return partnerJobFromRead(job)
}

/**
 * "Unloading done, send the code" (code screen): arrival without a location
 * (the fork asks for no location consent, FR-035), Start unloading, then
 * unloading complete, which sends the customer's code by SMS.
 *
 * @throws {ApiError} `job_on_hold`; `invalid_order_transition`; `order_not_found`.
 */
export async function completeUnloading(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  let job: DriverJobDetail | DriverJobSummary = await getDriverJob(reference, undefined, client)
  if (job.order_status === 'en_route') job = await arriveDriverJob(reference, { location_consent: false }, client)
  if (job.order_status === 'arrived') job = stepJob(await transitionDriverJob(reference, { to: 'unloading' }, client))
  if (job.order_status === 'unloading' && 'allowed_actions' in job && job.unloading_completed_at === null) {
    job = await completeDriverUnloading(reference, client)
  }
  return partnerJobFromRead(job)
}

/**
 * "I have arrived" (U1): records the arrival (`POST .../arrive`). No location
 * is sent: the fork asks for no location consent (FR-035), so the time is the
 * moment the partner tapped. Repeating returns the job unchanged.
 *
 * @throws {ApiError} `invalid_order_transition`; `job_on_hold`; `order_not_found`.
 */
export async function arriveAtCustomer(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  return partnerJobFromRead(await arriveDriverJob(reference, { location_consent: false }, client))
}

/**
 * "Start unloading" (U2): the `unloading` step. The code is sent later, by
 * `completeUnloading`.
 *
 * @throws {ApiError} `invalid_order_transition`; `job_on_hold`; `order_not_found`.
 */
export async function startUnloading(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  return partnerJobFromRead(stepJob(await transitionDriverJob(reference, { to: 'unloading' }, client)))
}

/**
 * "I tried to reach the customer" (U3): records one attempt
 * (`POST .../contact-attempts`, FR-038). The server stamps the time and sets
 * no maximum, so every attempt is kept. The returned job lists them all.
 *
 * @throws {ApiError} `invalid_order_transition`; `order_not_found`.
 */
export async function recordContactAttempt(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  return partnerJobFromRead(await recordDriverContactAttempt(reference, client))
}

/**
 * "Fail the delivery" (U3-S): ends the job as "customer not reachable"
 * (`transition` `failed`; the server sets the reason `customer_unreachable`).
 * The server refuses until two attempts are recorded and the full 10 minutes
 * have passed since arrival (FR-038, T-25). The answer is the finished job.
 *
 * @throws {ApiError} `transition_requirements_unmet` with `details.missing` of
 *   `contact_attempts_recorded` and/or `unreachable_wait_elapsed`;
 *   `invalid_order_transition`; `job_on_hold`; `order_not_found`.
 */
export async function failUnreachable(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  return partnerJobFromRead(stepJob(await transitionDriverJob(reference, { to: 'failed' }, client)))
}

/**
 * The backend's wrong-code errors under the codes the code screen reads:
 * `invalid_code` with `details.tries_left`, or `code_locked` once no tries
 * are left. Anything else passes through.
 */
export function codeError(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.code !== 'delivery_code_invalid') return error
  const details = error.details as { attempts_remaining?: unknown } | null
  const left = typeof details?.attempts_remaining === 'number' ? details.attempts_remaining : null
  const locked = left === 0
  return new ApiError({
    kind: error.kind,
    status: error.status,
    code: locked ? 'code_locked' : 'invalid_code',
    message: error.message,
    details: locked ? null : { tries_left: left },
    cause: error,
  })
}

/**
 * Verify the customer's code: the proof (`POST .../proof`) with the litres
 * recorded at pickup (agreed for #13), unloading confirmed, no location.
 *
 * @throws {ApiError} `invalid_code` (`details.tries_left`), `code_locked`,
 *   `delivery_code_expired`, `transition_requirements_unmet`, `job_on_hold`.
 */
export async function verifyCode(reference: string, code: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  const job = await getDriverJob(reference, undefined, client)
  if (!job.pickup) {
    throw new ApiError({ kind: 'parse', status: null, code: 'invalid_response', message: 'This job has no pickup recorded, so the delivered litres are not known.' })
  }
  try {
    const result = await submitProof(
      reference,
      {
        delivered_litres: job.pickup.volume_collected_litres,
        unloading_confirmed: true,
        delivery_code: code,
        alternative_proof: null,
        location: null,
        location_consent: false,
      },
      client,
    )
    return partnerJobFromRead(result.job)
  } catch (error) {
    throw codeError(error)
  }
}

/**
 * Send the customer a new code (`POST .../delivery-code`).
 *
 * @throws {ApiError} `delivery_code_still_valid`; `rate_limited`
 *   (`details.retry_after_seconds`); `transition_requirements_unmet`.
 */
export async function resendCode(reference: string, client: ApiClient = apiClient): Promise<PartnerJob> {
  return partnerJobFromRead(await requestNewCode(reference, client))
}

/** Longest incident note the server accepts. */
export const INCIDENT_NOTE_MAX_LENGTH = 500

/** The design's problem types to the backend's incident types (agreed for #13). */
const INCIDENT_TYPE: Record<PartnerIssueType, IncidentRequest['type']> = {
  unsafe_pour: 'unsafe_transfer',
  station_problem: 'source_concern',
  vehicle_breakdown: 'vehicle_problem',
  bad_address: 'other',
  code_not_working: 'other',
  customer_unreachable: 'other',
}

/**
 * The incident body. For `other`, the design's label comes first so the
 * dispatcher sees what the partner chose, then the partner's note, cut to
 * 500 characters.
 */
export function incidentRequest(type: PartnerIssueType, note: string, label: string): IncidentRequest {
  const backendType = INCIDENT_TYPE[type]
  const trimmed = note.trim()
  const text = backendType === 'other' ? (trimmed ? `${label}. ${trimmed}` : label) : trimmed
  return { type: backendType, note: text ? text.slice(0, INCIDENT_NOTE_MAX_LENGTH) : null, new_estimated_arrival_at: null }
}

/**
 * Report a problem on a job (`POST .../incidents`, FR-036). The unsafe type
 * stops the job (hold `unsafe_stop`). A report with no job has no driver
 * endpoint yet.
 *
 * @throws {ApiError} `not_connected` without a job; `job_not_active`;
 *   `validation_error`; `order_not_found`.
 */
export async function reportIssue(
  input: { type: PartnerIssueType; note: string; reference: string | null },
  client: ApiClient = apiClient,
): Promise<{ id: string }> {
  if (input.reference === null) return notConnected('Reporting a problem without an order')
  const label = INCIDENT_TYPE[input.type] === 'other' ? ISSUE_LABEL[input.type]((await getPartnerProfile(client)).vehicle.type) : ''
  const incident = await reportIncident(input.reference, incidentRequest(input.type, input.note, label), client)
  return { id: incident.id }
}
