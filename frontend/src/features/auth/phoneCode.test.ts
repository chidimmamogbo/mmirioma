import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api/client'
import { cleanCode, resendWaitMs, waitText } from './phoneCode'

describe('cleanCode', () => {
  it('keeps a pasted code with spaces or dashes whole (correction 11)', () => {
    expect(cleanCode('123 456')).toBe('123456')
    expect(cleanCode('123-456')).toBe('123456')
    expect(cleanCode(' 1234567 ')).toBe('123456')
    expect(cleanCode('ab12')).toBe('12')
  })
})

describe('resendWaitMs', () => {
  it('measures the wait from the server times only (correction 12)', () => {
    expect(resendWaitMs({ phone: '+2348000000001', expires_at: '2026-10-17T09:05:00Z', resend_available_at: '2026-10-17T09:01:00Z' })).toBe(60_000)
  })

  it('falls back to 60 seconds when the times cannot be read', () => {
    expect(resendWaitMs({ phone: '+2348000000001', expires_at: 'x', resend_available_at: 'y' })).toBe(60_000)
  })
})

describe('waitText', () => {
  it('turns retry_after_seconds into whole minutes', () => {
    const error = new ApiError({ kind: 'http', status: 429, code: 'too_many_attempts', message: 'x', details: { retry_after_seconds: 540 } })
    expect(waitText(error)).toBe('Wait 9 minutes, then try again.')
  })

  it('is null for other errors', () => {
    expect(waitText(new ApiError({ kind: 'http', status: 503, code: 'sms_unavailable', message: 'x', details: null }))).toBeNull()
  })
})
