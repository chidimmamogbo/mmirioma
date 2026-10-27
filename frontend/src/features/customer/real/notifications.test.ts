import { describe, expect, it, vi } from 'vitest'
import pageSample from '../../../../../docs/api/examples/customer-notifications-page.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import type { CustomerNotificationPage } from '../../../lib/api/customerNotifications'
import { customerNotificationsFromRead, listNotifications, markNotificationsRead } from './notifications'

/** The agreed contract's example (docs/api/customer-account.md, "Notifications"). */
const PAGE = pageSample as CustomerNotificationPage

function clientReturning(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

describe('customerNotificationsFromRead', () => {
  it('converts the contract example: read from read_at, created_at as at', () => {
    const [received, delivered] = customerNotificationsFromRead(PAGE.items)
    expect(received).toEqual({
      id: PAGE.items[0].id,
      kind: 'order_received',
      title: 'Request received',
      body: PAGE.items[0].body,
      at: '2026-10-26T12:35:00Z',
      read: false,
      reference: 'MO-7KQ2M9XH4T',
    })
    expect(delivered.kind).toBe('delivered')
    expect(delivered.read).toBe(true)
  })

  it('keeps the kinds the server adds, and shows an unknown one as a neutral update', () => {
    const base = PAGE.items[0]
    const kinds = ['order_confirmed', 'cancelled', 'delivery_failed', 'something_new'].map(
      (kind) => customerNotificationsFromRead([{ ...base, kind }])[0].kind,
    )
    expect(kinds).toEqual(['order_confirmed', 'cancelled', 'delivery_failed', 'update'])
  })
})

describe('listNotifications (real)', () => {
  it('loads the newest page from the customer path', async () => {
    const { fetch, client } = clientReturning(PAGE)
    expect((await listNotifications(client)).map((n) => n.kind)).toEqual(['order_received', 'delivered'])
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/me/notifications')
  })

  it('refuses a body that is not the agreed shape (invalid_response)', async () => {
    const { client } = clientReturning({ items: [{ id: 'x', read: false }], total: 1 })
    await expect(listNotifications(client)).rejects.toMatchObject({ code: 'invalid_response' } satisfies Partial<ApiError>)
  })

  it('passes 401 not_authenticated through as an ApiError', async () => {
    const { client } = clientReturning({ error: { code: 'not_authenticated', message: 'Sign in', details: null } }, 401)
    await expect(listNotifications(client)).rejects.toMatchObject({ status: 401, code: 'not_authenticated' } satisfies Partial<ApiError>)
  })
})

describe('markNotificationsRead (real)', () => {
  it('sends the ids, or an empty body to mark everything read', async () => {
    const one = clientReturning(null, 204)
    await markNotificationsRead(['9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e'], one.client)
    expect(one.fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/me/notifications/read')
    expect(JSON.parse(one.fetch.mock.calls[0][1]?.body as string)).toEqual({ ids: ['9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e'] })

    const all = clientReturning(null, 204)
    await markNotificationsRead(undefined, all.client)
    expect(JSON.parse(all.fetch.mock.calls[0][1]?.body as string)).toEqual({})
  })

  it('passes 422 validation_error through (more than 100 ids)', async () => {
    const { client } = clientReturning({ error: { code: 'validation_error', message: 'Request validation failed', details: [] } }, 422)
    await expect(markNotificationsRead(['x'], client)).rejects.toMatchObject({ status: 422, code: 'validation_error' } satisfies Partial<ApiError>)
  })
})
