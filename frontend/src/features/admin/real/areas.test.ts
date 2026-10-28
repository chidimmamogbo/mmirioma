import { describe, expect, it, vi } from 'vitest'
import zonesSample from '../../../../../docs/api/examples/admin-service-zones.json'
import nameTakenSample from '../../../../../docs/api/examples/error-service-zone-name-taken.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import { listAreas, saveArea } from './areas'

/**
 * A client that answers the zone list (GET) with `list` and every write with
 * `write`, recording each request. `saveArea` reads the list before it writes.
 */
function setup(list: unknown, write: { body: unknown; status?: number } = { body: null }, listStatus = 200) {
  const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
    const isWrite = (init?.method ?? 'GET') !== 'GET'
    const status = isWrite ? (write.status ?? 200) : listStatus
    return new Response(JSON.stringify(isWrite ? write.body : list), { status, headers: { 'Content-Type': 'application/json' } })
  })
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock })
  client.setCsrfToken('csrf-token')
  const requests = () =>
    fetchMock.mock.calls.map(([url, init]) => {
      const request = init as RequestInit
      return { url: String(url), method: request.method ?? 'GET', body: request.body ? JSON.parse(String(request.body)) : null }
    })
  return { client, fetchMock, requests, writes: () => requests().filter((r) => r.method !== 'GET') }
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

const PILOT = { id: 'aaaaaaaa-0000-4000-8000-000000000001', label: 'Utility Water' }
const OTHER = { id: 'bbbbbbbb-0000-4000-8000-000000000002', label: 'Potable Water' }

/** A zone from the contract's example, with the given fees. */
function zoneWith(fees: { category: { id: string; label: string }; fee: number }[], overrides: Record<string, unknown> = {}) {
  return {
    ...zonesSample.items[0],
    fallback_delivery_fees: fees.map((f) => ({ water_category: f.category, fee_minor_units: f.fee })),
    ...overrides,
  }
}

const zoneList = (items: unknown[], pilot: { id: string; label: string } | null = PILOT) => ({ items, pilot_water_category: pilot })

const zone = zonesSample.items[0]
const centre = { latitude: 6.4447, longitude: 7.5108 }
const unchanged = { name: zone.name, enabled: true, centre, fixed_fee_minor_units: null }
const ZONES_URL = 'http://api.test/api/v1/admin/service-zones'

