import { describe, expect, it, vi } from 'vitest'
import driverJobAccepted from '../../../../../docs/api/examples/driver-job-accepted.json'
import driverJobDetail from '../../../../../docs/api/examples/driver-job-detail.json'
import driverJobOffer from '../../../../../docs/api/examples/driver-job-offer.json'
import unloadingComplete from '../../../../../docs/api/examples/driver-job-unloading-complete.json'
import driverJobs from '../../../../../docs/api/examples/driver-jobs.json'
import driverJobUnreachable from '../../../../../docs/api/examples/driver-job-unreachable.json'
import codeExpired from '../../../../../docs/api/examples/error-delivery-code-expired.json'
import codeInvalid from '../../../../../docs/api/examples/error-delivery-code-invalid.json'
import orderNotFound from '../../../../../docs/api/examples/error-order-not-found.json'
import partnerProfile from '../../../../../docs/api/examples/partner-profile.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { DECLINE_NOTE_MAX_LENGTH, type DriverJobDetail, type DriverJobSummary } from '../../../lib/api/driverJobs'
import {
  acceptJob,
  arriveAtCustomer,
  codeError,
  collectedLitres,
  completeUnloading,
  confirmPickup,
  declineJob,
  declineRequest,
  failUnreachable,
  getJob,
  INCIDENT_NOTE_MAX_LENGTH,
  incidentRequest,
  jobStage,
  listAvailableJobs,
  listHistory,
  listMyActiveJobs,
  partnerJobFromRead,
  recordContactAttempt,
  reportIssue,
  resendCode,
  startUnloading,
  STATION_NOT_SET,
  verifyCode,
} from './jobs'

type Reply = { body: unknown; status?: number }

/** A client whose `fetch` answers each request with the next reply, recording what was sent. */
function setup(...replies: Reply[]) {
  const queue = [...replies]
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const { body, status = 200 } = queue.shift() ?? { body: null, status: 500 }
    return status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call]
    const request = init as RequestInit
    return { url: String(url), method: request.method ?? 'GET', body: request.body ? JSON.parse(String(request.body)) : null }
  }
  return { client, fetchMock, sent }
}

const envelope = (code: string, details: unknown = null) => ({ error: { code, message: `Sample ${code}`, details } })

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const JOBS = 'http://api.test/api/v1/driver/jobs'
const doneJob = driverJobs.done[0] as DriverJobSummary
const offerSummary: DriverJobSummary = { ...(driverJobs.upcoming[0] as DriverJobSummary), order_reference: 'MO-OFFER00001', section: 'offer', job_status: 'offered', order_status: 'assigned' }

describe('jobStage (api-mapping.md, "Partner job stage")', () => {
  it.each([
    ['offered', 'assigned', 'assigned'],
    ['accepted', 'accepted', 'accepted'],
    ['accepted', 'departed', 'accepted'],
    ['accepted', 'collected', 'collected'],
    ['accepted', 'en_route', 'collected'],
    ['accepted', 'arrived', 'collected'],
    ['accepted', 'unloading', 'collected'],
    ['completed', 'delivered', 'delivered'],
    ['completed', 'cancelled', 'cancelled'],
    ['completed', 'failed', 'failed'],
    ['completed', 'disputed', 'under_review'],
  ] as const)('job %s, order %s is %s', (job_status, order_status, stage) => {
    expect(jobStage({ job_status, order_status })).toBe(stage)
  })
})

