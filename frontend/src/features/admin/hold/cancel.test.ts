import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { cancelOrder, getCancellationOutcome } from '../real/cancel'
import { canCancel, cancelProblem, cancelSentences } from './cancel'

const http = (code: string, status: number) => new ApiError({ kind: 'http', status, code, message: 'from the server' })
const PARTNER = { id: 'd1', name: 'Sample Driver', code: null, vehicle: null, plate: null }

function client(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  const c = createApiClient({ baseUrl: 'http://api.test', fetch })
  c.setCsrfToken('csrf')
  return { fetch, client: c }
}

describe('the CANCEL dialog wording (admin-order-cancellation.md, C1)', () => {
  it('names the driver only when a driver job is live (variant a)', () => {
    expect(cancelSentences({ partner: PARTNER, hold: null })).toEqual([
      "The driver's job ends and leaves their list. Nothing notifies the driver. No cancellation message is sent to the customer yet: tell them yourself.",
    ])
  })

  it('says no driver is assigned otherwise (variant b), and names the hold it closes (variant c)', () => {
    expect(cancelSentences({ partner: null, hold: { id: 'h1', kind: 'source_review', since: '2026-10-28T09:00:00Z' } })).toEqual([
      "No driver is assigned, so no driver's job changes. No cancellation message is sent to the customer yet: tell them yourself.",
      'This also closes the source review hold.',
    ])
  })

  it('is not offered for Delivered, Cancelled and Disputed orders (decision 2)', () => {
    expect(['delivered', 'cancelled', 'disputed'].map((s) => canCancel({ status: s as never }))).toEqual([false, false, false])
    expect(['awaiting_confirmation', 'awaiting_rider', 'assigned', 'loading', 'on_the_way', 'failed'].every((s) => canCancel({ status: s as never }))).toBe(true)
  })

  it('maps the errors: cannot be cancelled, order changed (Refresh), cost not checked', () => {
    expect(cancelProblem(http('invalid_order_transition', 409), 'outcome')).toEqual({ text: 'This order can no longer be cancelled.', refresh: true })
    expect(cancelProblem(http('invalid_order_transition', 409), 'cancel')).toEqual({ text: 'This order has changed.', refresh: true })
    expect(cancelProblem(http('service_unavailable', 503), 'outcome')).toEqual({ text: "We couldn't check what this costs the customer.", refresh: false })
    expect(cancelProblem(http('validation_error', 422), 'cancel')).toBeNull()
  })
})

describe('cancel adapters (real)', () => {
  it('reads the cost sentence for mmirioma_unable', async () => {
    const outcome = { reason_code: 'mmirioma_unable', customer_charge_minor_units: 0, message: 'The customer is not charged for this cancellation.' }
    const { fetch, client: c } = client(outcome)
    expect(await getCancellationOutcome('MO-7KQ2M9XH4T', c)).toEqual(outcome)
    expect(String(fetch.mock.calls[0][0])).toBe('http://api.test/api/v1/admin/orders/MO-7KQ2M9XH4T/cancellation-outcome?reason_code=mmirioma_unable')
  })

  it('passes 409 invalid_order_transition through from the outcome', async () => {
    const { client: c } = client({ error: { code: 'invalid_order_transition', message: 'Cannot cancel', details: null } }, 409)
    await expect(getCancellationOutcome('MO-7KQ2M9XH4T', c)).rejects.toMatchObject({ status: 409, code: 'invalid_order_transition' })
  })

  it('cancels with the loaded status, the one reason and the note, and passes 409 through', async () => {
    const { fetch, client: c } = client({ error: { code: 'invalid_order_transition', message: 'The order has changed', details: null } }, 409)
    await expect(cancelOrder('MO-7KQ2M9XH4T', { expected_status: 'assigned', note: 'Road closed', hold_id: null }, c)).rejects.toMatchObject({
      status: 409,
      code: 'invalid_order_transition',
    })
    expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).toEqual({
      to: 'cancelled',
      expected_status: 'assigned',
      reason_code: 'mmirioma_unable',
      note: 'Road closed',
      hold_id: null,
    })
  })
})