describe('admin service area adapters (#74, #110, #111)', () => {
  it('listAreas maps every zone with its coordinates; the fee is the pilot category’s entry, nothing else', async () => {
    const withBoth = zoneWith([
      { category: OTHER, fee: 300_000 },
      { category: PILOT, fee: 450_000 },
    ])
    const onlyOther = zoneWith([{ category: OTHER, fee: 300_000 }], { id: 'z-2', name: 'New Haven', is_active: false, centre: { latitude: 6.4549, longitude: 7.5052 } })
    const noFees = zoneWith([], { id: 'z-3', name: 'GRA' })
    const { client, requests } = setup(zoneList([withBoth, onlyOther, noFees]))
    const areas = await listAreas(client)
    expect(requests()[0]).toMatchObject({ url: ZONES_URL, method: 'GET' })
    expect(areas).toEqual([
      { id: zone.id, name: 'Independence Layout', enabled: true, centre, fixed_fee_minor_units: 450_000 },
      { id: 'z-2', name: 'New Haven', enabled: false, centre: { latitude: 6.4549, longitude: 7.5052 }, fixed_fee_minor_units: null },
      { id: 'z-3', name: 'GRA', enabled: true, centre, fixed_fee_minor_units: null },
    ])
  })

  it('listAreas leaves every fee empty when the server names no pilot category', async () => {
    const { client } = setup(zoneList([zoneWith([{ category: PILOT, fee: 450_000 }])], null))
    expect((await listAreas(client)).map((a) => a.fixed_fee_minor_units)).toEqual([null])
  })

  it('listAreas reads the contract example', async () => {
    const { client } = setup(zonesSample)
    const areas = await listAreas(client)
    // The example’s pilot category is the one its first zone has a fee for.
    expect(areas.map((a) => a.fixed_fee_minor_units)).toEqual([300_000, null])
  })

  it('listAreas passes a 403 through', async () => {
    const error = await rejection(listAreas(setup(envelope('forbidden'), undefined, 403).client))
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })

  it('listAreas reports a list without the pilot field as an invalid response', async () => {
    const error = await rejection(listAreas(setup({ items: [] }).client))
    expect(error.code).toBe('invalid_response')
  })

  it('saveArea sends the name, the active flag and the coordinates when the fee is unchanged', async () => {
    const current = zoneWith([{ category: PILOT, fee: 450_000 }])
    const { client, writes } = setup(zoneList([current]), { body: { ...current, is_active: false } })
    const area = await saveArea(zone.id, { ...unchanged, enabled: false, fixed_fee_minor_units: 450_000 }, client)
    expect(writes()).toEqual([{ url: `${ZONES_URL}/${zone.id}`, method: 'PATCH', body: { name: zone.name, is_active: false, centre } }])
    expect(area).toMatchObject({ enabled: false, centre, fixed_fee_minor_units: 450_000 })
  })

  it('saveArea writes the pilot fee and keeps the other categories’ fees', async () => {
    const current = zoneWith([{ category: OTHER, fee: 300_000 }])
    const saved = zoneWith([
      { category: OTHER, fee: 300_000 },
      { category: PILOT, fee: 500_000 },
    ])
    const { client, writes } = setup(zoneList([current]), { body: saved })
    const area = await saveArea(zone.id, { ...unchanged, fixed_fee_minor_units: 500_000 }, client)
    expect(writes()[0].body).toEqual({
      name: zone.name,
      is_active: true,
      centre,
      fallback_delivery_fees: [
        { water_category_id: OTHER.id, fee_minor_units: 300_000 },
        { water_category_id: PILOT.id, fee_minor_units: 500_000 },
      ],
    })
    expect(area.fixed_fee_minor_units).toBe(500_000)
  })

  it('saveArea replaces an existing pilot fee instead of adding a second one', async () => {
    const current = zoneWith([
      { category: PILOT, fee: 450_000 },
      { category: OTHER, fee: 300_000 },
    ])
    const { client, writes } = setup(zoneList([current]), { body: current })
    await saveArea(zone.id, { ...unchanged, fixed_fee_minor_units: 600_000 }, client)
    expect(writes()[0].body.fallback_delivery_fees).toEqual([
      { water_category_id: OTHER.id, fee_minor_units: 300_000 },
      { water_category_id: PILOT.id, fee_minor_units: 600_000 },
    ])
  })

  it('saveArea clears the pilot fee and keeps the others when the fee is emptied', async () => {
    const current = zoneWith([
      { category: PILOT, fee: 450_000 },
      { category: OTHER, fee: 300_000 },
    ])
    const { client, writes } = setup(zoneList([current]), { body: zoneWith([{ category: OTHER, fee: 300_000 }]) })
    const area = await saveArea(zone.id, { ...unchanged, fixed_fee_minor_units: null }, client)
    expect(writes()[0].body.fallback_delivery_fees).toEqual([{ water_category_id: OTHER.id, fee_minor_units: 300_000 }])
    expect(area.fixed_fee_minor_units).toBeNull()
  })

  it('saveArea does not write a fee when the server names no pilot category', async () => {
    const { client, writes } = setup(zoneList([zoneWith([])], null))
    const error = await rejection(saveArea(zone.id, { ...unchanged, fixed_fee_minor_units: 450_000 }, client))
    expect(error.code).toBe('not_connected')
    expect(writes()).toEqual([])
  })

  it('saveArea still saves the name, flag and coordinates when there is no pilot category and the fee is untouched', async () => {
    const current = zoneWith([])
    const { client, writes } = setup(zoneList([current], null), { body: current })
    await saveArea(zone.id, unchanged, client)
    expect(writes()[0].body).toEqual({ name: zone.name, is_active: true, centre })
  })

  it('saveArea adds an area with a POST, trimming the name and sending no boundary or fees', async () => {
    const { client, writes } = setup(zoneList([]), { body: zoneWith([], { name: 'Abakpa Nike' }), status: 201 })
    const area = await saveArea(null, { ...unchanged, name: ' Abakpa Nike ' }, client)
    expect(writes()).toEqual([{ url: ZONES_URL, method: 'POST', body: { name: 'Abakpa Nike', is_active: true, centre } }])
    expect(area).toMatchObject({ id: zone.id, name: 'Abakpa Nike', centre, fixed_fee_minor_units: null })
  })

  it('saveArea adds an area with a fee as the pilot category’s entry', async () => {
    const { client, writes } = setup(zoneList([]), { body: zoneWith([{ category: PILOT, fee: 450_000 }]), status: 201 })
    const area = await saveArea(null, { ...unchanged, fixed_fee_minor_units: 450_000 }, client)
    expect(writes()).toEqual([
      { url: ZONES_URL, method: 'POST', body: { name: zone.name, is_active: true, centre, fallback_delivery_fees: [{ water_category_id: PILOT.id, fee_minor_units: 450_000 }] } },
    ])
    expect(area.fixed_fee_minor_units).toBe(450_000)
  })

  it('saveArea does not add an area with a fee when the server names no pilot category', async () => {
    const { client, writes } = setup(zoneList([], null))
    const error = await rejection(saveArea(null, { ...unchanged, fixed_fee_minor_units: 450_000 }, client))
    expect(error.code).toBe('not_connected')
    expect(writes()).toEqual([])
  })

  it('saveArea words a taken name as the screen does, when adding and when saving', async () => {
    for (const id of [null, zone.id]) {
      const { client } = setup(zoneList([zoneWith([])]), { body: nameTakenSample, status: 409 })
      const error = await rejection(saveArea(id, unchanged, client))
      expect([error.status, error.code, error.message]).toEqual([409, 'service_zone_name_taken', 'An area with this name already exists'])
    }
  })

  it('saveArea passes a 422 on adding through', async () => {
    const body = envelope('validation_error', [{ loc: ['body', 'centre', 'latitude'], msg: 'bad', type: 'value_error' }])
    const { client } = setup(zoneList([]), { body, status: 422 })
    const error = await rejection(saveArea(null, unchanged, client))
    expect([error.status, error.code]).toEqual([422, 'validation_error'])
  })

  it('saveArea passes a 404 from the server through', async () => {
    const { client } = setup(zoneList([zoneWith([])]), { body: envelope('service_zone_not_found'), status: 404 })
    const error = await rejection(saveArea(zone.id, unchanged, client))
    expect([error.status, error.code]).toEqual([404, 'service_zone_not_found'])
  })

  it('saveArea reports a zone that is not in the list as not found, without writing', async () => {
    const { client, writes } = setup(zoneList([zoneWith([], { id: 'other-zone' })]))
    const error = await rejection(saveArea(zone.id, unchanged, client))
    expect([error.status, error.code]).toEqual([404, 'service_zone_not_found'])
    expect(writes()).toEqual([])
  })
})