describe('partnerJobFromRead', () => {
  it('converts an offer: no receiver yet (FR-032), nothing invented', () => {
    const job = partnerJobFromRead(driverJobOffer as never)
    expect(job).toMatchObject({
      reference: driverJobOffer.order_reference,
      quantity_litres: driverJobOffer.quantity_litres,
      choice: null,
      stage: 'assigned',
      earning_minor_units: null,
      assigned_by: null,
      code_tries_left: null,
      station: { name: 'Sample Borehole A', address: 'Near the market gate, Trans-Ekulu', distance_km: null, minutes: null },
      customer: { address: '9 Sample Crescent, Trans-Ekulu, Enugu', contact_name: null, phone: null, distance_km: null, minutes: null },
    })
  })

  it('converts an accepted job with its receiver', () => {
    const job = partnerJobFromRead(driverJobAccepted as never)
    expect(job.stage).toBe('accepted')
    expect(job.customer).toMatchObject({ contact_name: 'Chika O.', phone: '+2348000000002', landmark: 'Next to the yellow kiosk' })
  })

  it('has no code tries before the code is issued, and reads the pickup time', () => {
    const job = partnerJobFromRead(driverJobDetail as never)
    expect([job.stage, job.code_tries_left, job.collected_at]).toEqual(['collected', null, '2026-10-19T08:20:00Z'])
  })

  it('reads the code tries once the code is issued', () => {
    expect(partnerJobFromRead(unloadingComplete as never).code_tries_left).toBe(5)
  })

  it('carries whether the code SMS was accepted or failed (#138)', () => {
    const detail = unloadingComplete as unknown as DriverJobDetail
    const failed = { ...detail, delivery_code: { ...detail.delivery_code!, sms_status: 'failed' as const } }
    expect(partnerJobFromRead(detail).code_sms_status).toBe('accepted')
    expect(partnerJobFromRead(failed).code_sms_status).toBe('failed')
    expect(partnerJobFromRead(driverJobDetail as never).code_sms_status).toBeNull()
  })

  it('converts an ended summary with the delivery time and no address or receiver', () => {
    const job = partnerJobFromRead(doneJob)
    expect(job.stage).toBe('delivered')
    expect(job.delivered_at).toBe(doneJob.ended_at)
    expect(job.customer).toMatchObject({ address: null, contact_name: null, phone: null, area: doneJob.delivery_area })
  })

  it('names the station as not set while no source is picked', () => {
    expect(partnerJobFromRead({ ...doneJob, source_name: null }).station.name).toBe(STATION_NOT_SET)
  })
})

describe('partner job adapters (#12)', () => {
  it('listAvailableJobs is always empty: no pool in the MVP', async () => {
    expect(await listAvailableJobs()).toEqual([])
  })

  it('listMyActiveJobs lists offers first, then today and upcoming', async () => {
    const { client, sent } = setup({ body: { ...driverJobs, offers: [offerSummary] } })
    const jobs = await listMyActiveJobs(client)
    expect(sent()).toMatchObject({ url: JOBS, method: 'GET' })
    expect(jobs.map((j) => [j.reference, j.stage])).toEqual([
      ['MO-OFFER00001', 'assigned'],
      [driverJobs.upcoming[0].order_reference, 'accepted'],
    ])
  })

  it('listMyActiveJobs passes a 401 through', async () => {
    const error = await rejection(listMyActiveJobs(setup({ body: envelope('not_authenticated'), status: 401 }).client))
    expect(error.code).toBe('not_authenticated')
  })

  it('listHistory lists the ended jobs', async () => {
    const jobs = await listHistory(setup({ body: driverJobs }).client)
    expect(jobs.map((j) => j.reference)).toEqual([doneJob.order_reference])
  })

  it('listHistory reports a list with the wrong shape as invalid_response', async () => {
    const error = await rejection(listHistory(setup({ body: { ...driverJobs, done: 'nope' } }).client))
    expect(error.code).toBe('invalid_response')
  })

  it('getJob reads one live job', async () => {
    const { client, sent } = setup({ body: driverJobAccepted })
    const job = await getJob(driverJobAccepted.order_reference, client)
    expect(sent().url).toBe(`${JOBS}/${driverJobAccepted.order_reference}`)
    expect(job.customer.contact_name).toBe('Chika O.')
  })

  it('getJob takes an ended job from the done list after a 404', async () => {
    const { client, sent } = setup({ body: orderNotFound, status: 404 }, { body: driverJobs })
    const job = await getJob(doneJob.order_reference, client)
    expect(sent(1).url).toBe(JOBS)
    expect([job.reference, job.stage]).toEqual([doneJob.order_reference, 'delivered'])
  })

  it('getJob passes order_not_found through when the job is in no list', async () => {
    const { client } = setup({ body: orderNotFound, status: 404 }, { body: driverJobs })
    const error = await rejection(getJob('MO-NOTMINE0001', client))
    expect([error.status, error.code]).toEqual([404, 'order_not_found'])
  })

  it('acceptJob returns the accepted job', async () => {
    const { client, sent } = setup({ body: driverJobAccepted })
    const job = await acceptJob(driverJobAccepted.order_reference, client)
    expect(sent()).toMatchObject({ url: `${JOBS}/${driverJobAccepted.order_reference}/accept`, method: 'POST' })
    expect(job.stage).toBe('accepted')
  })

  it('acceptJob passes order_not_found through when the offer is gone', async () => {
    const error = await rejection(acceptJob('MO-GONE000001', setup({ body: orderNotFound, status: 404 }).client))
    expect(error.code).toBe('order_not_found')
  })

  it('declineJob maps a design reason to the backend one and sends the note', async () => {
    const { client, sent } = setup({ body: null, status: 204 })
    await declineJob('MO-OFFER00001', 'too_large', '  Too heavy for me today  ', client)
    expect(sent()).toEqual({ url: `${JOBS}/MO-OFFER00001/decline`, method: 'POST', body: { reason: 'vehicle_cannot_carry', note: 'Too heavy for me today' } })
  })

  it('declineJob sends the vehicle label first for reasons sent as other', async () => {
    const { client, sent } = setup({ body: partnerProfile }, { body: null, status: 204 })
    await declineJob('MO-OFFER00001', 'vehicle_problem', 'Flat tyre', client)
    expect(sent(0).url).toBe('http://api.test/api/v1/driver/profile')
    expect(sent(1).body).toEqual({ reason: 'other', note: 'My keke has a problem. Flat tyre' })
  })

  it('declineJob passes forbidden through for an accepted job', async () => {
    const error = await rejection(declineJob('MO-1', 'not_available', '', setup({ body: envelope('forbidden'), status: 403 }).client))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })
})

