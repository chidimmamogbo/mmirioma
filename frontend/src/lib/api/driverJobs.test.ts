import { describe, expect, it, vi } from 'vitest'
import driverJobAccepted from '../../../../docs/api/examples/driver-job-accepted.json'
import driverJobDetail from '../../../../docs/api/examples/driver-job-detail.json'
import driverJobOffer from '../../../../docs/api/examples/driver-job-offer.json'
import driverJobs from '../../../../docs/api/examples/driver-jobs.json'
import { ApiError, createApiClient, CSRF_HEADER } from './client'
import {
  acceptDriverJob,
  arriveDriverJob,
  completeUnloading,
  declineDriverJob,
  getDriverJob,
  listDriverJobs,
  recordContactAttempt,
  recordPickup,
  reportIncident,
  requestNewCode,
  submitProof,
  transitionDriverJob,
} from './driverJobs'

const BASE_URL = 'http://api.test'
const JOBS = `${BASE_URL}/api/v1/driver/jobs`

function jsonResponse(body: unknown, status = 200): Response {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(body, status))
  const client = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  return { fetchMock, client }
}

function sent(fetchMock: ReturnType<typeof setup>['fetchMock']) {
  const [url, init] = fetchMock.mock.calls[0]
  const request = init as RequestInit
  return {
    url: String(url),
    method: request.method ?? 'GET',
    body: request.body ? JSON.parse(String(request.body)) : null,
    csrf: new Headers(request.headers).get(CSRF_HEADER),
  }
}

