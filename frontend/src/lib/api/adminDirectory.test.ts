import { describe, expect, it, vi } from 'vitest'
import addressRequestSample from '../../../../docs/api/examples/admin-customer-address-request.json'
import customerSample from '../../../../docs/api/examples/admin-customer.json'
import customersPageSample from '../../../../docs/api/examples/admin-customers-page.json'
import approvalRequestSample from '../../../../docs/api/examples/admin-driver-approval-request.json'
import driversPageSample from '../../../../docs/api/examples/admin-drivers-page.json'
import suspensionRequestSample from '../../../../docs/api/examples/admin-driver-suspension-request.json'
import phoneNotVerifiedSample from '../../../../docs/api/examples/error-partner-phone-not-verified.json'
import {
  addAdminCustomerAddress,
  changeAdminDriverApproval,
  getAdminCustomer,
  getAdminDriver,
  listAdminCustomers,
  listAdminDrivers,
} from './adminDirectory'
import { ApiError, createApiClient, CSRF_HEADER } from './client'

const BASE_URL = 'http://api.test'

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
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

const envelope = (code: string) => ({ error: { code, message: 'No', details: null } })

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the call to fail')
}

describe('admin customers client (admin-directory.md, #220)', () => {
  it('lists customers with the search text and limit', async () => {
    const { fetchMock, client } = setup(customersPageSample)
    const page = await listAdminCustomers({ q: 'Sample', limit: 100 }, undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/customers?q=Sample&limit=100`)
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.ordered_last_7_days).toBe(customersPageSample.ordered_last_7_days)
  })

  it('lists with no query string when there is no filter', async () => {
    const { fetchMock, client } = setup(customersPageSample)
    await listAdminCustomers({}, undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/customers`)
  })

  it('reads one customer: integer kobo, addresses with their zone, and a null delivery type', async () => {
    const withOldOrder = { ...customerSample, recent_orders: [{ ...customerSample.recent_orders[0], delivery_type: null }] }
    const { fetchMock, client } = setup(withOldOrder)
    const customer = await getAdminCustomer('0b8f1c5e', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/customers/0b8f1c5e`)
    expect(customer.paid_total_minor_units).toBe(4500000)
    expect(customer.addresses[0].zone).toMatchObject({ name: 'Independence Layout', is_active: true })
    expect(customer.recent_orders[0].delivery_type).toBeNull()
  })

  it('saves an address with the zone, sending the CSRF token, and returns the whole customer', async () => {
    const { fetchMock, client } = setup(customerSample)
    const customer = await addAdminCustomerAddress('0b8f1c5e', addressRequestSample, client)
    expect(sent(fetchMock)).toMatchObject({
      url: `${BASE_URL}/api/v1/admin/customers/0b8f1c5e/addresses`,
      method: 'POST',
      body: addressRequestSample,
      csrf: 'csrf-token',
    })
    expect(customer.addresses).toHaveLength(2)
  })

  it.each([
    ['get', 404, 'customer_not_found', (c: ReturnType<typeof setup>['client']) => getAdminCustomer('nope', undefined, c)],
    ['add address', 404, 'customer_not_found', (c: ReturnType<typeof setup>['client']) => addAdminCustomerAddress('nope', addressRequestSample, c)],
    ['add address', 404, 'service_zone_not_found', (c: ReturnType<typeof setup>['client']) => addAdminCustomerAddress('c1', addressRequestSample, c)],
    ['add address', 422, 'validation_error', (c: ReturnType<typeof setup>['client']) => addAdminCustomerAddress('c1', addressRequestSample, c)],
    ['list', 403, 'forbidden', (c: ReturnType<typeof setup>['client']) => listAdminCustomers({}, undefined, c)],
  ])('%s passes %i %s through', async (_name, status, code, call) => {
    const { client } = setup(envelope(code), status)
    const error = await rejection(call(client))
    expect([error.status, error.code]).toEqual([status, code])
  })

  it('reports a customer with a non-integer money amount as invalid_response, never as data', async () => {
    const { client } = setup({ ...customerSample, paid_total_minor_units: 45000.5 })
    const error = await rejection(getAdminCustomer('c1', undefined, client))
    expect(error.code).toBe('invalid_response')
  })
})

describe('admin drivers client (admin-directory.md, #220)', () => {
  it('lists drivers with the filters, with counts over every driver', async () => {
    const { fetchMock, client } = setup(driversPageSample)
    const page = await listAdminDrivers({ is_active: true, delivery_type: 'tanker', approval_status: 'pending', q: 'ENU', limit: 100 }, undefined, client)
    const url = new URL(sent(fetchMock).url)
    expect(url.pathname).toBe('/api/v1/admin/drivers')
    expect(Object.fromEntries(url.searchParams)).toEqual({ is_active: 'true', delivery_type: 'tanker', approval_status: 'pending', q: 'ENU', limit: '100' })
    expect(page.counts).toEqual({ all: 2, keke: 1, tanker: 1, pending: 1, inactive: 0, available: 1 })
  })

  it('reads one driver, keeping an unverified vehicle as null and an unknown approval status as it is', async () => {
    const unverified = {
      ...driversPageSample.items[0],
      approval_status: 'under_review',
      vehicle: { ...driversPageSample.items[0].vehicle, description: null, safe_payload_litres: null, transfer_methods: [], plate: null, delivery_type: null },
    }
    const { client } = setup(unverified)
    const driver = await getAdminDriver('d1', undefined, client)
    expect(driver.approval_status).toBe('under_review')
    expect(driver.vehicle).toMatchObject({ description: null, safe_payload_litres: null, plate: null, delivery_type: null })
  })

  it('approves with the verified vehicle and suspends with a reason, sending the CSRF token', async () => {
    const approve = setup(driversPageSample.items[0])
    await changeAdminDriverApproval('d1', approvalRequestSample as never, approve.client)
    expect(sent(approve.fetchMock)).toMatchObject({ url: `${BASE_URL}/api/v1/admin/drivers/d1/approval`, method: 'POST', body: approvalRequestSample, csrf: 'csrf-token' })

    const suspend = setup({ ...driversPageSample.items[0], approval_status: 'suspended' })
    const driver = await changeAdminDriverApproval('d1', suspensionRequestSample as never, suspend.client)
    expect(sent(suspend.fetchMock).body).toEqual(suspensionRequestSample)
    expect(driver.approval_status).toBe('suspended')
  })

  it.each([
    [404, 'driver_not_found', envelope('driver_not_found')],
    [409, 'driver_inactive', envelope('driver_inactive')],
    [409, 'partner_phone_not_verified', phoneNotVerifiedSample],
    [409, 'driver_has_accepted_job', envelope('driver_has_accepted_job')],
    [422, 'validation_error', envelope('validation_error')],
    [403, 'csrf_failed', envelope('csrf_failed')],
  ])('approval passes %i %s through', async (status, code, body) => {
    const { client } = setup(body, status)
    const error = await rejection(changeAdminDriverApproval('d1', { approval_status: 'suspended', reason: 'Papers expired' }, client))
    expect([error.status, error.code]).toEqual([status, code])
  })

  it('get passes 404 driver_not_found through', async () => {
    const { client } = setup(envelope('driver_not_found'), 404)
    const error = await rejection(getAdminDriver('nope', undefined, client))
    expect([error.status, error.code]).toEqual([404, 'driver_not_found'])
  })
})
