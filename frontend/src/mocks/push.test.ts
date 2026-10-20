// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mockGetMe, mockLogin, mockLogout } from './authMock'
import { createOrder } from './customerMock'
import { mutate, read, resetMockDb } from './db'
import { notificationIds, pushMessages } from './mockPush'
import { listPartnerNotifications } from './partnerMock'
import { DEMO_DRIVER_ID, DEMO_RIDER_ID } from './partnerSeed'
import { getPushSettings, savePushSettings } from './pushMock'
import { DEMO_CUSTOMER_ID, DEMO_PASSWORD, seedState } from './seed'

const CUSTOMER = { phone: '0803 123 4567', password: DEMO_PASSWORD }
const RIDER = { phone: '0800 000 0101', password: DEMO_PASSWORD }

beforeEach(() => resetMockDb())

describe('mock session', () => {
  it('lasts 7 days from sign-in, then the user is signed out', async () => {
    const session = await mockLogin(CUSTOMER)
    const days = (Date.parse(session.expires_at) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
    expect((await mockGetMe()).user.id).toBe(DEMO_CUSTOMER_ID)

    mutate((s) => {
      s.sessionExpiresAt = new Date(Date.now() - 1000).toISOString()
    })
    await expect(mockGetMe()).rejects.toMatchObject({ status: 401, code: 'not_authenticated' })
    expect(read().sessionUserId).toBeNull()
  })

  it('is kept in localStorage, so it survives closing the tab or app', async () => {
    await mockLogin(CUSTOMER)
    expect(localStorage.getItem('mmirioma.mock.v3')).toContain(DEMO_CUSTOMER_ID)
  })
})

describe('push settings', () => {
  it('start off, and saving them records this browser for the signed-in user', async () => {
    await mockLogin(RIDER)
    expect(await getPushSettings()).toEqual({ enabled: false, new_orders: false })
    expect(await savePushSettings({ enabled: true, new_orders: true })).toEqual({ enabled: true, new_orders: true })
    expect(read().pushSubscriptions[DEMO_RIDER_ID]?.new_orders).toBe(true)
    await savePushSettings({ enabled: false, new_orders: true })
    expect(read().pushSubscriptions[DEMO_RIDER_ID]).toBeUndefined()
  })
})

describe('pushMessages', () => {
  const note = (kind: string, reference: string | null = 'MO-TEST000001') => ({
    id: `n-${kind}`,
    kind,
    title: kind,
    body: 'x',
    at: new Date().toISOString(),
    read: false,
    reference,
  })

  it('pushes only the agreed customer events, and only to users who turned push on', () => {
    const s = seedState()
    const before = notificationIds(s)
    s.customers[DEMO_CUSTOMER_ID].notifications.unshift(note('rider_assigned') as never, note('points') as never, note('delivered') as never)
    expect(pushMessages(s, before)).toEqual([])

    s.pushSubscriptions[DEMO_CUSTOMER_ID] = { new_orders: false, created_at: '' }
    const sent = pushMessages(s, before)
    expect(sent.map((m) => m.title)).toEqual(['rider_assigned', 'delivered'])
    expect(sent[0].url).toBe('/orders/MO-TEST000001/track')
    expect(sent[1].url).toBe('/orders/MO-TEST000001/delivered')
  })

  it('pushes partner assignments and payouts, and new orders only when opted in', () => {
    const s = seedState()
    const before = notificationIds(s)
    s.partners[DEMO_DRIVER_ID].notifications.unshift(note('assigned') as never, note('payout', null) as never, note('new_orders') as never)
    s.pushSubscriptions[DEMO_DRIVER_ID] = { new_orders: false, created_at: '' }
    expect(pushMessages(s, before).map((m) => [m.title, m.url])).toEqual([
      ['assigned', '/partner'],
      ['payout', '/partner/driver/earnings'],
    ])
    s.pushSubscriptions[DEMO_DRIVER_ID].new_orders = true
    expect(pushMessages(s, before).map((m) => m.url)).toContain('/partner/driver/orders/MO-TEST000001')
  })

  it('ignores notifications that existed before the change', () => {
    const s = seedState()
    s.pushSubscriptions[DEMO_CUSTOMER_ID] = { new_orders: false, created_at: '' }
    s.customers[DEMO_CUSTOMER_ID].notifications.unshift(note('rider_assigned') as never)
    expect(pushMessages(s, notificationIds(s))).toEqual([])
  })
})

describe('new order alerts', () => {
  it('tell online, approved riders who can take the order, not tanker drivers', async () => {
    await mockLogin(CUSTOMER)
    const order = await createOrder({
      idempotency_key: 'k-alert',
      choice: { delivery_type: 'keke', can_size_litres: 25, can_count: 12 },
      address_label: 'Home',
      address: '12 Lakeview Street, GRA, Enugu',
      landmark: null,
      receiver_name: 'Adaeze Nwosu',
      receiver_phone: '0803 123 4567',
      instructions: null,
    })
    await mockLogout()
    await mockLogin(RIDER)
    const notes = await listPartnerNotifications()
    expect(notes[0]).toMatchObject({ kind: 'new_orders', reference: order.reference, title: 'New order near you' })
    expect(read().partners[DEMO_DRIVER_ID].notifications.some((n) => n.reference === order.reference)).toBe(false)
  })
})
