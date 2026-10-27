import { describe, expect, it } from 'vitest'
import { whatsappLink } from '../lib/whatsapp'
import { getPublicContact } from './publicMock'

describe('whatsappLink', () => {
  it('builds a wa.me link with digits only and the message typed in', () => {
    expect(whatsappLink('+2348011112222', 'Hi & hello?')).toBe('https://wa.me/2348011112222?text=Hi%20%26%20hello%3F')
    expect(whatsappLink('+2348011112222')).toBe('https://wa.me/2348011112222')
  })

  it('falls back to the official support number', () => {
    expect(whatsappLink(null)).toBe('https://wa.me/2348133774902')
  })
})

describe('support contact mock (docs/api/public-site.md)', () => {
  it('answers like the backend with WhatsApp on: the official number for both (FR-055)', async () => {
    expect(await getPublicContact()).toEqual({ phone: '+2348133774902', whatsapp: '+2348133774902' })
  })
})
