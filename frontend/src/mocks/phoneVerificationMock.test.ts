import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRegister } from './authMock'
import { read, resetMockDb } from './db'
import {
  mockRequestPhoneChange,
  mockRequestPhoneVerification,
  mockVerifyPhone,
  mockVerifyPhoneChange,
  openCodeForTests,
} from './phoneVerificationMock'

beforeEach(async () => {
  resetMockDb()
  vi.useRealTimers()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  await mockRegister({ name: 'Sample Customer', phone: '08000000071', password: 'sample-password-1' })
})

describe('phone verification mock (auth.md)', () => {
  it('sends a 6-digit code that works for 5 minutes and allows a resend after 60 seconds', async () => {
    const sent = await mockRequestPhoneVerification()
    expect(sent.phone).toBe('+2348000000071')
    expect(openCodeForTests()).toMatch(/^\d{6}$/)
    expect(Date.parse(sent.expires_at) - Date.parse(sent.resend_available_at)).toBe(4 * 60_000)
  })

  it('refuses a second code within 60 seconds with a wait', async () => {
    await mockRequestPhoneVerification()
    await expect(mockRequestPhoneVerification()).rejects.toMatchObject({ status: 429, code: 'too_many_attempts' })
  })

  it('counts wrong codes down and voids the code after the fifth', async () => {
    await mockRequestPhoneVerification()
    const wrong = openCodeForTests() === '000000' ? '111111' : '000000'
    for (const left of [4, 3, 2, 1, 0]) {
      await expect(mockVerifyPhone(wrong)).rejects.toMatchObject({ code: 'verification_code_invalid', details: { attempts_remaining: left } })
    }
    await expect(mockVerifyPhone(openCodeForTests()!)).rejects.toMatchObject({ code: 'verification_code_expired' })
  })

  it('verifies the phone with the right code, once', async () => {
    await mockRequestPhoneVerification()
    const code = openCodeForTests()!
    await expect(mockVerifyPhone(code)).resolves.toMatchObject({ phone_verified: true })
    await expect(mockVerifyPhone(code)).rejects.toMatchObject({ code: 'verification_code_expired' })
    await expect(mockRequestPhoneVerification()).rejects.toMatchObject({ status: 409, code: 'phone_already_verified' })
  })

  it('changes the number only after the new one is verified', async () => {
    await expect(mockRequestPhoneChange({ phone: '08000000071', password: 'sample-password-1' })).rejects.toMatchObject({ code: 'phone_unchanged' })
    await expect(mockRequestPhoneChange({ phone: '08000000072', password: 'wrong' })).rejects.toMatchObject({ status: 403, code: 'password_incorrect' })
    await mockRequestPhoneChange({ phone: '08000000072', password: 'sample-password-1' })
    expect(read().users.some((u) => u.phone === '+2348000000071')).toBe(true)
    await expect(mockVerifyPhoneChange(openCodeForTests()!)).resolves.toMatchObject({ phone: '+2348000000072', phone_verified: true })
  })
})
