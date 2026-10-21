// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { whatsappLink } from '../lib/whatsapp'
import { getSettings, saveSettings } from './adminMock'
import { mockLogin, mockLogout } from './authMock'
import { read, resetMockDb } from './db'
import { getPublicContact, subscribeNewsletter } from './publicMock'
import { DEMO_ADMIN_PHONE, DEMO_PASSWORD } from './seed'

const ADMIN = { phone: DEMO_ADMIN_PHONE, password: DEMO_PASSWORD }

beforeEach(() => resetMockDb())

describe('whatsappLink', () => {
  it('builds a wa.me link with digits only and the message typed in', () => {
    expect(whatsappLink('+2348011112222', 'Hi & hello?')).toBe('https://wa.me/2348011112222?text=Hi%20%26%20hello%3F')
    expect(whatsappLink('+2348011112222')).toBe('https://wa.me/2348011112222')
  })

  it('falls back to the interim company number', () => {
    expect(whatsappLink(null)).toBe('https://wa.me/2348133774902')
  })
})

describe('company WhatsApp number', () => {
  it('is empty until admin sets it, then the website reads the saved number', async () => {
    expect((await getPublicContact()).whatsapp).toBeNull()
    await mockLogin(ADMIN)
    const { settings } = await getSettings()
    const saved = await saveSettings({ ...settings, support_whatsapp: '0802 345 6789' })
    expect(saved.support_whatsapp).toBe('+2348023456789')
    await mockLogout()
    // No sign-in needed on the website.
    expect((await getPublicContact()).whatsapp).toBe('+2348023456789')
  })

  it('refuses a number WhatsApp cannot open, and empty means "use the default"', async () => {
    await mockLogin(ADMIN)
    const { settings } = await getSettings()
    await expect(saveSettings({ ...settings, support_whatsapp: '12345' })).rejects.toMatchObject({ status: 422, code: 'validation_error' })
    expect(read().admin.settings.support_whatsapp).toBeNull()
    await saveSettings({ ...settings, support_whatsapp: '0802 345 6789' })
    await saveSettings({ ...settings, support_whatsapp: '  ' })
    expect((await getPublicContact()).whatsapp).toBeNull()
  })

  it('is admin only to change', async () => {
    await mockLogin(ADMIN)
    const { settings } = await getSettings()
    await mockLogout()
    await expect(saveSettings({ ...settings, support_whatsapp: '0802 345 6789' })).rejects.toMatchObject({ status: 401 })
  })
})

describe('newsletter sign-up', () => {
  it('stores the address once, in lower case, and answers the same for a repeat', async () => {
    expect(await subscribeNewsletter({ email: '  Ada@Example.com ' })).toEqual({ status: 'subscribed' })
    expect(await subscribeNewsletter({ email: 'ada@example.com' })).toEqual({ status: 'subscribed' })
    expect(read().newsletter?.map((n) => n.email)).toEqual(['ada@example.com'])
  })

  it('rejects something that is not an email', async () => {
    await expect(subscribeNewsletter({ email: 'ada@example' })).rejects.toMatchObject({ status: 422, code: 'validation_error' })
    await expect(subscribeNewsletter({ email: `${'a'.repeat(250)}@x.co` })).rejects.toMatchObject({ status: 422 })
    expect(read().newsletter ?? []).toEqual([])
  })

  it('works with mock data saved before the list existed', async () => {
    const s = read()
    delete s.newsletter
    await subscribeNewsletter({ email: 'old@example.com' })
    expect(read().newsletter).toHaveLength(1)
  })
})
