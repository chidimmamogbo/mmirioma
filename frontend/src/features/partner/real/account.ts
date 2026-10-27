/**
 * Partner account adapters (#67): sign-up, profile and preferences, going
 * online, and notifications, against docs/api/partners.md. Conversions
 * follow its "Mapping to the design types" and
 * docs/architecture/api-mapping.md. Fields the contract does not return keep
 * the screen's empty or "not connected yet" state, never made-up values:
 *
 * - `email`: `null`; saving one fails with `not_connected` (no partner email
 *   in the pilot, partners.md decision 5).
 * - `preferences.offers_and_news`: `false`; changing it fails with
 *   `not_connected` (decision 5).
 * - `documents`: `[]`; uploads stay on their own `notConnected` (decision 6).
 * - `payout_account_ending`: `null`; earnings and payouts stay unlinked
 *   (decision 7).
 *
 * Server errors pass through unchanged as `ApiError`, except sign-up field
 * errors, which `partnerSignup` renames to the form's fields.
 */
import type {
  ApprovalStatus,
  PartnerNotification,
  PartnerNotificationList,
  PartnerProfile,
  PartnerSignupInput,
  VehicleType,
} from '../../../domain/partner'
import { litresFromGallons } from '../../../domain/quantity'
import type { Session } from '../../../lib/api/auth'
import { apiClient, ApiError, type ApiClient } from '../../../lib/api/client'
import { notConnected } from '../../../lib/api/notConnected'
import {
  getDriverProfile,
  listDriverNotifications,
  listServiceZoneOptions,
  markDriverNotificationsRead,
  registerPartner,
  setDriverAvailability,
  updateDriverProfile,
  type NotificationRead,
  type PartnerProfileRead,
  type ZoneOption,
} from '../../../lib/api/partners'

const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'suspended']
const NOTIFICATION_KINDS: readonly PartnerNotification['kind'][] = [
  'assigned',
  'new_orders',
  'payout',
  'station_closed',
  'papers_due',
  'reassigned',
  'account',
]

/**
 * The design's vehicle type. `delivery_type` is `null` only for drivers made
 * with the command-line tool before it asked; a declared tank capacity then
 * means a tanker, anything else a Keke (agreed for #67).
 */
function vehicleType(vehicle: PartnerProfileRead['vehicle']): VehicleType {
  return vehicle.delivery_type ?? (vehicle.declared_capacity_gallons !== null ? 'tanker' : 'keke')
}

/** Admin's vehicle text, else built from the sign-up details in the mock's words. */
function vehicleDescription(vehicle: PartnerProfileRead['vehicle'], type: VehicleType): string {
  if (vehicle.description !== null) return vehicle.description
  if (type === 'keke') return 'Tricycle'
  const gallons = vehicle.declared_capacity_gallons
  if (gallons === null) return 'Tanker'
  const litres = vehicle.declared_capacity_litres ?? litresFromGallons(gallons)
  return `${gallons.toLocaleString('en-NG')} gal (${litres.toLocaleString('en-NG')} L) tank`
}

/** `transfer_methods` in words. Empty until admin sets them at approval (partners.md, question 4). */
function pourInto(methods: string[]): string {
  const ground = methods.includes('ground')
  const overhead = methods.includes('overhead')
  if (ground && overhead) return 'Ground and overhead tanks'
  if (ground) return 'Ground tanks'
  if (overhead) return 'Overhead tanks'
  return 'Not set yet'
}

/**
 * Backend partner profile to the design's `PartnerProfile`.
 *
 * An `approval_status` this build does not know is read as `pending`: the
 * partner cannot go online from the screen, and the server still decides.
 */
export function partnerProfileFromRead(read: PartnerProfileRead): PartnerProfile {
  const type = vehicleType(read.vehicle)
  return {
    name: read.name,
    phone: read.phone,
    email: null,
    approval: APPROVAL_STATUSES.find((s) => s === read.approval_status) ?? 'pending',
    online: read.is_available,
    partner_since: read.partner_since,
    vehicle: {
      type,
      plate: read.vehicle.plate ?? '',
      description: vehicleDescription(read.vehicle, type),
      tank_gallons: read.vehicle.declared_capacity_gallons,
      safe_load_litres: read.vehicle.safe_payload_litres,
      can_pour_into: pourInto(read.vehicle.transfer_methods),
    },
    service_areas: read.service_zones.map((zone) => zone.name),
    documents: [],
    preferences: { ...read.preferences, offers_and_news: false },
    payout_account_ending: null,
  }
}

const isKnownKind = (kind: string): kind is PartnerNotification['kind'] => (NOTIFICATION_KINDS as readonly string[]).includes(kind)

/**
 * Backend notifications to the design's list. A `kind` this build does not
 * know is shown as `account`, the neutral style, with the server's title and
 * body: partners.md says clients show such a message rather than fail or
 * hide it (@chidimmamogbo on PR #69). The screen has no icon of its own for
 * it, and tapping it opens the profile.
 */
