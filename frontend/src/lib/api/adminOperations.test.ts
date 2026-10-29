import { describe, expect, it, vi } from 'vitest'
import activitySample from '../../../../docs/api/examples/admin-activity.json'
import dashboardSample from '../../../../docs/api/examples/admin-dashboard.json'
import liveMapSample from '../../../../docs/api/examples/admin-live-map.json'
import settingsSample from '../../../../docs/api/examples/admin-settings.json'
import shellSample from '../../../../docs/api/examples/admin-shell.json'
import { getAdminActivity, getAdminDashboard, getAdminLiveMap, getAdminSettings, getAdminShell } from './adminOperations'
import { ApiError, createApiClient } from './client'

const BASE_URL = 'http://api.test'

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  return { fetchMock, client: createApiClient({ baseUrl: BASE_URL, fetch: fetchMock }) }
}

const url = (fetchMock: ReturnType<typeof setup>['fetchMock']) => String(fetchMock.mock.calls[0][0])
const envelope = (code: string) => ({ error: { code, message: 'No', details: null } })

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the call to fail')
}

describe('admin operations client (admin-operations.md, #217)', () => {
  it('reads the shell counts', async () => {
    const { fetchMock, client } = setup(shellSample)
    expect(await getAdminShell(undefined, client)).toEqual(shellSample)
    expect(url(fetchMock)).toBe(`${BASE_URL}/api/v1/admin/shell`)
  })

  it('reads the dashboard for today, sending no simulated parameter (real orders by default, BR-09)', async () => {
    const { fetchMock, client } = setup(dashboardSample)
    const dashboard = await getAdminDashboard(undefined, client)
    expect(url(fetchMock)).toBe(`${BASE_URL}/api/v1/admin/dashboard`)
    expect(dashboard.cash.collected_minor_units).toBe(4130000)
    expect(dashboard.orders.by_status).toMatchObject({ confirmed: 2, delivered: 7 })
  })

  it('reads the live map, keeping a null plate, source and zone as null', async () => {
    const sparse = {
      ...liveMapSample,
      deliveries: [{ ...liveMapSample.deliveries[0], delivery_type: null, driver: { ...liveMapSample.deliveries[0].driver, plate: null }, source: null, zone: null }],
    }
    const { client } = setup(sparse)
    const map = await getAdminLiveMap(undefined, client)
    expect(map.deliveries[0]).toMatchObject({ delivery_type: null, source: null, zone: null, driver: { plate: null } })
    expect(map.sources).toHaveLength(2)
  })

  it('reads the activity, with and without a limit', async () => {
    const first = setup(activitySample)
    expect((await getAdminActivity(undefined, undefined, first.client)).items).toHaveLength(3)
    expect(url(first.fetchMock)).toBe(`${BASE_URL}/api/v1/admin/activity`)

    const second = setup(activitySample)
    await getAdminActivity(10, undefined, second.client)
    expect(url(second.fetchMock)).toBe(`${BASE_URL}/api/v1/admin/activity?limit=10`)
  })

  it('keeps an activity kind it does not know, so the screen can show a plain line', async () => {
    const { client } = setup({ items: [{ ...activitySample.items[0], kind: 'something_new' }] })
    expect((await getAdminActivity(undefined, undefined, client)).items[0].kind).toBe('something_new')
  })

  it('reads the settings', async () => {
    const { fetchMock, client } = setup(settingsSample)
    const settings = await getAdminSettings(undefined, client)
    expect(url(fetchMock)).toBe(`${BASE_URL}/api/v1/admin/settings`)
    expect(settings.delivery_code_validity_minutes).toBe(10)
    expect(settings.staff[0]).toMatchObject({ role: 'admin', last_sign_in_at: '2026-10-27T07:58:00Z' })
  })

  it.each([
    ['getAdminShell', (c: ReturnType<typeof setup>['client']) => getAdminShell(undefined, c)],
    ['getAdminDashboard', (c: ReturnType<typeof setup>['client']) => getAdminDashboard(undefined, c)],
    ['getAdminLiveMap', (c: ReturnType<typeof setup>['client']) => getAdminLiveMap(undefined, c)],
    ['getAdminActivity', (c: ReturnType<typeof setup>['client']) => getAdminActivity(undefined, undefined, c)],
    ['getAdminSettings', (c: ReturnType<typeof setup>['client']) => getAdminSettings(undefined, c)],
  ])('%s passes 403 forbidden through (a customer or driver account)', async (_name, call) => {
    const { client } = setup(envelope('forbidden'), 403)
    const error = await rejection(call(client))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })

  it('passes 422 validation_error through for a limit outside 1 to 20', async () => {
    const { client } = setup(envelope('validation_error'), 422)
    const error = await rejection(getAdminActivity(50, undefined, client))
    expect([error.status, error.code]).toEqual([422, 'validation_error'])
  })

  it('reports a response that breaks the contract as invalid_response, never as data', async () => {
    const { client } = setup({ ...shellSample, notifications_unread: 'many' })
    const error = await rejection(getAdminShell(undefined, client))
    expect(error.code).toBe('invalid_response')
  })
})