describe('driver job calls', () => {
  it('lists the jobs and accepts the contract example', async () => {
    const { fetchMock, client } = setup(driverJobs)
    const list = await listDriverJobs(undefined, client)
    expect(sent(fetchMock)).toMatchObject({ url: JOBS, method: 'GET' })
    expect(list.upcoming[0].order_reference).toBe('MO-9WD4KX7RNE')
    expect(list.done[0].delivered_litres).toBe(1200)
  })

  it('reads every detail example in the contract', async () => {
    for (const example of [driverJobOffer, driverJobAccepted, driverJobDetail]) {
      const { client } = setup(example)
      await expect(getDriverJob(example.order_reference, undefined, client)).resolves.toMatchObject({
        order_reference: example.order_reference,
      })
    }
  })

  it('accepts the cash contract additions and drops actions this build does not know', async () => {
    const { client } = setup({
      ...driverJobAccepted,
      allowed_actions: ['record_cash', 'report_incident', 'teleport'],
      cash: { amount_due_minor_units: 4500000, amount_due_label: 'manual_quote', collection: null, record_allowed: true },
    })
    const job = await getDriverJob('MO-5KR7TB3MWY', undefined, client)
    expect(job.allowed_actions).toEqual(['record_cash', 'report_incident'])
    expect(job.cash).toEqual({ amount_due_minor_units: 4500000, amount_due_label: 'manual_quote', collection: null, record_allowed: true })
  })

  it('reads a job without `cash` as having none', async () => {
    const withoutCash: Record<string, unknown> = { ...driverJobAccepted }
    delete withoutCash.cash
    const { client } = setup(withoutCash)
    expect((await getDriverJob('MO-5KR7TB3MWY', undefined, client)).cash).toBeNull()
  })

  it('refuses a Cash card that does not match the contract', async () => {
    const { client } = setup({ ...driverJobAccepted, cash: { amount_due_minor_units: 45000.5, amount_due_label: 'manual_quote', collection: null, record_allowed: true } })
    await expect(getDriverJob('MO-5KR7TB3MWY', undefined, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('encodes the reference in the path', async () => {
    const { fetchMock, client } = setup(driverJobOffer)
    await getDriverJob('MO 1/2', undefined, client)
    expect(sent(fetchMock).url).toBe(`${JOBS}/MO%201%2F2`)
  })

  it('reports an unexpected status as invalid_response, not a wrong screen', async () => {
    const { client } = setup({ ...driverJobOffer, order_status: 'teleported' })
    await expect(getDriverJob('MO-5KR7TB3MWY', undefined, client)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('accepts with POST and the CSRF token, and returns the accepted job', async () => {
    const { fetchMock, client } = setup(driverJobAccepted)
    const job = await acceptDriverJob('MO-5KR7TB3MWY', client)
    expect(sent(fetchMock)).toEqual({ url: `${JOBS}/MO-5KR7TB3MWY/accept`, method: 'POST', body: null, csrf: 'csrf-token' })
    expect(job.receiver?.display_name).toBe('Chika O.')
  })

  it('declines with the reason and note', async () => {
    const { fetchMock, client } = setup(null, 204)
    await declineDriverJob('MO-5KR7TB3MWY', { reason: 'other', note: 'Vehicle is at the mechanic' }, client)
    expect(sent(fetchMock)).toEqual({
      url: `${JOBS}/MO-5KR7TB3MWY/decline`,
      method: 'POST',
      body: { reason: 'other', note: 'Vehicle is at the mechanic' },
      csrf: 'csrf-token',
    })
  })

  it('passes the error envelope through as ApiError', async () => {
    const { client } = setup(
      { error: { code: 'order_not_found', message: 'Order not found', details: null } },
      404,
    )
    const error = await acceptDriverJob('MO-GONE', client).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: 'order_not_found' })
  })
})

describe('active job calls', () => {
  it('sends each step to its path', async () => {
    const calls: [string, (client: ReturnType<typeof setup>['client']) => Promise<unknown>][] = [
      ['transition', (client) => transitionDriverJob('MO-1', { to: 'departed' }, client)],
      ['arrive', (client) => arriveDriverJob('MO-1', { location: null, location_consent: false }, client)],
      ['contact-attempts', (client) => recordContactAttempt('MO-1', client)],
      ['unloading-complete', (client) => completeUnloading('MO-1', client)],
      ['delivery-code', (client) => requestNewCode('MO-1', client)],
    ]
    for (const [path, call] of calls) {
      const { fetchMock, client } = setup(driverJobDetail)
      await call(client)
      expect(sent(fetchMock)).toMatchObject({ url: `${JOBS}/MO-1/${path}`, method: 'POST', csrf: 'csrf-token' })
    }
  })

  it('tells a live job from a done one: proof delivered vs other proof held', async () => {
    const delivered = setup(driverJobs.done[0])
    await expect(
      submitProof('MO-1', { delivered_litres: 1200, unloading_confirmed: true, delivery_code: '482913', alternative_proof: null, location_consent: false }, delivered.client),
    ).resolves.toMatchObject({ ended: true, job: { order_status: 'delivered' } })

    const held = setup(driverJobDetail, 202)
    await expect(
      submitProof('MO-1', { delivered_litres: 1200, unloading_confirmed: true, delivery_code: null, alternative_proof: { reason: 'other', note: 'x' }, location_consent: false }, held.client),
    ).resolves.toMatchObject({ ended: false })
  })

  it('records a pickup and a problem report', async () => {
    const pickup = setup(driverJobDetail, 201)
    const request = {
      source: { assigned: true as const },
      source_reference: null,
      volume_collected_litres: 1000,
      picked_up_at: '2026-10-19T09:20:00+01:00',
      safety_concern: false,
      safety_note: null,
    }
    await recordPickup('MO-1', request, pickup.client)
    expect(sent(pickup.fetchMock)).toMatchObject({ url: `${JOBS}/MO-1/pickup`, body: request })

    const incident = setup(
      { id: 'i1', order_reference: 'MO-1', type: 'running_late', note: null, new_estimated_arrival_at: null, created_at: '2026-10-19T09:00:00Z', hold: null },
      201,
    )
    await expect(reportIncident('MO-1', { type: 'running_late', note: null, new_estimated_arrival_at: null }, incident.client)).resolves.toMatchObject({
      type: 'running_late',
    })
    expect(sent(incident.fetchMock).url).toBe(`${JOBS}/MO-1/incidents`)
  })
})
