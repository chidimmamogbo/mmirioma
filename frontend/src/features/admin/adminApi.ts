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
import type { ServiceArea } from '../../domain/admin'
import type { CorrectionRequest, ReceiveRequest, ReconcileRequest } from '../../lib/api/adminCash'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import * as cashMock from '../../mocks/adminCashMock'
import * as mock from '../../mocks/adminMock'
import * as areas from './real/areas'
import * as cash from './real/cash'

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
// Service areas (#74): linked to the agreed service zones; see real/areas.ts for what is not connected yet.
export const listAreas = (): Promise<ServiceArea[]> => (USE_MOCKS ? mock.listAreas() : areas.listAreas())
export const saveArea = (id: string | null, input: Omit<ServiceArea, 'id'>): Promise<ServiceArea> =>
  USE_MOCKS ? mock.saveArea(id, input) : areas.saveArea(id, input)

export const listPriceLists = api('Pricing', mock.listPriceLists)
export const savePriceList = api('Pricing', mock.savePriceList)

export const listPayments = api('Payments', mock.listPayments)
export const confirmPayment = api('Payments', mock.confirmPayment)
export const refundAsPoints = api('Payments', mock.refundAsPoints)

/*
 * Cash (K3 to K5, docs/design/admin-cash.md, #19): linked to the agreed
 * payments contract. The screens use the contract's types as they are (no
 * older design type exists for them). The Payments page above stays on its
 * mocks: the backend has no per-order "mark paid" (BR-07).
 */
export type {
  AdminCashCollection,
  CashDay,
  CashDriverRow,
  CorrectionRequest,
  DriverCash,
  PilotPaymentStatus,
  ReceiveRequest,
  ReconcileRequest,
  Remittance,
} from '../../lib/api/adminCash'
/** Mock mode shows sample cash, tagged SAMPLE DATA on the cash screens (design decision 5). */
export const CASH_IS_SAMPLE = USE_MOCKS
export const getCashDay = (date: string) => (USE_MOCKS ? cashMock.getCashDay(date) : cash.getCashDay(date))
export const getDriverCash = (driverId: string) => (USE_MOCKS ? cashMock.getDriverCash(driverId) : cash.getDriverCash(driverId))
export const correctCashCollection = (collectionId: string, request: CorrectionRequest) =>
  USE_MOCKS ? cashMock.correctCollection(collectionId, request) : cash.correctCollection(collectionId, request)
export const receiveCash = (request: ReceiveRequest) => (USE_MOCKS ? cashMock.receiveCash(request) : cash.receiveCash(request))
export const reconcileCash = (request: ReconcileRequest) =>
  USE_MOCKS ? cashMock.reconcileCollections(request) : cash.reconcileCollections(request)
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
