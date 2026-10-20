// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mockLogin, mockLogout } from './authMock'
import { createOrder, getOrder } from './customerMock'
import { resetMockDb } from './db'
import {
  acceptJob,
  confirmPickup,
  declineJob,
  getEarnings,
  listAvailableJobs,
  listMyActiveJobs,
  partnerSignup,
  setOnline,
  verifyCode,
} from './partnerMock'
import { DEMO_PASSWORD } from './seed'

const RIDER = { phone: '0800 000 0101', password: DEMO_PASSWORD }
const DRIVER = { phone: '0800 000 0102', password: DEMO_PASSWORD }
const loaded = { loaded: true, receipt: true, photo_url: null, gallons_loaded: null }

beforeEach(() => resetMockDb())

describe('partner pool', () => {
  it('shows riders only Keke orders and tanker drivers only tanker orders that fit their tank', async () => {
    await mockLogin(RIDER)
    const keke = await listAvailableJobs()
    expect(keke.length).toBeGreaterThan(0)
    expect(keke.every((j) => j.choice.delivery_type === 'keke')).toBe(true)
    await mockLogout()
    await mockLogin(DRIVER)
    const tank = await listAvailableJobs()
    expect(tank.length).toBeGreaterThan(0)
    expect(tank.every((j) => j.choice.delivery_type === 'tanker' && (j.choice.tank_size_gallons ?? 0) <= 1000)).toBe(true)
  })

  it('is empty while offline', async () => {
    await mockLogin(RIDER)
    await setOnline(false)
    expect(await listAvailableJobs()).toEqual([])
  })

  it('hides server-only fields', async () => {
    await mockLogin(RIDER)
    const [job] = await listAvailableJobs()
    expect(job).not.toHaveProperty('partner_id')
    expect(job).not.toHaveProperty('mock_code')
  })

  it('new partners wait for approval and cannot go online', async () => {
    await partnerSignup({ name: 'New', phone: '0809 000 0099', password: 'long-enough', vehicle_type: 'keke', plate: 'ENU 1 KK', tank_gallons: null, service_area: 'GRA' })
    await expect(setOnline(true)).rejects.toMatchObject({ code: 'partner_not_approved' })
    expect(await listAvailableJobs()).toEqual([])
  })
})

describe('accept, decline, pickup, code', () => {
  it('gives an order to the first partner who accepts', async () => {
    await mockLogin(RIDER)
    const [job] = await listAvailableJobs()
    const mine = await acceptJob(job.reference)
    expect(mine.stage).toBe('accepted')
    await mockLogout()
    await partnerSignup({ name: 'Second', phone: '0809 000 0098', password: 'long-enough', vehicle_type: 'keke', plate: 'ENU 2 KK', tank_gallons: null, service_area: 'GRA' })
    await expect(acceptJob(job.reference)).rejects.toMatchObject({ code: 'partner_not_approved' })
  })

  it('declines only an assigned order, and puts it back in the pool without offering it again', async () => {
    await mockLogin(RIDER)
    const assigned = (await listMyActiveJobs()).find((j) => j.stage === 'assigned')!
    const [pool] = await listAvailableJobs()
    await expect(declineJob(pool.reference, 'not_available', '')).rejects.toMatchObject({ code: 'not_assigned_to_you' })
    await declineJob(assigned.reference, 'outside_area', 'Too far')
    expect((await listMyActiveJobs()).some((j) => j.reference === assigned.reference)).toBe(false)
    expect((await listAvailableJobs()).some((j) => j.reference === assigned.reference)).toBe(false)
  })

  it('needs the load confirmed before leaving the station', async () => {
    await mockLogin(RIDER)
    const [job] = await listAvailableJobs()
    await acceptJob(job.reference)
    await expect(confirmPickup(job.reference, { ...loaded, loaded: false })).rejects.toMatchObject({ code: 'load_not_confirmed' })
    expect((await confirmPickup(job.reference, loaded)).stage).toBe('collected')
  })

  it('needs the full gallons loaded for a tanker', async () => {
    await mockLogin(DRIVER)
    const job = (await listAvailableJobs()).find((j) => j.choice.delivery_type === 'tanker' && j.choice.tank_size_gallons === 750)!
    await acceptJob(job.reference)
    await expect(confirmPickup(job.reference, { ...loaded, gallons_loaded: 600 })).rejects.toMatchObject({ code: 'load_not_confirmed' })
    expect((await confirmPickup(job.reference, { ...loaded, gallons_loaded: 750 })).stage).toBe('collected')
  })

  it('counts wrong codes down and locks after three', async () => {
    await mockLogin(RIDER)
    const active = (await listMyActiveJobs()).find((j) => j.stage === 'collected')!
    await expect(verifyCode(active.reference, '000000')).rejects.toMatchObject({ code: 'invalid_code', details: { tries_left: 2 } })
    await expect(verifyCode(active.reference, '000001')).rejects.toMatchObject({ details: { tries_left: 1 } })
    await expect(verifyCode(active.reference, '000002')).rejects.toMatchObject({ code: 'code_locked' })
    await expect(verifyCode(active.reference, '482791')).rejects.toMatchObject({ code: 'code_locked' })
  })

  it('completes with the customer code, pays the partner and updates the customer order', async () => {
    await mockLogin(RIDER)
    const before = (await getEarnings()).wallet_minor_units
    const done = await verifyCode('MO-7KQ2M9XH4T', '482791')
    expect(done.stage).toBe('delivered')
    expect((await getEarnings()).wallet_minor_units).toBe(before + done.earning_minor_units)
    await mockLogout()
    await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
    const order = await getOrder('MO-7KQ2M9XH4T')
    expect(order.stage).toBe('delivered')
    expect(order.delivery_code).toBeNull()
  })

  it('offers a new customer order to riders, and the customer sees the rider once accepted', async () => {
    await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
    const order = await createOrder({
      idempotency_key: 'k-new',
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
    expect((await listAvailableJobs()).some((j) => j.reference === order.reference)).toBe(true)
    await acceptJob(order.reference)
    await mockLogout()
    await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
    const seen = await getOrder(order.reference)
    expect(seen.stage).toBe('rider_assigned')
    expect(seen.partner?.name).toBe('Chinedu Okafor')
  })
})
