/**
 * Typed admin API functions used by the admin pages.
 *
 * The Sprint 1 orders contract (docs/api/orders.md) has an admin order list
 * and detail, but in a different shape (litres, no delivery type, price or
 * rider); everything else on these pages has no contract yet. In mock mode
 * the functions use `src/mocks/adminMock.ts`; in real-API mode they fail with
 * `not_connected` until the endpoints exist. Switching one is a change here
 * only; pages do not change.
 */
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import * as mock from '../../mocks/adminMock'

export type { AdminShellData, ApprovalAction, LiveMapData, OrderList, PaymentFilter, RiderFilter } from '../../mocks/adminMock'

/** Wrap a mock so real-API mode reports the feature as not connected yet. */
function api<A extends unknown[], R>(feature: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => (USE_MOCKS ? fn(...args) : notConnected(feature))
}

export const getShellData = api('Admin', mock.getShellData)
export const getDashboard = api('Dashboard', mock.getDashboard)
export const getLiveMap = api('Live map', mock.getLiveMap)
export const listActivity = api('Activity', mock.listActivity)

export const listOrders = api('Orders', mock.listOrders)
export const getOrder = api('Orders', mock.getOrder)
export const listEligibleRiders = api('Rider assignment', mock.listEligibleRiders)
export const assignOrder = api('Rider assignment', mock.assignOrder)
export const cancelOrder = api('Orders', mock.cancelOrder)
export const createOrderForCustomer = api('Orders', mock.createOrderForCustomer)
export const quoteForAdmin = api('Prices', mock.quoteForAdmin)

export const listCustomers = api('Customers', mock.listCustomers)
export const getCustomer = api('Customers', mock.getCustomer)
export const createCustomer = api('Customers', mock.createCustomer)
export const addCustomerAddress = api('Customers', mock.addCustomerAddress)
export const verifyCustomerPhone = api('Customers', mock.verifyCustomerPhone)
export const adjustPoints = api('Loyalty points', mock.adjustPoints)

export const listRiders = api('Riders', mock.listRiders)
export const getRider = api('Riders', mock.getRider)
export const setRiderApproval = api('Riders', mock.setRiderApproval)
export const addRider = api('Riders', mock.addRider)

export const listStations = api('Refill stations', mock.listStations)
export const setStationOpen = api('Refill stations', mock.setStationOpen)
export const saveStation = api('Refill stations', mock.saveStation)
export const uploadStationPapers = api('Refill stations', mock.uploadStationPapers)
export const listAreas = api('Service areas', mock.listAreas)
export const saveArea = api('Service areas', mock.saveArea)

export const listPriceLists = api('Pricing', mock.listPriceLists)
export const savePriceList = api('Pricing', mock.savePriceList)

export const listPayments = api('Payments', mock.listPayments)
export const confirmPayment = api('Payments', mock.confirmPayment)
export const refundAsPoints = api('Payments', mock.refundAsPoints)
export const listPayouts = api('Rider earnings', mock.listPayouts)
export const markPayoutPaid = api('Rider earnings', mock.markPayoutPaid)

export const getReport = api('Reports', mock.getReport)

export const listIssues = api('Support', mock.listIssues)
export const getIssuePeople = api('Support', mock.getIssuePeople)
export const resolveIssue = api('Support', mock.resolveIssue)

export const listAudit = api('Audit log', mock.listAudit)
export const listAdminNotifications = api('Notifications', mock.listAdminNotifications)
export const markAdminNotificationsRead = api('Notifications', mock.markAdminNotificationsRead)
export const getSettings = api('Settings', mock.getSettings)
export const saveSettings = api('Settings', mock.saveSettings)
export const getAdminAccount = api('Account', mock.getAdminAccount)
