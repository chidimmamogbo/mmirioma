import { describe, expect, it, vi } from 'vitest'
import defaultAddressError from '../../../../../docs/api/examples/error-default-address.json'
import profileSample from '../../../../../docs/api/examples/customer-profile.json'
import addressesSample from '../../../../../docs/api/examples/saved-addresses-page.json'
import { ApiError, createApiClient } from '../../../lib/api/client'
import type { AddressRead, CustomerProfileRead } from '../../../lib/api/customerAccount'
import type { Page } from '../../../lib/api/adminOrders'
import { addressFromRead, getProfile, listAddresses, profileFromRead, removeAddress, setDefaultAddress } from './account'

/** The agreed contract's examples (docs/api/customer-account.md). */
const PROFILE = profileSample as CustomerProfileRead
const ADDRESSES = addressesSample as Page<AddressRead>

function clientReturning(...responses: { body: unknown; status?: number }[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const { body, status = 200 } of responses) {
    const text = body === null ? '' : JSON.stringify(body)
    fetch.mockResolvedValueOnce(new Response(status === 204 ? null : text, { status, headers: { 'Content-Type': 'application/json' } }))
  }
  return { fetch, client: createApiClient({ baseUrl: 'http://api.test', fetch }) }
}

const NOT_SIGNED_IN = { error: { code: 'not_authenticated', message: 'Sign in', details: null } }
const ADDRESS_NOT_FOUND = { error: { code: 'address_not_found', message: 'Address not found', details: null } }

describe('profileFromRead', () => {
  it('keeps what the backend sends and leaves out email, photo, switches and points', () => {
    const profile = profileFromRead(PROFILE)
    expect(profile).toMatchObject({ name: 'Sample Customer', phone: '+2348000000001', phone_verified: true, customer_since: PROFILE.customer_since })
    expect(profile.stats).toEqual({ orders: 3, addresses: 2, points: null })
    expect(profile).not.toHaveProperty('email')
    expect(profile.photo_url).toBeNull()
    expect(profile.preferences).toBeNull()
  })
})

describe('addressFromRead', () => {
  it('keeps the area, including whether it is still served', () => {
    const [home] = ADDRESSES.items
    expect(addressFromRead(home)).toEqual({
      id: home.id,
      label: 'Home',
      address: '12 Sample Close, Independence Layout, Enugu',
      landmark: 'Opposite the blue gate',
      is_default: true,
      zone: { id: home.zone.id, name: 'Independence Layout', is_active: true },
    })
    expect(addressFromRead({ ...home, zone: { ...home.zone, is_active: false } }).zone?.is_active).toBe(false)
  })
})

describe('getProfile (real)', () => {
  it('loads and converts the profile', async () => {
    const { fetch, client } = clientReturning({ body: PROFILE })
    expect((await getProfile(client)).name).toBe('Sample Customer')
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/me/profile')
  })

  it('passes 401 not_authenticated through as an ApiError', async () => {
    const { client } = clientReturning({ body: NOT_SIGNED_IN, status: 401 })
    await expect(getProfile(client)).rejects.toMatchObject({ status: 401, code: 'not_authenticated' } satisfies Partial<ApiError>)
  })
})

describe('listAddresses (real)', () => {
  it('loads every page, default first as the server sends them', async () => {
    const [home, office] = ADDRESSES.items
    const { fetch, client } = clientReturning(
      { body: { items: [home], total: 2, limit: 100, offset: 0 } },
      { body: { items: [office], total: 2, limit: 100, offset: 1 } },
    )
    expect((await listAddresses(client)).map((a) => a.label)).toEqual(['Home', 'Office'])
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'http://api.test/api/v1/me/addresses?limit=100&offset=0',
      'http://api.test/api/v1/me/addresses?limit=100&offset=1',
    ])
  })

  it('returns no addresses for an empty list', async () => {
    const { client } = clientReturning({ body: { items: [], total: 0, limit: 100, offset: 0 } })
    expect(await listAddresses(client)).toEqual([])
  })

  it('passes 401 not_authenticated through as an ApiError', async () => {
    const { client } = clientReturning({ body: NOT_SIGNED_IN, status: 401 })
    await expect(listAddresses(client)).rejects.toMatchObject({ code: 'not_authenticated' } satisfies Partial<ApiError>)
  })
})

describe('setDefaultAddress (real)', () => {
  it('posts to the default route of that address', async () => {
    const { fetch, client } = clientReturning({ body: ADDRESSES.items[1] })
    await setDefaultAddress('7c3b1a2d-9e8f-4d6c-b5a4-3f2e1d0c9b8a', client)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/me/addresses/7c3b1a2d-9e8f-4d6c-b5a4-3f2e1d0c9b8a/default')
    expect(fetch.mock.calls[0][1]?.method).toBe('POST')
  })

  it('passes 404 address_not_found through', async () => {
    const { client } = clientReturning({ body: ADDRESS_NOT_FOUND, status: 404 })
    await expect(setDefaultAddress('nope', client)).rejects.toMatchObject({ status: 404, code: 'address_not_found' } satisfies Partial<ApiError>)
  })
})

describe('removeAddress (real)', () => {
  it('deletes the address and accepts the empty 204', async () => {
    const { fetch, client } = clientReturning({ body: null, status: 204 })
    await expect(removeAddress('7c3b1a2d', client)).resolves.toBeUndefined()
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/me/addresses/7c3b1a2d')
    expect(fetch.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('passes 409 default_address through (the contract example)', async () => {
    const { client } = clientReturning({ body: defaultAddressError, status: 409 })
    await expect(removeAddress('4e2a9c1b', client)).rejects.toMatchObject({ status: 409, code: 'default_address' } satisfies Partial<ApiError>)
  })
})
