import { describe, expect, it, vi } from 'vitest'
import auditSample from '../../../../docs/api/examples/admin-audit-logs-page.json'
import notificationsSample from '../../../../docs/api/examples/admin-notifications-page.json'
import alreadyResolvedSample from '../../../../docs/api/examples/error-support-request-already-resolved.json'
import resolveRequestSample from '../../../../docs/api/examples/admin-support-resolve-request.json'
import requestSample from '../../../../docs/api/examples/admin-support-request.json'
import requestsPageSample from '../../../../docs/api/examples/admin-support-requests-page.json'
import {
  getAdminSupportRequest,
  listAdminAuditLogs,
  listAdminNotificationsPage,
  listAdminSupportRequests,
  markAdminNotificationsReadRequest,
  resolveAdminSupportRequest,
} from './adminSupport'
import { ApiError, createApiClient, CSRF_HEADER } from './client'

const BASE_URL = 'http://api.test'

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
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

describe('admin support requests client (admin-operations.md, #219)', () => {
  it('lists requests with the search text and limit, and keeps a null resolution as null', async () => {
    const { fetchMock, client } = setup(requestsPageSample)
    const page = await listAdminSupportRequests({ q: 'MO-7KQ2', limit: 100 }, undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/support-requests?q=MO-7KQ2&limit=100`)
    expect(page.items[0].resolution).toBeNull()
    expect(page.items[1].resolution?.resolved_by.name).toBe('Sample Admin')
  })

  it('lists with no query string when there is no filter', async () => {
    const { fetchMock, client } = setup(requestsPageSample)
    await listAdminSupportRequests({}, undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/support-requests`)
  })

  it('reads one request with its contacts', async () => {
    const { fetchMock, client } = setup({ ...requestSample, contacts: [{ name: 'Sample Customer', role: 'customer', phone: '+2348000000001' }] })
    const detail = await getAdminSupportRequest('SR-4K7M2Q9X', undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/support-requests/SR-4K7M2Q9X`)
    expect(detail.contacts).toEqual([{ name: 'Sample Customer', role: 'customer', phone: '+2348000000001' }])
  })

  it('resolves with a note, sending the CSRF token, and returns the resolved request', async () => {
    const { fetchMock, client } = setup(requestSample)
    const resolved = await resolveAdminSupportRequest('SR-4K7M2Q9X', resolveRequestSample.note, client)
    expect(sent(fetchMock)).toMatchObject({
      url: `${BASE_URL}/api/v1/admin/support-requests/SR-4K7M2Q9X/resolve`,
      method: 'POST',
      body: { note: resolveRequestSample.note },
      csrf: 'csrf-token',
    })
    expect(resolved.status).toBe('resolved')
  })

  it.each([
    [404, 'support_request_not_found'],
    [409, 'support_request_already_resolved'],
    [422, 'validation_error'],
    [403, 'csrf_failed'],
  ])('resolve passes %i %s through', async (status, code) => {
    const body = code === 'support_request_already_resolved' ? alreadyResolvedSample : envelope(code)
    const { client } = setup(body, status)
    const error = await rejection(resolveAdminSupportRequest('SR-4K7M2Q9X', 'Called the customer.', client))
    expect([error.status, error.code]).toEqual([status, code])
  })

  it('get passes 404 support_request_not_found through', async () => {
    const { client } = setup(envelope('support_request_not_found'), 404)
    const error = await rejection(getAdminSupportRequest('SR-NOPE0000', undefined, client))
    expect([error.status, error.code]).toEqual([404, 'support_request_not_found'])
  })

  it('reports a request with an unknown status as invalid_response, never as the wrong state', async () => {
    const { client } = setup({ ...requestsPageSample, items: [{ ...requestsPageSample.items[0], status: 'reopened' }] })
    const error = await rejection(listAdminSupportRequests({}, undefined, client))
    expect(error.code).toBe('invalid_response')
  })
})

describe('admin audit log and notifications client (#219)', () => {
  it('reads the audit log with a limit, and keeps an action code it does not know', async () => {
    const { fetchMock, client } = setup({ ...auditSample, items: [{ ...auditSample.items[0], action: 'something_new' }] })
    const page = await listAdminAuditLogs(20, undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/audit-logs?limit=20`)
    expect(page.items[0]).toMatchObject({ action: 'something_new', actor: { name: 'Sample Admin' } })
  })

  it('reads the notifications with their unread count', async () => {
    const { fetchMock, client } = setup(notificationsSample)
    const page = await listAdminNotificationsPage(undefined, client)
    expect(sent(fetchMock).url).toBe(`${BASE_URL}/api/v1/admin/notifications`)
    expect(page.items[0]).toMatchObject({ kind: 'driver_declined', reference: 'MO-3HT8WQ2KZP', read_at: null })
    expect(page.unread_count).toBe(notificationsSample.unread_count)
  })

  it('marks every notification read with an empty body, and with ids when given', async () => {
    const all = setup(null, 204)
    await markAdminNotificationsReadRequest(undefined, all.client)
    expect(sent(all.fetchMock)).toMatchObject({ url: `${BASE_URL}/api/v1/admin/notifications/read`, method: 'POST', body: {}, csrf: 'csrf-token' })

    const some = setup(null, 204)
    await markAdminNotificationsReadRequest(['n1', 'n2'], some.client)
    expect(sent(some.fetchMock).body).toEqual({ ids: ['n1', 'n2'] })
  })

  it.each([
    ['audit log', (c: ReturnType<typeof setup>['client']) => listAdminAuditLogs(undefined, undefined, c)],
    ['notifications', (c: ReturnType<typeof setup>['client']) => listAdminNotificationsPage(undefined, c)],
    ['support requests', (c: ReturnType<typeof setup>['client']) => listAdminSupportRequests({}, undefined, c)],
  ])('%s pass 403 forbidden through (a customer or driver account)', async (_name, call) => {
    const { client } = setup(envelope('forbidden'), 403)
    const error = await rejection(call(client))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })

  it('mark read passes 422 validation_error through for more than 100 ids', async () => {
    const { client } = setup(envelope('validation_error'), 422)
    const error = await rejection(markAdminNotificationsReadRequest(Array.from({ length: 101 }, (_, i) => `id-${i}`), client))
    expect([error.status, error.code]).toEqual([422, 'validation_error'])
  })
})
