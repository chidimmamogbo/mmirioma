import { describe, expect, it, vi } from 'vitest'
import zonesSample from '../../../../../docs/api/examples/admin-service-zones.json'
import nameTakenSample from '../../../../../docs/api/examples/error-service-zone-name-taken.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { listAreas, saveArea } from './areas'

/** A client whose `fetch` answers every request with `body` and `status`, recording what was sent. */
function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0]
    const request = init as RequestInit
    return { url: String(url), method: request.method ?? 'GET', body: request.body ? JSON.parse(String(request.body)) : null }
  }
  return { client, fetchMock, sent }
}

function envelope(code: string, details: unknown = null) {
  return { error: { code, message: `Sample ${code}`, details } }
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const zone = zonesSample.items[0]
const unchanged = { name: zone.name, enabled: false, station_id: null, distance_km: null, fixed_fee_minor_units: null }

describe('admin service area adapters (#74)', () => {
  it('listAreas maps every zone and leaves what the server does not give empty', async () => {
    const { client, sent } = setup(zonesSample)
    const areas = await listAreas(client)
    expect(sent()).toMatchObject({ url: 'http://api.test/api/v1/admin/service-zones', method: 'GET' })
    expect(areas).toEqual([
      { id: zone.id, name: 'Independence Layout', enabled: true, station_id: null, distance_km: null, fixed_fee_minor_units: null },
      { id: zonesSample.items[1].id, name: 'New Haven', enabled: false, station_id: null, distance_km: null, fixed_fee_minor_units: null },
    ])
  })

  it('listAreas passes a 403 through', async () => {
    const error = await rejection(listAreas(setup(envelope('forbidden'), 403).client))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })

  it('saveArea sends only the name and the active flag', async () => {
    const { client, sent } = setup({ ...zone, is_active: false })
    const area = await saveArea(zone.id, unchanged, client)
    expect(sent()).toMatchObject({ url: `http://api.test/api/v1/admin/service-zones/${zone.id}`, method: 'PATCH', body: { name: zone.name, is_active: false } })
    expect(area.enabled).toBe(false)
  })

  it('saveArea words a taken name as the screen does', async () => {
    const error = await rejection(saveArea(zone.id, unchanged, setup(nameTakenSample, 409).client))
    expect([error.status, error.code, error.message]).toEqual([409, 'service_zone_name_taken', 'An area with this name already exists'])
  })

  it('saveArea passes a 404 through', async () => {
    const error = await rejection(saveArea(zone.id, unchanged, setup(envelope('service_zone_not_found'), 404).client))
    expect([error.status, error.code]).toEqual([404, 'service_zone_not_found'])
  })

  it.each([
    ['adding an area', null, unchanged],
    ['a station', zone.id, { ...unchanged, station_id: 'st-1' }],
    ['a distance', zone.id, { ...unchanged, distance_km: 4.5 }],
    ['a fee', zone.id, { ...unchanged, fixed_fee_minor_units: 300000 }],
  ])('saveArea does not send %s, which the server cannot take yet', async (_, id, input) => {
    const { client, fetchMock } = setup(zone)
    const error = await rejection(saveArea(id, input, client))
    expect(error.code).toBe('not_connected')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
