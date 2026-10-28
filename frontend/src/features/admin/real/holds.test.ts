import { describe, expect, it, vi } from 'vitest'
import adminOrderDetail from '../../../../../docs/api/examples/admin-order-detail.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { continueSource, decideProof, getCancellationOutcome, getHoldReview, resumeUnsafe, transitionOrder, withdrawJob } from './holds'

/** A client whose `fetch` answers every request with `body` and `status`, recording what was sent. */
function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0]
    const request = init as RequestInit
    return { url: String(url), method: request.method ?? 'GET', body: request.body ? JSON.parse(String(request.body)) : null }
  }
  return { client, sent }
}

const envelope = (code: string) => ({ error: { code, message: `Sample ${code}`, details: null } })

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const HOLD = {
  id: 'hold-1',
  kind: 'proof_review',
  since: '2026-10-20T08:48:00Z',
  order_status: 'unloading',
  driver: { id: 'd1', name: 'Sample Driver One' },
  proof: {
    delivered_litres: 1000,
    reason: 'customer_cannot_receive_code',
    driver_note: 'Customer\'s phone is off.',
    arrived_at: '2026-10-20T08:20:00Z',
    unloading_completed_at: '2026-10-20T08:44:00Z',
    sent_at: '2026-10-20T08:48:00Z',
    delivery_code: { issued_at: '2026-10-20T08:44:00Z', sms_status: 'accepted', attempts_used: 3, attempts_limit: 5, expired: true },
    contact_attempts: [],
    location: null,
  },
  pickup: null,
  source_eligibility: null,
  report: null,
  incidents: [],
  withdraw_allowed: false,
}

