/**
 * Typed API functions for the partner apps (Keke rider and tanker driver).
 * No partner contract exists yet: mock mode uses `src/mocks/partnerMock.ts`,
 * real-API mode fails with `not_connected` until the endpoints exist
 * (SRS §6 suggests `/driver/jobs/{id}/accept`, `/transition`, `/proof`).
 */
import type {
  DeclineReason,
  PartnerEarnings,
  PartnerIssueType,
  PartnerJob,
  PartnerNotification,
  PartnerProfile,
  PartnerSignupInput,
} from '../../domain/partner'
import type { Session } from '../../lib/api/auth'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import * as mock from '../../mocks/partnerMock'

type Pickup = { loaded: boolean; receipt: boolean; photo_url: string | null; gallons_loaded: number | null }

export const getPartnerProfile = (): Promise<PartnerProfile> => (USE_MOCKS ? mock.getPartnerProfile() : notConnected('Your partner account'))
export const updatePartnerProfile = (u: { email?: string | null; preferences?: Partial<PartnerProfile['preferences']> }): Promise<PartnerProfile> =>
  USE_MOCKS ? mock.updatePartnerProfile(u) : notConnected('Your partner account')
export const setOnline = (online: boolean): Promise<PartnerProfile> => (USE_MOCKS ? mock.setOnline(online) : notConnected('Going online'))
export const uploadDocument = (id: string, fileName: string): Promise<PartnerProfile> =>
  USE_MOCKS ? mock.uploadDocument(id, fileName) : notConnected('Document upload')
export const partnerSignup = (i: PartnerSignupInput): Promise<Session> => (USE_MOCKS ? mock.partnerSignup(i) : notConnected('Partner sign-up'))

export const listAvailableJobs = (): Promise<PartnerJob[]> => (USE_MOCKS ? mock.listAvailableJobs() : notConnected('Available orders'))
export const listMyActiveJobs = (): Promise<PartnerJob[]> => (USE_MOCKS ? mock.listMyActiveJobs() : notConnected('Your orders'))
export const getJob = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.getJob(ref) : notConnected('Order details'))
export const acceptJob = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.acceptJob(ref) : notConnected('Accepting orders'))
export const declineJob = (ref: string, reason: DeclineReason, note: string): Promise<void> =>
  USE_MOCKS ? mock.declineJob(ref, reason, note) : notConnected('Declining orders')
export const confirmPickup = (ref: string, p: Pickup): Promise<PartnerJob> => (USE_MOCKS ? mock.confirmPickup(ref, p) : notConnected('Pickup'))
export const verifyCode = (ref: string, code: string): Promise<PartnerJob> => (USE_MOCKS ? mock.verifyCode(ref, code) : notConnected('Delivery code'))
export const resendCode = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.resendCode(ref) : notConnected('Delivery code'))

export const getEarnings = (): Promise<PartnerEarnings> => (USE_MOCKS ? mock.getEarnings() : notConnected('Earnings'))
export const requestPayout = (amount: number): Promise<PartnerEarnings> => (USE_MOCKS ? mock.requestPayout(amount) : notConnected('Payouts'))
export const listHistory = (): Promise<PartnerJob[]> => (USE_MOCKS ? mock.listHistory() : notConnected('Order history'))
export const listPartnerNotifications = (): Promise<PartnerNotification[]> =>
  USE_MOCKS ? mock.listPartnerNotifications() : notConnected('Notifications')
export const markPartnerNotificationsRead = (): Promise<void> => (USE_MOCKS ? mock.markPartnerNotificationsRead() : notConnected('Notifications'))
export const reportIssue = (i: { type: PartnerIssueType; note: string; reference: string | null }): Promise<{ id: string }> =>
  USE_MOCKS ? mock.reportIssue(i) : notConnected('Reporting a problem')
