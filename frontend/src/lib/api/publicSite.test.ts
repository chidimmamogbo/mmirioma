import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './client'
import { getPublicContact } from './publicSite'
import contactExample from '../../../../docs/api/examples/public-contact.json'

function clientReturning(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

describe('GET /public/contact (#57)', () => {
  it('returns the contract example as it is', async () => {
    const { fetch, client } = clientReturning(contactExample)
    await expect(getPublicContact(client)).resolves.toEqual({ phone: '+2348133774902', whatsapp: '+2348133774902' })
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/public/contact')
  })

  it('keeps whatsapp null when WhatsApp support is off', async () => {
    const { client } = clientReturning({ phone: '+2348133774902', whatsapp: null })
    expect((await getPublicContact(client)).whatsapp).toBeNull()
  })

  it('passes 429 too_many_attempts through', async () => {
    const { client } = clientReturning({ error: { code: 'too_many_attempts', message: 'Too many attempts', details: { retry_after_seconds: 60 } } }, 429)
    await expect(getPublicContact(client)).rejects.toMatchObject({ status: 429, code: 'too_many_attempts' } satisfies Partial<ApiError>)
  })
})