describe('declineRequest', () => {
  it('maps every design reason (api-mapping.md) and never sends unsafe_access', () => {
    expect(declineRequest('not_available', '', 'x')).toEqual({ reason: 'not_available', note: null })
    expect(declineRequest('outside_area', 'Far', 'x')).toEqual({ reason: 'too_far', note: 'Far' })
    expect(declineRequest('station_unavailable', '', 'Station closed or no water')).toEqual({ reason: 'other', note: 'Station closed or no water' })
  })

  it('cuts the note so the whole text fits the server limit', () => {
    const request = declineRequest('vehicle_problem', 'a'.repeat(400), 'My tanker has a problem')
    expect(request.note).toHaveLength(DECLINE_NOTE_MAX_LENGTH)
    expect(request.note?.startsWith('My tanker has a problem. ')).toBe(true)
  })
})

/** The unloading-complete example at another point of the trip. */
const base = unloadingComplete as unknown as DriverJobDetail
const REF = base.order_reference
const STEP = `${JOBS}/${REF}`
const accepted: DriverJobDetail = {
  ...base,
  order_status: 'accepted',
  pickup: null,
  arrived_at: null,
  delivery_code: null,
  unloading_completed_at: null,
  unreachable_allowed_at: null,
}
const departed: DriverJobDetail = { ...accepted, order_status: 'departed' }
const collected: DriverJobDetail = { ...accepted, order_status: 'collected', pickup: base.pickup }
const enRoute: DriverJobDetail = { ...collected, order_status: 'en_route' }
const arrived: DriverJobDetail = { ...enRoute, order_status: 'arrived', arrived_at: base.arrived_at, unreachable_allowed_at: base.unreachable_allowed_at }
const unloading: DriverJobDetail = { ...arrived, order_status: 'unloading' }
const loaded = { loaded: true, receipt: true, photo_url: 'blob:photo', gallons_loaded: null }

