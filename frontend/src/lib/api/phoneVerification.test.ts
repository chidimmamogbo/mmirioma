import { describe, expect, it, vi } from 'vitest'
import type { User } from './auth'
import { ApiError, createApiClient } from './client'
import { requestPhoneChange, requestPhoneVerification, verifyPhone, verifyPhoneChange, type PhoneCodeSent } from './phoneVerification'

// Sample bodies from docs/api/auth.md, "Phone verification".
const SENT: PhoneCodeSent = {
  phone: '+2348000000001',
  expires_at: '2026-10-17T09:05:00Z',
  resend_available_at: '2026-10-17T09:01:00Z',
}
const USER: User = { id: 'u-1', name: 'Sample Customer', phone: '+2348000000001', role: 'customer', phone_verified: true }

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function errorBody(code: string, message: string, details: unknown = null) {
  return { error: { code, message, details } }
}

function clientReturning(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response)
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

describe('phone verification endpoints', () => {
  it('sends a code and returns when it expires and when a new one may be sent', async () => {
    const { fetch, client } = clientReturning(jsonResponse(SENT, 202))
    await expect(requestPhoneVerification(client)).resolves.toEqual(SENT)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/phone-verification')
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('passes a 429 through with the wait in details', async () => {
    const { client } = clientReturning(
      jsonResponse(errorBody('too_many_attempts', 'Too many attempts', { retry_after_seconds: 540 }), 429, { 'Retry-After': '540' }),
    )
    await expect(requestPhoneVerification(client)).rejects.toMatchObject({
      status: 429,
      code: 'too_many_attempts',
      details: { retry_after_seconds: 540 },
    } satisfies Partial<ApiError>)
  })

  it('passes 503 sms_unavailable through', async () => {
    const { client } = clientReturning(jsonResponse(errorBody('sms_unavailable', 'SMS could not be sent'), 503))
    await expect(requestPhoneVerification(client)).rejects.toMatchObject({ code: 'sms_unavailable' })
  })

  it('verifies a code and returns the verified user', async () => {
    const { fetch, client } = clientReturning(jsonResponse(USER))
    await expect(verifyPhone('482913', client)).resolves.toEqual(USER)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/phone-verification/verify')
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ code: '482913' })
  })

  it('passes a wrong code through with the tries left', async () => {
    const { client } = clientReturning(jsonResponse(errorBody('verification_code_invalid', 'Wrong code', { attempts_remaining: 4 }), 400))
    await expect(verifyPhone('000000', client)).rejects.toMatchObject({
      code: 'verification_code_invalid',
      details: { attempts_remaining: 4 },
    })
  })

  it('sends a code to a new number with the password', async () => {
    const { fetch, client } = clientReturning(jsonResponse({ ...SENT, phone: '+2348000000042' }, 202))
    await expect(requestPhoneChange({ phone: '0800 000 0042', password: 'sample-password' }, client)).resolves.toMatchObject({
      phone: '+2348000000042',
    })
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/phone-change')
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ phone: '0800 000 0042', password: 'sample-password' })
  })

  it('passes 403 password_incorrect through', async () => {
    const { client } = clientReturning(jsonResponse(errorBody('password_incorrect', 'Wrong password'), 403))
    await expect(requestPhoneChange({ phone: '08000000042', password: 'x' }, client)).rejects.toMatchObject({
      status: 403,
      code: 'password_incorrect',
    })
  })

  it('verifies the new number and returns the user with it', async () => {
    const changed = { ...USER, phone: '+2348000000042' }
    const { fetch, client } = clientReturning(jsonResponse(changed))
    await expect(verifyPhoneChange('123456', client)).resolves.toEqual(changed)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/phone-change/verify')
  })

  it('passes 409 phone_already_registered on the change check through', async () => {
    const { client } = clientReturning(jsonResponse(errorBody('phone_already_registered', 'Taken'), 409))
    await expect(verifyPhoneChange('123456', client)).rejects.toMatchObject({ code: 'phone_already_registered' })
  })
})
