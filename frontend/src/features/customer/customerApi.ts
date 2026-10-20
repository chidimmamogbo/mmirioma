/**
 * Typed customer API functions used by the customer screens.
 *
 * None of these endpoints has an agreed contract yet (the Sprint 1 orders
 * contract has no delivery type, price, address book, points or support).
 * In mock mode they use `src/mocks/customerMock.ts`; in real-API mode they
 * fail with `not_connected` until the backend exists. When an endpoint is
 * added, replace its `notConnected(...)` with a `apiClient.request` call here;
 * screens do not change.
 */
import type {
  CustomerNotification,
  CustomerOrder,
  CustomerProfile,
  PointsSummary,
  ProblemType,
  Quote,
  SavedAddress,
  SupportTicket,
  WaterChoice,
} from '../../domain/orders'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import * as mock from '../../mocks/customerMock'

export type { AddressInput, CreateOrderInput, ProfileUpdate } from '../../mocks/customerMock'

export const getProfile = (): Promise<CustomerProfile> => (USE_MOCKS ? mock.getProfile() : notConnected('Your profile'))
export const updateProfile = (u: mock.ProfileUpdate): Promise<CustomerProfile> =>
  USE_MOCKS ? mock.updateProfile(u) : notConnected('Your profile')

export const listAddresses = (): Promise<SavedAddress[]> => (USE_MOCKS ? mock.listAddresses() : notConnected('Saved addresses'))
export const addAddress = (i: mock.AddressInput): Promise<SavedAddress> => (USE_MOCKS ? mock.addAddress(i) : notConnected('Saved addresses'))
export const updateAddress = (id: string, i: mock.AddressInput): Promise<SavedAddress> =>
  USE_MOCKS ? mock.updateAddress(id, i) : notConnected('Saved addresses')
export const setDefaultAddress = (id: string): Promise<void> => (USE_MOCKS ? mock.setDefaultAddress(id) : notConnected('Saved addresses'))
export const removeAddress = (id: string): Promise<void> => (USE_MOCKS ? mock.removeAddress(id) : notConnected('Saved addresses'))

export const getQuote = (choice: WaterChoice, address: string | null): Promise<Quote> =>
  USE_MOCKS ? mock.getQuote(choice, address) : notConnected('Prices')
export const createOrder = (i: mock.CreateOrderInput): Promise<CustomerOrder> => (USE_MOCKS ? mock.createOrder(i) : notConnected('Ordering'))
export const listOrders = (): Promise<CustomerOrder[]> => (USE_MOCKS ? mock.listOrders() : notConnected('Your orders'))
export const getOrder = (reference: string): Promise<CustomerOrder> => (USE_MOCKS ? mock.getOrder(reference) : notConnected('Your orders'))
export const submitFeedback = (reference: string, f: { rating: number; poured_by_partner: boolean }): Promise<CustomerOrder> =>
  USE_MOCKS ? mock.submitFeedback(reference, f) : notConnected('Feedback')

/** Demo-only stage change; exists only in mock mode. */
export const demoAdvanceOrder = (reference: string, to: 'delivered' | 'next' = 'next'): Promise<CustomerOrder> =>
  USE_MOCKS ? mock.demoAdvanceOrder(reference, to) : notConnected('Demo controls')

export const listNotifications = (): Promise<CustomerNotification[]> =>
  USE_MOCKS ? mock.listNotifications() : notConnected('Notifications')
export const markNotificationsRead = (ids?: string[]): Promise<void> =>
  USE_MOCKS ? mock.markNotificationsRead(ids) : notConnected('Notifications')

export const getPoints = (): Promise<PointsSummary> => (USE_MOCKS ? mock.getPoints() : notConnected('Points'))

export const listTickets = (): Promise<SupportTicket[]> => (USE_MOCKS ? mock.listTickets() : notConnected('Support'))
export const createTicket = (i: { type: ProblemType; message: string; reference: string | null }): Promise<SupportTicket> =>
  USE_MOCKS ? mock.createTicket(i) : notConnected('Support')
export const requestAccountDeletion = (reason: string): Promise<SupportTicket> =>
  USE_MOCKS ? mock.requestAccountDeletion(reason) : notConnected('Account deletion')