describe('confirmPickup (#13)', () => {
  it('starts the job, records the pickup at the assigned source, then leaves for the customer', async () => {
    const { client, sent, fetchMock } = setup({ body: accepted }, { body: departed }, { body: collected, status: 201 }, { body: enRoute })
    const job = await confirmPickup(REF, loaded, client)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(sent(1)).toMatchObject({ url: `${STEP}/transition`, method: 'POST', body: { to: 'departed' } })
    expect(sent(2)).toMatchObject({
      url: `${STEP}/pickup`,
      body: { source: { assigned: true }, source_reference: null, volume_collected_litres: 1000, safety_concern: false, safety_note: null },
    })
    expect(Date.parse(sent(2).body.picked_up_at)).not.toBeNaN()
    expect(sent(3)).toMatchObject({ url: `${STEP}/transition`, body: { to: 'en_route' } })
    expect(job.stage).toBe('collected')
  })

  it('sends a tanker load as 4 litres a gallon', async () => {
    const { client, sent } = setup({ body: departed }, { body: collected, status: 201 }, { body: enRoute })
    await confirmPickup(REF, { ...loaded, gallons_loaded: 300 }, client)
    expect(sent(1).body.volume_collected_litres).toBe(1200)
  })

  it('carries on from the last step made when retried', async () => {
    const { client, sent, fetchMock } = setup({ body: collected }, { body: enRoute })
    await confirmPickup(REF, loaded, client)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(1).body).toEqual({ to: 'en_route' })
  })

  it('refuses delivery_day_reached with the day the job can start, keeps the code and records no pickup (#241)', async () => {
    const { client, fetchMock } = setup({ body: accepted }, { body: envelope('transition_requirements_unmet', { missing: ['delivery_day_reached'] }), status: 409 })
    const error = await rejection(confirmPickup(REF, loaded, client))
    expect([error.code, error.details]).toEqual(['transition_requirements_unmet', { missing: ['delivery_day_reached'] }])
    expect(error.message).toBe('This job can start from Mon, 19 Oct 2026. Come back on that day.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the server message for another unmet requirement (#241)', async () => {
    const { client } = setup({ body: accepted }, { body: envelope('transition_requirements_unmet', { missing: ['delivery_window_set'] }), status: 409 })
    const error = await rejection(confirmPickup(REF, loaded, client))
    expect(error.message).toBe('Sample transition_requirements_unmet')
  })

  it('keeps the server message when the job has no delivery window (#241)', async () => {
    const { client } = setup({ body: { ...accepted, delivery_window_start_at: null } }, { body: envelope('transition_requirements_unmet', { missing: ['delivery_day_reached'] }), status: 409 })
    const error = await rejection(confirmPickup(REF, loaded, client))
    expect(error.message).toBe('Sample transition_requirements_unmet')
  })
})

describe('collectedLitres', () => {
  it('uses the gallons for a tanker and the ordered litres for a Keke', () => {
    expect(collectedLitres({ quantity_litres: 600 }, 150)).toBe(600)
    expect(collectedLitres({ quantity_litres: 600 }, null)).toBe(600)
    expect(collectedLitres({ quantity_litres: 600 }, 140)).toBe(560)
  })
})

describe('completeUnloading (#13)', () => {
  it('records arrival without a location, starts and completes unloading', async () => {
    const { client, sent, fetchMock } = setup({ body: enRoute }, { body: arrived }, { body: unloading }, { body: base, status: 201 })
    const job = await completeUnloading(REF, client)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(sent(1)).toMatchObject({ url: `${STEP}/arrive`, method: 'POST', body: { location_consent: false } })
    expect(sent(2)).toMatchObject({ url: `${STEP}/transition`, body: { to: 'unloading' } })
    expect(sent(3)).toMatchObject({ url: `${STEP}/unloading-complete`, method: 'POST' })
    expect([job.stage, job.code_tries_left]).toEqual(['collected', 5])
  })

  it('sends nothing when unloading is already complete', async () => {
    const { client, fetchMock } = setup({ body: base })
    expect((await completeUnloading(REF, client)).code_tries_left).toBe(5)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes job_on_hold through', async () => {
    const { client } = setup({ body: enRoute }, { body: envelope('job_on_hold'), status: 409 })
    expect((await rejection(completeUnloading(REF, client))).code).toBe('job_on_hold')
  })
})

describe('arrival and the unreachable customer (#250)', () => {
  const unreachable = driverJobUnreachable as unknown as DriverJobDetail
  const arrivedJob: DriverJobDetail = { ...unreachable, contact_attempts: [], allowed_actions: ['start_unloading', 'record_contact_attempt', 'report_incident'] }
  const failedSummary: DriverJobSummary = { ...doneJob, order_reference: REF, order_status: 'failed', end_reason: 'customer_unreachable' }

  it('maps the arrival fields and the two flags from the job', () => {
    expect(partnerJobFromRead(unreachable)).toMatchObject({
      arrived_at: '2026-10-19T09:42:00Z',
      contact_attempts: ['2026-10-19T09:44:00Z', '2026-10-19T09:49:00Z'],
      unreachable_allowed_at: '2026-10-19T09:52:00Z',
      can_start_unloading: true,
      can_fail_unreachable: true,
    })
  })

  it('reads the flags from the server list, not from the attempts or the clock', () => {
    const job = partnerJobFromRead({ ...unreachable, allowed_actions: ['record_contact_attempt', 'report_incident'] })
    expect([job.can_start_unloading, job.can_fail_unreachable]).toEqual([false, false])
    expect(job.contact_attempts).toHaveLength(2)
  })

  it('maps when and why a job ended, on a list row too', () => {
    expect(partnerJobFromRead(failedSummary)).toMatchObject({ ended_at: failedSummary.ended_at, end_reason: 'customer_unreachable' })
    expect(partnerJobFromRead(unreachable)).toMatchObject({ ended_at: null, end_reason: null })
  })

  it('leaves the fields out for a list row, which carries no detail', () => {
    const job = partnerJobFromRead(doneJob)
    for (const field of ['arrived_at', 'contact_attempts', 'unreachable_allowed_at', 'can_start_unloading', 'can_fail_unreachable']) {
      expect(field in job).toBe(false)
    }
  })

  it('arriveAtCustomer records the arrival with no location', async () => {
    const { client, sent } = setup({ body: arrivedJob })
    const job = await arriveAtCustomer(REF, client)
    expect(sent()).toEqual({ url: `${STEP}/arrive`, method: 'POST', body: { location_consent: false } })
    expect([job.arrived_at, job.contact_attempts, job.can_start_unloading]).toEqual(['2026-10-19T09:42:00Z', [], true])
  })

  it.each(['job_on_hold', 'invalid_order_transition', 'order_not_found'])('arriveAtCustomer passes %s through', async (code) => {
    const { client } = setup({ body: envelope(code), status: code === 'order_not_found' ? 404 : 409 })
    expect((await rejection(arriveAtCustomer(REF, client))).code).toBe(code)
  })

  it('startUnloading sends only the unloading step', async () => {
    const { client, sent, fetchMock } = setup({ body: unloading })
    const job = await startUnloading(REF, client)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent()).toEqual({ url: `${STEP}/transition`, method: 'POST', body: { to: 'unloading' } })
    expect(job.stage).toBe('collected')
  })

  it('startUnloading passes invalid_order_transition through', async () => {
    const { client } = setup({ body: envelope('invalid_order_transition'), status: 409 })
    expect((await rejection(startUnloading(REF, client))).code).toBe('invalid_order_transition')
  })

  it('recordContactAttempt posts no body and returns every attempt, oldest first', async () => {
    const { client, sent } = setup({ body: unreachable, status: 201 })
    const job = await recordContactAttempt(REF, client)
    expect(sent()).toEqual({ url: `${STEP}/contact-attempts`, method: 'POST', body: null })
    expect(job.contact_attempts).toEqual(['2026-10-19T09:44:00Z', '2026-10-19T09:49:00Z'])
  })

  it('recordContactAttempt passes invalid_order_transition through', async () => {
    const { client } = setup({ body: envelope('invalid_order_transition'), status: 409 })
    expect((await rejection(recordContactAttempt(REF, client))).code).toBe('invalid_order_transition')
  })

  it('failUnreachable sends the failed step and returns the finished job', async () => {
    const { client, sent, fetchMock } = setup({ body: failedSummary })
    const job = await failUnreachable(REF, client)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent()).toEqual({ url: `${STEP}/transition`, method: 'POST', body: { to: 'failed' } })
    expect(job.stage).toBe('failed')
  })

  it.each([[['contact_attempts_recorded', 'unreachable_wait_elapsed']], [['unreachable_wait_elapsed']]])(
    'failUnreachable keeps what the server says is missing: %j',
    async (missing) => {
      const { client } = setup({ body: envelope('transition_requirements_unmet', { missing }), status: 409 })
      const error = await rejection(failUnreachable(REF, client))
      expect([error.status, error.code, error.details]).toEqual([409, 'transition_requirements_unmet', { missing }])
    },
  )

  it.each(['job_on_hold', 'invalid_order_transition'])('failUnreachable passes %s through', async (code) => {
    const { client } = setup({ body: envelope(code), status: 409 })
    expect((await rejection(failUnreachable(REF, client))).code).toBe(code)
  })
})

