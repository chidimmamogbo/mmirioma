// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isIos } from './installPrompt'
import { appFor, applyManifest } from './manifest'
import { vapidKeyBytes } from './push'
import { REMIND_AFTER_DAYS, isSnoozed, snooze } from './remindLater'

afterEach(() => {
  document.head.innerHTML = ''
  localStorage.clear()
})

describe('appFor', () => {
  it('puts /partner pages in the partner app and everything else in the customer app', () => {
    expect(appFor('/partner')).toBe('partner')
    expect(appFor('/partner/')).toBe('partner')
    expect(appFor('/partner/rider/orders')).toBe('partner')
    expect(appFor('/partnership')).toBe('customer')
    expect(appFor('/')).toBe('customer')
    expect(appFor('/home')).toBe('customer')
  })
})

describe('applyManifest', () => {
  it('points the manifest link at the app of the current page', () => {
    document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest">'
    applyManifest('/partner/login')
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/partner.webmanifest')
    applyManifest('/faq')
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.webmanifest')
  })
})

describe('isIos', () => {
  it('spots iPhones and iPads (which report a Mac with touch)', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false)
  })
})

describe('remind later', () => {
  it('hides a card for a week, then shows it again', () => {
    const now = Date.UTC(2026, 9, 19)
    expect(isSnoozed('install-customer', now)).toBe(false)
    snooze('install-customer', now)
    expect(isSnoozed('install-customer', now + 86_400_000)).toBe(true)
    expect(isSnoozed('install-customer', now + REMIND_AFTER_DAYS * 86_400_000)).toBe(false)
    expect(isSnoozed('install-partner', now)).toBe(false)
  })
})

describe('vapidKeyBytes', () => {
  it('decodes a base64url key without padding', () => {
    expect(Array.from(vapidKeyBytes('AQID_-8'))).toEqual([1, 2, 3, 255, 239])
  })
})
