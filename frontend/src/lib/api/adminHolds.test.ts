import { describe, expect, it, vi } from 'vitest'
import adminOrderDetail from '../../../../docs/api/examples/admin-order-detail.json'
import adminOrdersPage from '../../../../docs/api/examples/admin-orders-page.json'
import { getAdminOrderDetail, getOrderHistory } from './adminDispatch'
import {
  continueSource,
  decideProof,
  getCancellationOutcome,
  getHoldReview,
  resumeUnsafe,
  transitionOrder,
} from './adminHolds'
import { adminOrderListQuery, listAdminOrders } from './adminOrders'
import { ApiError, createApiClient, CSRF_HEADER } from './client'

const BASE_URL = 'http://api.test'
const BASE = `${BASE_URL}/api/v1/admin/orders/MO-4PRF7K2Q9X`
const HOLD = { id: 'h1', kind: 'proof_review', since: '2026-10-20T08:48:00Z' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
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

/** A `HoldReview` for alternative proof, shaped as in the contract. */
const REVIEW = {
  id: 'h1',
  kind: 'proof_review',
  since: '2026-10-20T08:48:00Z',
  order_status: 'unloading',
  driver: { id: 'd1', name: 'Sample Driver One' },
  proof: {
    delivered_litres: 1000,
    reason: 'customer_cannot_receive_code',
    driver_note: "Customer's phone is off.",
    arrived_at: '2026-10-20T08:20:00Z',
    unloading_completed_at: '2026-10-20T08:44:00Z',
    sent_at: '2026-10-20T08:48:00Z',
    delivery_code: { issued_at: '2026-10-20T08:44:00Z', sms_status: 'accepted', attempts_used: 3, attempts_limit: 5, expired: true },
    contact_attempts: [{ attempted_at: '2026-10-20T08:46:00Z' }],
    location: null,
  },
  pickup: null,
  source_eligibility: null,
  report: null,
  incidents: [],
  withdraw_allowed: false,
}

const DETAIL = { ...adminOrderDetail, hold: null }

describe('hold field on admin orders (R0)', () => {
  it('reads the hold on the detail, and a missing hold as none', async () => {
    const withHold = setup({ ...adminOrderDetail, hold: HOLD })
    expect((await getAdminOrderDetail('MO-4PRF7K2Q9X', undefined, withHold.client)).hold).toEqual(HOLD)
    const withoutHold: Record<string, unknown> = { ...adminOrderDetail }
    delete withoutHold.hold
    expect((await getAdminOrderDetail('MO-4PRF7K2Q9X', undefined, setup(withoutHold).client)).hold).toBeNull()
  })

  it('rejects a hold kind the screens do not know (Zod)', async () => {
    const { client } = setup({ ...adminOrderDetail, hold: { ...HOLD, kind: 'paused' } })
    await expect(getAdminOrderDetail('MO-4PRF7K2Q9X', undefined, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('checks each listed order’s hold and sends the on_hold filter', async () => {
    const page = { ...adminOrdersPage, items: [{ ...adminOrdersPage.items[0], hold: HOLD }, adminOrdersPage.items[1]] }
    const { fetchMock, client } = setup(page)
    const result = await listAdminOrders({ status: [], on_hold: true, limit: 50, offset: 0 }, undefined, client)
    expect(sent(fetchMock).url).toContain('on_hold=true')
    expect(result.items.map((order) => order.hold)).toEqual([HOLD, null])
    expect(adminOrderListQuery({ status: [], limit: 50, offset: 0 })).not.toContain('on_hold')

    const bad = setup({ ...page, items: [{ ...adminOrdersPage.items[0], hold: { id: 'h1' } }] })
    await expect(listAdminOrders({ status: [], limit: 50, offset: 0 }, undefined, bad.client)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('history with hold entries (decision 8)', () => {
  it('reads hold entries with null statuses', async () => {
    const entry = {
      id: 'e1',
      kind: 'hold_decided',
      from_status: null,
      to_status: null,
      actor: { id: 'a1', role: 'admin', name: 'Sample Dispatcher' },
      reason_code: null,
      note: 'Not the customer.',
      created_at: '2026-10-20T09:31:00Z',
      assignment: null,
      hold: { id: 'h1', kind: 'proof_review', category: 'alternative_proof', decision: 'proof_rejected' },
    }
    const { fetchMock, client } = setup({ items: [entry] })
    const [item] = await getOrderHistory('MO-4PRF7K2Q9X', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE}/history?include=holds`)
    // A server without the confirmation line or cash details reads as none.
    expect(item).toEqual({ ...entry, confirmation: null, cash: null })
  })
})

describe('admin hold review API functions (docs/api/deliveries.md, "Admin hold review endpoints")', () => {
  it('loads the evidence for the open hold', async () => {
    const { fetchMock, client } = setup(REVIEW)
    const review = await getHoldReview('MO-4PRF7K2Q9X', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE}/hold`)
    expect(review.proof?.delivery_code?.attempts_used).toBe(3)
    // The code itself is never part of the evidence (FR-035).
    expect(JSON.stringify(review)).not.toMatch(/"code"\s*:/)
  })

  it('rejects evidence the screens do not know (Zod)', async () => {
    const { client } = setup({ ...REVIEW, source_eligibility: { answer: 'maybe', message: 'x' } })
    await expect(getHoldReview('MO-4PRF7K2Q9X', undefined, client)).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('approves with the acknowledgment, CSRF and hold id', async () => {
    const { fetchMock, client } = setup(DETAIL)
    const request = {
      hold_id: 'h1',
      decision: 'approve' as const,
      customer_acknowledgment: { method: 'phone_call' as const, confirmed_at: '2026-10-20T10:15:00+01:00', note: null },
      note: 'Confirmed by phone.',
    }
    await decideProof('MO-4PRF7K2Q9X', request, client)
    expect(sent(fetchMock)).toMatchObject({ url: `${BASE}/proof-overrides`, method: 'POST', body: request, csrf: 'csrf-token' })
  })

  it('posts continue, resume and the transition to their paths', async () => {
    const decision = { hold_id: 'h1', note: 'Safe now.' }
    type Client = ReturnType<typeof setup>['client']
    const cases: [string, (client: Client) => Promise<unknown>][] = [
      ['/hold/continue', (client) => continueSource('MO-4PRF7K2Q9X', decision, client)],
      ['/hold/resume', (client) => resumeUnsafe('MO-4PRF7K2Q9X', decision, client)],
      [
        '/transition',
        (client) =>
          transitionOrder(
            'MO-4PRF7K2Q9X',
            { to: 'failed', expected_status: 'collected', reason_code: 'source_quality_concern', note: null, hold_id: 'h1' },
            client,
          ),
      ],
    ]
    for (const [path, call] of cases) {
      const { fetchMock, client } = setup(DETAIL)
      await call(client)
      expect(sent(fetchMock)).toMatchObject({ url: `${BASE}${path}`, method: 'POST', csrf: 'csrf-token' })
    }
  })

  it('reads the cancellation outcome for customer_request too (#174)', async () => {
    const outcome = { reason_code: 'customer_request', customer_charge_minor_units: 0, message: 'The customer is not charged for this cancellation.' }
    const { fetchMock, client } = setup(outcome)
    expect(await getCancellationOutcome('MO-4PRF7K2Q9X', 'customer_request', undefined, client)).toEqual(outcome)
    expect(sent(fetchMock).url).toBe(`${BASE}/cancellation-outcome?reason_code=customer_request`)
  })

  it('reads the cancellation outcome for mmirioma_unable, in kobo', async () => {
    const outcome = { reason_code: 'mmirioma_unable', customer_charge_minor_units: 0, message: 'The customer is not charged for this cancellation.' }
    const { fetchMock, client } = setup(outcome)
    expect(await getCancellationOutcome('MO-4PRF7K2Q9X', 'mmirioma_unable', undefined, client)).toEqual(outcome)
    expect(sent(fetchMock).url).toBe(`${BASE}/cancellation-outcome?reason_code=mmirioma_unable`)
  })

  it('passes refusals through as ApiError with their codes', async () => {
    const { client } = setup(
      { error: { code: 'own_delivery_override', message: 'You can’t approve proof for a delivery you made.', details: null } },
      403,
    )
    await expect(decideProof('MO-4PRF7K2Q9X', { hold_id: 'h1', decision: 'reject', note: 'x' }, client)).rejects.toMatchObject({
      status: 403,
      code: 'own_delivery_override',
    })
  })
})