describe('verifyCode (#13)', () => {
  it('sends the proof with the litres collected at pickup and returns the delivered job', async () => {
    const delivered: DriverJobSummary = { ...doneJob, order_reference: REF }
    const { client, sent } = setup({ body: base }, { body: delivered })
    const job = await verifyCode(REF, '482913', client)
    expect(sent(1)).toMatchObject({
      url: `${STEP}/proof`,
      method: 'POST',
      body: { delivered_litres: 1000, unloading_confirmed: true, delivery_code: '482913', alternative_proof: null, location: null, location_consent: false },
    })
    expect(job.stage).toBe(jobStage(delivered))
  })

  it('reports a wrong code as invalid_code with the tries left', async () => {
    const { client } = setup({ body: base }, { body: codeInvalid, status: 400 })
    const error = await rejection(verifyCode(REF, '000000', client))
    expect([error.code, error.details, error.message]).toEqual(['invalid_code', { tries_left: 3 }, codeInvalid.error.message])
  })

  it('reports the last wrong code as code_locked', async () => {
    const { client } = setup({ body: base }, { body: envelope('delivery_code_invalid', { attempts_remaining: 0 }), status: 400 })
    expect((await rejection(verifyCode(REF, '000000', client))).code).toBe('code_locked')
  })

  it('passes delivery_code_expired through', async () => {
    const { client } = setup({ body: base }, { body: codeExpired, status: 400 })
    expect((await rejection(verifyCode(REF, '000000', client))).code).toBe('delivery_code_expired')
  })

  it('sends no proof when the job has no pickup', async () => {
    const { client, fetchMock } = setup({ body: accepted })
    expect((await rejection(verifyCode(REF, '482913', client))).code).toBe('invalid_response')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('codeError', () => {
  it('leaves other errors alone', () => {
    const other = new ApiError({ kind: 'http', status: 409, code: 'job_on_hold', message: 'On hold' })
    expect(codeError(other)).toBe(other)
  })
})

describe('resendCode (#13)', () => {
  it('asks for a new code', async () => {
    const { client, sent } = setup({ body: base, status: 201 })
    expect((await resendCode(REF, client)).code_tries_left).toBe(5)
    expect(sent()).toMatchObject({ url: `${STEP}/delivery-code`, method: 'POST' })
  })

  it('passes rate_limited through with the wait', async () => {
    const { client } = setup({ body: envelope('rate_limited', { retry_after_seconds: 42 }), status: 429 })
    const error = await rejection(resendCode(REF, client))
    expect([error.code, error.details]).toEqual(['rate_limited', { retry_after_seconds: 42 }])
  })
})

describe('reportIssue (#13)', () => {
  const incident = { id: 'inc-1', order_reference: REF, type: 'unsafe_transfer', note: 'Pump hose split', new_estimated_arrival_at: null, created_at: '2026-10-19T10:30:00Z', hold: null }

  it('reports an unsafe pour as unsafe_transfer with the note', async () => {
    const { client, sent } = setup({ body: incident, status: 201 })
    expect(await reportIssue({ type: 'unsafe_pour', note: ' Pump hose split ', reference: REF }, client)).toEqual({ id: 'inc-1' })
    expect(sent()).toMatchObject({ url: `${STEP}/incidents`, method: 'POST', body: { type: 'unsafe_transfer', note: 'Pump hose split', new_estimated_arrival_at: null } })
  })

  it('sends the label first for types reported as other', async () => {
    const { client, sent } = setup({ body: partnerProfile }, { body: { ...incident, type: 'other' }, status: 201 })
    await reportIssue({ type: 'bad_address', note: 'Gate has no number', reference: REF }, client)
    expect(sent(1).body).toEqual({ type: 'other', note: 'Wrong or unclear address. Gate has no number', new_estimated_arrival_at: null })
  })

  it('refuses a report with no order before any request', async () => {
    const { client, fetchMock } = setup()
    expect((await rejection(reportIssue({ type: 'vehicle_breakdown', note: '', reference: null }, client))).code).toBe('not_connected')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes job_not_active through', async () => {
    const { client } = setup({ body: envelope('job_not_active'), status: 409 })
    expect((await rejection(reportIssue({ type: 'station_problem', note: '', reference: REF }, client))).code).toBe('job_not_active')
  })
})

describe('incidentRequest', () => {
  it('maps every design type (agreed for #13)', () => {
    expect(incidentRequest('station_problem', '', '').type).toBe('source_concern')
    expect(incidentRequest('vehicle_breakdown', '', '').type).toBe('vehicle_problem')
    expect(incidentRequest('code_not_working', '', 'Delivery code not working')).toEqual({ type: 'other', note: 'Delivery code not working', new_estimated_arrival_at: null })
    expect(incidentRequest('customer_unreachable', '', 'Customer not reachable').type).toBe('other')
  })

  it('cuts the note to the server limit', () => {
    expect(incidentRequest('code_not_working', 'a'.repeat(600), 'Delivery code not working').note).toHaveLength(INCIDENT_NOTE_MAX_LENGTH)
  })
})