export function partnerNotificationsFromRead(items: NotificationRead[]): PartnerNotification[] {
  return items.map((n) => ({
    id: n.id,
    kind: isKnownKind(n.kind) ? n.kind : 'account',
    title: n.title,
    body: n.body,
    at: n.created_at,
    read: n.read_at !== null,
    reference: n.reference,
  }))
}

const zoneKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** The form's message for an area no active zone matches. */
function areaNotServedMessage(area: string, zones: ZoneOption[]): string {
  const served = zones.length ? ` Areas we serve: ${zones.map((z) => z.name).join(', ')}.` : ''
  return `We do not serve "${area.trim()}" yet.${served}`
}

type FieldError = { loc?: unknown[]; msg?: string; type?: string }

/** Contract field names to the sign-up form's, so the screen puts server errors under the right field. */
const SIGNUP_FIELD: Record<string, string> = { declared_capacity_gallons: 'tank_gallons', delivery_type: 'vehicle_type', service_zone_id: 'service_area' }

/**
 * Sign up (`POST /auth/partner-register`). The screen's free-text area is
 * matched to an active zone from `GET /service-zones` by name, ignoring case
 * and extra spaces (agreed for #67; partners.md maps `service_area` to
 * `service_zone_id`).
 *
 * @throws {ApiError} `validation_error` (422) with `details` named after the
 *   form's fields: from the server, or made here for an area no zone matches
 *   (`service_area`, nothing sent). A zone the server refuses keeps the other
 *   field errors and gets the same area message. Also
 *   `phone_already_registered` (409) and `too_many_attempts` (429).
 */
export async function partnerSignup(input: PartnerSignupInput, client: ApiClient = apiClient): Promise<Session> {
  const zones = await listServiceZoneOptions(undefined, client)
  const zone = zones.find((z) => zoneKey(z.name) === zoneKey(input.service_area))
  if (!zone) {
    const msg = areaNotServedMessage(input.service_area, zones)
    throw new ApiError({
      kind: 'http',
      status: 422,
      code: 'validation_error',
      message: msg,
      details: [{ loc: ['body', 'service_area'], msg, type: 'value_error' }],
    })
  }
  try {
    return await registerPartner(
      {
        name: input.name,
        phone: input.phone,
        password: input.password,
        delivery_type: input.vehicle_type,
        plate: input.plate,
        declared_capacity_gallons: input.vehicle_type === 'tanker' ? input.tank_gallons : null,
        service_zone_id: zone.id,
      },
      client,
    )
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'validation_error' || !Array.isArray(error.details)) throw error
    const details = (error.details as FieldError[]).map((d): FieldError => {
      const last = d.loc?.at(-1)
      if (typeof last !== 'string' || !Object.hasOwn(SIGNUP_FIELD, last)) return d
      const field = SIGNUP_FIELD[last]
      // The zone closed between the list and the sign-up: say it in the form's words.
      const msg = field === 'service_area' ? areaNotServedMessage(input.service_area, []) : d.msg
      return { ...d, loc: [...d.loc!.slice(0, -1), field], msg }
    })
    throw new ApiError({ kind: error.kind, status: error.status, code: error.code, message: error.message, details, cause: error })
  }
}

/** The signed-in partner's profile (`GET /driver/profile`). */
export async function getPartnerProfile(client: ApiClient = apiClient): Promise<PartnerProfile> {
  return partnerProfileFromRead(await getDriverProfile(undefined, client))
}

/**
 * Change preferences (`PATCH /driver/profile`). Email and "News and offers"
 * have no field in the contract (decision 5), so a change to either fails
 * with `not_connected` before anything is sent.
 */
export async function updatePartnerProfile(
  update: { email?: string | null; preferences?: Partial<PartnerProfile['preferences']> },
  client: ApiClient = apiClient,
): Promise<PartnerProfile> {
  if (update.email !== undefined) return notConnected('Email')
  const { offers_and_news: offers, ...preferences } = update.preferences ?? {}
  if (offers !== undefined) return notConnected('News and offers')
  return partnerProfileFromRead(await updateDriverProfile({ preferences }, client))
}

/** Go online or offline (`PUT /driver/availability`). */
export async function setOnline(online: boolean, client: ApiClient = apiClient): Promise<PartnerProfile> {
  return partnerProfileFromRead(await setDriverAvailability(online, client))
}

/**
 * The newest page (50) of the partner's notifications
 * (`GET /driver/notifications`), with the server's `unread_count` across all
 * pages for the badges and "Mark all read".
 */
export async function listPartnerNotifications(client: ApiClient = apiClient): Promise<PartnerNotificationList> {
  const page = await listDriverNotifications({}, undefined, client)
  return { items: partnerNotificationsFromRead(page.items), unread_count: page.unread_count }
}

/** Mark every unread notification read (`POST /driver/notifications/read`, no ids). */
export async function markPartnerNotificationsRead(client: ApiClient = apiClient): Promise<void> {
  await markDriverNotificationsRead(undefined, client)
}
