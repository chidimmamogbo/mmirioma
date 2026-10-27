/**
 * Partner job adapters (#12): the job lists, one job, accept and decline,
 * against the driver job endpoints in docs/api/deliveries.md (client:
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
 * Server errors pass through unchanged as `ApiError`.
 */
import { DECLINE_LABEL, type DeclineReason, type JobStage, type PartnerJob } from '../../../domain/partner'
import { apiClient, ApiError, type ApiClient } from '../../../lib/api/client'
import {
  acceptDriverJob,
  DECLINE_NOTE_MAX_LENGTH,
  declineDriverJob,
  getDriverJob,
  listDriverJobs,
  type DeclineRequest,
  type DriverJobDetail,
  type DriverJobSummary,
} from '../../../lib/api/driverJobs'
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
    accepted_at: null,
    collected_at: detail?.pickup?.picked_up_at ?? null,
    delivered_at: job.order_status === 'delivered' ? job.ended_at : null,
    pickup: null,
    remaining: null,
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
