/**
 * Typed customer API functions used by the customer screens.
 *
 * In mock mode they use `src/mocks/customerMock.ts`. In real-API mode the
 * linked ones call an adapter from `./real/`, which calls `src/lib/api/` and
 * converts with docs/architecture/api-mapping.md; the rest fail with
 * `not_connected` until their backend exists. Linked so far: `createOrder`,
 * `listOrders`, `getOrder` (#9); `getProfile`, `listAddresses`,
 * `setDefaultAddress`, `removeAddress` (#88); `listServiceZones`,
 * `getQuote`, `addAddress`, `updateAddress` (#121).
 */
import type {
  CustomerNotificationList,
  CustomerOrder,
  CustomerProfile,
  PointsSummary,
  ProblemType,
  SavedAddress,
  SupportTicket,
} from '../../domain/orders'
import type { AreaOption, PriceQuote, PriceRequest } from './order/livePrice'
import * as realQuote from './real/quote'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
// Linked in #88 part 4: listTickets, createTicket, requestAccountDeletion.
import * as realSupport from './real/support'
import * as mock from '../../mocks/customerMock'
import * as realAccount from './real/account'
import * as realOrder from './real/order'
// Linked in #88 part 2: listNotifications, markNotificationsRead.
import * as realNotifications from './real/notifications'

export type { AddressInput, CreateOrderInput, ProfileUpdate } from '../../mocks/customerMock'

export const getProfile = (): Promise<CustomerProfile> => (USE_MOCKS ? mock.getProfile() : realAccount.getProfile())
export const updateProfile = (u: mock.ProfileUpdate): Promise<CustomerProfile> =>
  USE_MOCKS ? mock.updateProfile(u) : notConnected('Your profile')

export const listAddresses = (): Promise<SavedAddress[]> => (USE_MOCKS ? mock.listAddresses() : realAccount.listAddresses())
// Linked in #121, with the area picker: an address is saved only with an area.
export const addAddress = (i: mock.AddressInput): Promise<SavedAddress> => (USE_MOCKS ? mock.addAddress(i) : realAccount.addAddress(i))
export const updateAddress = (id: string, i: mock.AddressInput): Promise<SavedAddress> =>
  USE_MOCKS ? mock.updateAddress(id, i) : realAccount.updateAddress(id, i)
export const setDefaultAddress = (id: string): Promise<void> => (USE_MOCKS ? mock.setDefaultAddress(id) : realAccount.setDefaultAddress(id))
export const removeAddress = (id: string): Promise<void> => (USE_MOCKS ? mock.removeAddress(id) : realAccount.removeAddress(id))

// Live prices, linked in #121 (docs/design/customer-live-prices.md).
export const listServiceZones = (): Promise<AreaOption[]> => (USE_MOCKS ? mock.listServiceZones() : realQuote.listServiceZones())
export const getQuote = (request: PriceRequest): Promise<PriceQuote> => (USE_MOCKS ? mock.getPrice(request) : realQuote.getQuote(request))
export const createOrder = (i: mock.CreateOrderInput): Promise<CustomerOrder> => (USE_MOCKS ? mock.createOrder(i) : realOrder.createOrder(i))
export const listOrders = (): Promise<CustomerOrder[]> => (USE_MOCKS ? mock.listOrders() : realOrder.listOrders())
export const getOrder = (reference: string): Promise<CustomerOrder> => (USE_MOCKS ? mock.getOrder(reference) : realOrder.getOrder(reference))
// Linked in #88 part 3.
export const submitFeedback = (reference: string, f: { rating: number; poured_by_partner: boolean }): Promise<CustomerOrder> =>
  USE_MOCKS ? mock.submitFeedback(reference, f) : realOrder.submitFeedback(reference, f)

/** Demo-only stage change; exists only in mock mode. */
export const demoAdvanceOrder = (reference: string, to: 'delivered' | 'next' = 'next'): Promise<CustomerOrder> =>
  USE_MOCKS ? mock.demoAdvanceOrder(reference, to) : notConnected('Demo controls')

/** The mock has no pages, so counting its unread items gives the true count. */
export const listNotifications = (): Promise<CustomerNotificationList> =>
  USE_MOCKS
    ? mock.listNotifications().then((items) => ({ items, unread_count: items.filter((n) => !n.read).length }))
    : realNotifications.listNotifications()
export const markNotificationsRead = (ids?: string[]): Promise<void> =>
  USE_MOCKS ? mock.markNotificationsRead(ids) : realNotifications.markNotificationsRead(ids)

export const getPoints = (): Promise<PointsSummary> => (USE_MOCKS ? mock.getPoints() : notConnected('Points'))

// Linked in #88 part 4.
export const listTickets = (): Promise<SupportTicket[]> => (USE_MOCKS ? mock.listTickets() : realSupport.listTickets())
export const createTicket = (i: { type: ProblemType; message: string; reference: string | null }): Promise<SupportTicket> =>
  USE_MOCKS ? mock.createTicket(i) : realSupport.createTicket(i)
export const requestAccountDeletion = (reason: string): Promise<SupportTicket> =>
  USE_MOCKS ? mock.requestAccountDeletion(reason) : realSupport.requestAccountDeletion(reason)