describe('admin hold review adapters (#166)', () => {
  it('getHoldReview reads the evidence for the order’s open hold', async () => {
    const { client, sent } = setup(HOLD)
    const review = await getHoldReview('MO-7KQ2M9XH4T', client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/hold', method: 'GET' })
    expect(review).toMatchObject({ id: 'hold-1', kind: 'proof_review', proof: { delivered_litres: 1000 } })
  })

  it('getHoldReview passes "no open hold" through as a 404', async () => {
    const error = await rejection(getHoldReview('MO-7KQ2M9XH4T', setup(envelope('hold_not_found'), 404).client))
    expect([error.status, error.code]).toEqual([404, 'hold_not_found'])
  })

  it('decideProof posts the decision with the hold id, and returns nothing', async () => {
    // The server answers with the whole order; the adapter only reports that it worked.
    const { client, sent } = setup({ ...adminOrderDetail, hold: null })
    const request = { hold_id: 'hold-1', decision: 'reject' as const, note: 'The person who answered is not the customer.' }
    await expect(decideProof('MO-7KQ2M9XH4T', request, client)).resolves.toBeUndefined()
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/proof-overrides', method: 'POST', body: request })
  })

  it('continueSource posts the note with the hold id, and returns nothing', async () => {
    const { client, sent } = setup({ ...adminOrderDetail, hold: null })
    const request = { hold_id: 'hold-2', note: 'Source records match the order category.' }
    await expect(continueSource('MO-7KQ2M9XH4T', request, client)).resolves.toBeUndefined()
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/hold/continue', method: 'POST', body: request })
  })

  it('continueSource passes the server’s refusal through with its sentence and its answer', async () => {
    const body = { error: { code: 'source_not_eligible', message: 'This source is suspended for this water category.', details: { answer: 'not_eligible' } } }
    const error = await rejection(continueSource('MO-7KQ2M9XH4T', { hold_id: 'hold-2', note: 'Fine.' }, setup(body, 409).client))
    expect([error.status, error.code, error.message, error.details]).toEqual([409, 'source_not_eligible', 'This source is suspended for this water category.', { answer: 'not_eligible' }])
  })

  it('resumeUnsafe posts the safe alternative with the hold id', async () => {
    const { client, sent } = setup({ ...adminOrderDetail, hold: null })
    const request = { hold_id: 'hold-3', note: 'Use the side gate.' }
    await expect(resumeUnsafe('MO-7KQ2M9XH4T', request, client)).resolves.toBeUndefined()
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/hold/resume', method: 'POST', body: request })
  })

  it('resumeUnsafe passes 409 hold_not_open through', async () => {
    const error = await rejection(resumeUnsafe('MO-7KQ2M9XH4T', { hold_id: 'hold-3', note: 'Fine.' }, setup(envelope('hold_not_open'), 409).client))
    expect([error.status, error.code]).toEqual([409, 'hold_not_open'])
  })

  it('withdrawJob takes an accepted job back with an optional note', async () => {
    const { client, sent } = setup({ ...adminOrderDetail, hold: null })
    await expect(withdrawJob('MO-7KQ2M9XH4T', { expected_status: 'accepted', note: null }, client)).resolves.toBeUndefined()
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/withdraw', method: 'POST', body: { expected_status: 'accepted', note: null } })
  })

  it('getCancellationOutcome reads the server’s sentence for mmirioma_unable, in kobo', async () => {
    const { client, sent } = setup({ reason_code: 'mmirioma_unable', customer_charge_minor_units: 0, message: 'The customer is not charged for this cancellation.' })
    const outcome = await getCancellationOutcome('MO-7KQ2M9XH4T', client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/cancellation-outcome?reason_code=mmirioma_unable', method: 'GET' })
    expect(outcome).toEqual({ reason_code: 'mmirioma_unable', customer_charge_minor_units: 0, message: 'The customer is not charged for this cancellation.' })
  })

  it('getCancellationOutcome passes "cannot be cancelled" through as a 409', async () => {
    const error = await rejection(getCancellationOutcome('MO-7KQ2M9XH4T', setup(envelope('invalid_order_transition'), 409).client))
    expect([error.status, error.code]).toEqual([409, 'invalid_order_transition'])
  })

  it('transitionOrder fails a delivery with the hold it closes, and returns nothing', async () => {
    const { client, sent } = setup({ ...adminOrderDetail, hold: null })
    const request = { to: 'failed' as const, expected_status: 'collected' as const, reason_code: 'source_quality_concern' as const, note: 'Source flooded.', hold_id: 'hold-1' }
    await expect(transitionOrder('MO-7KQ2M9XH4T', request, client)).resolves.toBeUndefined()
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/transition', method: 'POST', body: request })
  })

  it('transitionOrder cancels with mmirioma_unable and no hold from the panel', async () => {
    const { client, sent } = setup({ ...adminOrderDetail, hold: null })
    const request = { to: 'cancelled' as const, expected_status: 'confirmed' as const, reason_code: 'mmirioma_unable' as const, note: null, hold_id: null }
    await transitionOrder('MO-7KQ2M9XH4T', request, client)
    expect(sent().body).toEqual(request)
  })

  it.each([
    [409, 'hold_not_open'],
    [409, 'invalid_order_transition'],
    [422, 'validation_error'],
  ])('transitionOrder passes %i %s through', async (status, code) => {
    const error = await rejection(
      transitionOrder('MO-7KQ2M9XH4T', { to: 'failed', expected_status: 'collected', reason_code: 'other', note: null, hold_id: null }, setup(envelope(code), status).client),
    )
    expect([error.status, error.code]).toEqual([status, code])
  })

  it.each([
    [404, 'assignment_not_found'],
    [409, 'invalid_order_transition'],
  ])('withdrawJob passes %i %s through', async (status, code) => {
    const error = await rejection(withdrawJob('MO-7KQ2M9XH4T', { expected_status: 'accepted', note: null }, setup(envelope(code), status).client))
    expect([error.status, error.code]).toEqual([status, code])
  })

  it.each([
    [403, 'own_delivery_override'],
    [409, 'hold_not_open'],
    [409, 'invalid_order_transition'],
  ])('decideProof passes %i %s through', async (status, code) => {
    const { client } = setup(envelope(code), status)
    const error = await rejection(decideProof('MO-7KQ2M9XH4T', { hold_id: 'hold-1', decision: 'reject', note: 'No.' }, client))
    expect([error.status, error.code]).toEqual([status, code])
  })
})
