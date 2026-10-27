/**
 * Customer account adapters (#88, part 1): the real-API side of
 * `getProfile`, `listAddresses`, `setDefaultAddress` and `removeAddress` in
 * `customerApi.ts`, against the endpoints of #82 part 1.
 *
 * Conversions follow docs/api/customer-account.md ("Mapping to the design
 * types"). What the backend does not send is left out, never filled in.
 * `addAddress` and `updateAddress` came with the area picker (#121): the
 * backend saves an address only with an area (`zone_id`).
 */
import type { CustomerProfile, SavedAddress } from '../../../domain/orders'
import { apiClient, type ApiClient } from '../../../lib/api/client'
import {
  addAddress as postAddress,
  getProfile as fetchProfile,
  listAddresses as fetchAddresses,
  removeAddress as deleteAddress,
  setDefaultAddress as postDefaultAddress,
  updateAddress as patchAddress,
  type AddressInput as AddressBody,
  type AddressRead,
  type CustomerProfileRead,
} from '../../../lib/api/customerAccount'
import type { AddressInput } from '../../../mocks/customerMock'

/** Page size when loading every address: the contract's maximum (at most 20 exist). */
const PAGE_LIMIT = 100

/** Backend profile to the design's profile (customer-account.md, mapping table). */
export function profileFromRead(read: CustomerProfileRead): CustomerProfile {
  return {
    name: read.name,
    phone: read.phone,
    phone_verified: read.phone_verified,
    // `email` stays absent: the pilot offers none (decision 1).
    customer_since: read.customer_since,
    // Dropped for the pilot; the profile shows initials (decision 2).
    photo_url: null,
    // No message switches in the pilot (decision 3).
    preferences: null,
    // Points are out of the MVP (decision 12).
    stats: { orders: read.stats.orders, addresses: read.stats.addresses, points: null },
  }
}

/** Backend address to the design's saved address, keeping its area. */
export function addressFromRead(read: AddressRead): SavedAddress {
  return {
    id: read.id,
    label: read.label,
    address: read.address,
    landmark: read.landmark,
    is_default: read.is_default,
    zone: { id: read.zone.id, name: read.zone.name, is_active: read.zone.is_active },
  }
}

/**
 * The signed-in customer's profile.
 *
 * @throws {ApiError} The backend's errors unchanged (401 `not_authenticated`).
 */
export async function getProfile(client: ApiClient = apiClient): Promise<CustomerProfile> {
  return profileFromRead(await fetchProfile(undefined, client))
}

/** Every saved address, default first, across all pages. */
export async function listAddresses(client: ApiClient = apiClient): Promise<SavedAddress[]> {
  const addresses: AddressRead[] = []
  for (;;) {
    const page = await fetchAddresses({ limit: PAGE_LIMIT, offset: addresses.length }, undefined, client)
    addresses.push(...page.items)
    if (page.items.length === 0 || addresses.length >= page.total) break
  }
  return addresses.map(addressFromRead)
}

/** The form's address to the `POST`/`PATCH /me/addresses` body. */
export function addressBodyFromInput(input: AddressInput): AddressBody {
  return { label: input.label, address: input.address, landmark: input.landmark, zone_id: input.zone_id, make_default: input.make_default }
}

/**
 * Save a new address with its area.
 *
 * @throws {ApiError} 404 `service_zone_not_found`, 409 `address_limit_reached`, 422 `validation_error`.
 */
export async function addAddress(input: AddressInput, client: ApiClient = apiClient): Promise<SavedAddress> {
  return addressFromRead(await postAddress(addressBodyFromInput(input), client))
}

/**
 * Change a saved address, its area included.
 *
 * @throws {ApiError} 404 `address_not_found` or `service_zone_not_found`, 422 `validation_error`.
 */
export async function updateAddress(id: string, input: AddressInput, client: ApiClient = apiClient): Promise<SavedAddress> {
  return addressFromRead(await patchAddress(id, addressBodyFromInput(input), client))
}

/**
 * Make an address the default.
 *
 * @throws {ApiError} 404 `address_not_found`.
 */
export async function setDefaultAddress(id: string, client: ApiClient = apiClient): Promise<void> {
  await postDefaultAddress(id, client)
}

/**
 * Remove a saved address.
 *
 * @throws {ApiError} 404 `address_not_found`; 409 `default_address` for the
 *   default while other addresses exist.
 */
export async function removeAddress(id: string, client: ApiClient = apiClient): Promise<void> {
  await deleteAddress(id, client)
}
