import { describe, expect, it, vi } from 'vitest'
import detailSample from '../../../../../docs/api/examples/admin-order-detail.json'
import driversSample from '../../../../../docs/api/examples/dispatch-drivers.json'
import notEligibleSample from '../../../../../docs/api/examples/error-driver-not-eligible.json'
import transitionSample from '../../../../../docs/api/examples/error-invalid-order-transition.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { assignOrder, eligibleRiderFromDriver, listEligibleRiders } from './ordersDispatch'

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

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const REFERENCE = detailSample.reference
const NOT_FOUND = { error: { code: 'order_not_found', message: 'Order not found', details: null } }

describe('admin dispatch adapters (#16)', () => {
  it('listEligibleRiders keeps only drivers with no eligibility problem, and invents nothing', async () => {
    const { client, sent } = setup(driversSample)
    const riders = await listEligibleRiders(REFERENCE, client)
    expect(sent()).toMatchObject({ url: `http://api.test/api/v1/admin/orders/${REFERENCE}/drivers`, method: 'GET' })
    expect(riders).toEqual([
      // "Tanker truck" is free text, so no vehicle word; online and no live job follow from an empty `reasons`.
      { id: driversSample.items[0].id, name: 'Sample Driver One', vehicle: null, rating: null, active_orders: 0, online: true, works_in_area: null },
    ])
  })

  it('reads an exact keke or tanker vehicle type', () => {
    expect(eligibleRiderFromDriver({ id: 'd1', name: 'Ada', vehicle: { type: 'keke', safe_payload_litres: 600 }, reasons: [] }).vehicle).toBe('keke')
  })

  it('listEligibleRiders passes a 404 through', async () => {
    const error = await rejection(listEligibleRiders('MO-0000000000', setup(NOT_FOUND, 404).client))
    expect([error.status, error.code]).toEqual([404, 'order_not_found'])
  })

  it('assignOrder offers the order to the driver and returns the converted order', async () => {
    const { client, sent } = setup(detailSample, 201)
    const order = await assignOrder(REFERENCE, 'driver-1', client)
    expect(sent()).toMatchObject({ url: `http://api.test/api/v1/admin/orders/${REFERENCE}/assign`, method: 'POST', body: { driver_id: 'driver-1' } })
    expect(order.reference).toBe(REFERENCE)
    expect(order.status).toBe('assigned')
  })

  it('assignOrder words a changed order as the contract says', async () => {
    const error = await rejection(assignOrder(REFERENCE, 'driver-1', setup(transitionSample, 409).client))
    expect([error.status, error.code, error.message]).toEqual([409, 'invalid_order_transition', 'This order has changed.'])
  })

  it('assignOrder passes driver_not_eligible through with its reasons', async () => {
    const error = await rejection(assignOrder(REFERENCE, 'driver-1', setup(notEligibleSample, 409).client))
    expect([error.status, error.code, error.message]).toEqual([409, 'driver_not_eligible', notEligibleSample.error.message])
  })
})
