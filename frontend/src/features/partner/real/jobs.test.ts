import { describe, expect, it, vi } from 'vitest'
import driverJobAccepted from '../../../../../docs/api/examples/driver-job-accepted.json'
import driverJobDetail from '../../../../../docs/api/examples/driver-job-detail.json'
import driverJobOffer from '../../../../../docs/api/examples/driver-job-offer.json'
import unloadingComplete from '../../../../../docs/api/examples/driver-job-unloading-complete.json'
import driverJobs from '../../../../../docs/api/examples/driver-jobs.json'
import orderNotFound from '../../../../../docs/api/examples/error-order-not-found.json'
import partnerProfile from '../../../../../docs/api/examples/partner-profile.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { DECLINE_NOTE_MAX_LENGTH, type DriverJobSummary } from '../../../lib/api/driverJobs'
import {
  acceptJob,
  declineJob,
  declineRequest,
  getJob,
  jobStage,
  listAvailableJobs,
  listHistory,
  listMyActiveJobs,
  partnerJobFromRead,
  STATION_NOT_SET,
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
