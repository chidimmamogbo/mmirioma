import { describe, expect, it, vi } from 'vitest'
import deletionSample from '../../../../../docs/api/examples/deletion-request.json'
import supportPageSample from '../../../../../docs/api/examples/support-requests-page.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import type { DeletionRequestRead, SupportRequestRead } from '../../../lib/api/customerSupport'
import type { Page } from '../../../lib/api/adminOrders'
import { createTicket, listTickets, requestAccountDeletion, ticketFromDeletionRequest, ticketFromSupportRequest } from './support'

/** The agreed contract's examples (docs/api/customer-account.md). */
const SUPPORT_PAGE = supportPageSample as Page<SupportRequestRead>
const DELETION = deletionSample as DeletionRequestRead
const REQUEST = SUPPORT_PAGE.items[0]

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** A fetch that answers by URL, for adapters that make more than one call. */
function clientByUrl(route: (url: string, init?: RequestInit) => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => route(String(input), init))
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

const NOT_FOUND_DELETION = { error: { code: 'deletion_request_not_found', message: 'No open request', details: null } }

describe('ticket conversions', () => {
  it('turns a support request into a problem ticket', () => {
    expect(ticketFromSupportRequest(REQUEST)).toEqual({
      id: 'SR-4K7M2Q9X',
      number: 'SR-4K7M2Q9X',
      title: 'Late delivery',
      at: REQUEST.created_at,
      note: 'About MO-7KQ2',
      status: 'open',
      kind: 'problem',
    })
    expect(ticketFromSupportRequest({ ...REQUEST, order_reference: null }).note).toBeNull()
  })

  it('turns the deletion request into a question ticket, open until staff complete or refuse it', () => {
    expect(ticketFromDeletionRequest(DELETION)).toMatchObject({ number: 'DR-8H3N6P2W', title: 'Delete my account', kind: 'question', status: 'open' })
    expect(ticketFromDeletionRequest({ ...DELETION, status: 'acknowledged' }).status).toBe('open')
    expect(ticketFromDeletionRequest({ ...DELETION, status: 'completed' }).status).toBe('resolved')
    expect(ticketFromDeletionRequest({ ...DELETION, status: 'refused' }).status).toBe('resolved')
  })
})

describe('listTickets (real)', () => {
  it('lists the support requests and the open deletion request, newest first', async () => {
    const { client } = clientByUrl((url) => (url.includes('/deletion-request') ? json(DELETION) : json(SUPPORT_PAGE)))
    const tickets = await listTickets(client)
    expect(tickets.map((t) => t.number)).toEqual(['DR-8H3N6P2W', 'SR-4K7M2Q9X'])
  })

  it('treats deletion_request_not_found as no deletion request', async () => {
    const { client } = clientByUrl((url) => (url.includes('/deletion-request') ? json(NOT_FOUND_DELETION, 404) : json(SUPPORT_PAGE)))
    expect((await listTickets(client)).map((t) => t.kind)).toEqual(['problem'])
  })

  it('passes any other error through', async () => {
    const { client } = clientByUrl(() => json({ error: { code: 'not_authenticated', message: 'Sign in', details: null } }, 401))
    await expect(listTickets(client)).rejects.toMatchObject({ status: 401, code: 'not_authenticated' } satisfies Partial<ApiError>)
  })
})

describe('createTicket (real)', () => {
  const INPUT = { type: 'late' as const, message: 'The water has not arrived yet.', reference: 'MO-7KQ2M9XH4T' }

  it('sends the report with a key and returns the ticket', async () => {
    const { fetch, client } = clientByUrl(() => json(REQUEST, 201))
    const ticket = await createTicket(INPUT, client)
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string)
    expect(body).toMatchObject({ type: 'late', message: INPUT.message, order_reference: 'MO-7KQ2M9XH4T' })
    expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
    expect(ticket.number).toBe('SR-4K7M2Q9X')
  })

  it('reuses the same key when a dropped connection is retried, so the report is filed once', async () => {
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      calls += 1
      if (calls === 1) throw new TypeError('Failed to fetch')
      return json(REQUEST, 200)
    })
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })
    const input = { ...INPUT, message: 'Retry me, same report.' }
    await expect(createTicket(input, client)).rejects.toMatchObject({ kind: 'network' } satisfies Partial<ApiError>)
    await createTicket(input, client)
    const keys = fetch.mock.calls.map((c) => JSON.parse(c[1]?.body as string).idempotency_key)
    expect(keys[0]).toBe(keys[1])
  })

  it('passes 404 order_not_found through and starts the next attempt fresh', async () => {
    const { fetch, client } = clientByUrl(() => json({ error: { code: 'order_not_found', message: 'Order not found', details: null } }, 404))
    const input = { ...INPUT, message: 'Not my order.' }
    await expect(createTicket(input, client)).rejects.toMatchObject({ status: 404, code: 'order_not_found' } satisfies Partial<ApiError>)
    await expect(createTicket(input, client)).rejects.toBeInstanceOf(ApiError)
    const keys = fetch.mock.calls.map((c) => JSON.parse(c[1]?.body as string).idempotency_key)
    expect(keys[0]).not.toBe(keys[1])
  })
})

describe('requestAccountDeletion (real)', () => {
  it('posts the trimmed reason, or null for none, and returns the request as a ticket', async () => {
    const { fetch, client } = clientByUrl(() => json(DELETION, 202))
    expect((await requestAccountDeletion('  Moving away ', client)).number).toBe('DR-8H3N6P2W')
    await requestAccountDeletion('   ', client)
    expect(fetch.mock.calls.map((c) => JSON.parse(c[1]?.body as string))).toEqual([{ reason: 'Moving away' }, { reason: null }])
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/me/deletion-request')
  })

  it('passes 422 validation_error through', async () => {
    const { client } = clientByUrl(() => json({ error: { code: 'validation_error', message: 'Too long', details: [] } }, 422))
    await expect(requestAccountDeletion('x'.repeat(600), client)).rejects.toMatchObject({ status: 422, code: 'validation_error' } satisfies Partial<ApiError>)
  })
})
