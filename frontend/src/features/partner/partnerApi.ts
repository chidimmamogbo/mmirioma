/**
 * Typed API functions for the partner apps (Keke rider and tanker driver).
 * Mock mode uses `src/mocks/partnerMock.ts`. In real-API mode the account
 * functions (sign-up, profile, going online, notifications) call
 * docs/api/partners.md through `real/account.ts` (#67), and the job lists,
 * one job, accept and decline (#12), the trip steps and problem reports
 * (#13) call docs/api/deliveries.md through `real/jobs.ts`. Earnings,
 * payouts and document upload fail with `not_connected` until they are
 * linked.
 */
import type {
  DeclineReason,
  PartnerEarnings,
  PartnerIssueType,
  PartnerJob,
  PartnerNotificationList,
  PartnerProfile,
  PartnerSignupInput,
} from '../../domain/partner'
import type { Session } from '../../lib/api/auth'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import * as mock from '../../mocks/partnerMock'
import * as real from './real/account'
import * as realJobs from './real/jobs'

type Pickup = { loaded: boolean; receipt: boolean; photo_url: string | null; gallons_loaded: number | null }

export const getPartnerProfile = (): Promise<PartnerProfile> => (USE_MOCKS ? mock.getPartnerProfile() : real.getPartnerProfile())
export const updatePartnerProfile = (u: { preferences?: Partial<PartnerProfile['preferences']> }): Promise<PartnerProfile> =>
  USE_MOCKS ? mock.updatePartnerProfile(u) : real.updatePartnerProfile(u)
export const setOnline = (online: boolean): Promise<PartnerProfile> => (USE_MOCKS ? mock.setOnline(online) : real.setOnline(online))
export const uploadDocument = (id: string, fileName: string): Promise<PartnerProfile> =>
  USE_MOCKS ? mock.uploadDocument(id, fileName) : notConnected('Document upload')
export const partnerSignup = (i: PartnerSignupInput): Promise<Session> => (USE_MOCKS ? mock.partnerSignup(i) : real.partnerSignup(i))

export const listAvailableJobs = (): Promise<PartnerJob[]> => (USE_MOCKS ? mock.listAvailableJobs() : realJobs.listAvailableJobs())
export const listMyActiveJobs = (): Promise<PartnerJob[]> => (USE_MOCKS ? mock.listMyActiveJobs() : realJobs.listMyActiveJobs())
export const getJob = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.getJob(ref) : realJobs.getJob(ref))
export const acceptJob = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.acceptJob(ref) : realJobs.acceptJob(ref))
export const declineJob = (ref: string, reason: DeclineReason, note: string): Promise<void> =>
  USE_MOCKS ? mock.declineJob(ref, reason, note) : realJobs.declineJob(ref, reason, note)
export const confirmPickup = (ref: string, p: Pickup): Promise<PartnerJob> => (USE_MOCKS ? mock.confirmPickup(ref, p) : realJobs.confirmPickup(ref, p))
export const completeUnloading = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.completeUnloading(ref) : realJobs.completeUnloading(ref))
export const verifyCode =(ref: string, code: string): Promise<PartnerJob> => (USE_MOCKS ? mock.verifyCode(ref, code) : realJobs.verifyCode(ref, code))
export const resendCode = (ref: string): Promise<PartnerJob> => (USE_MOCKS ? mock.resendCode(ref) : realJobs.resendCode(ref))

export const getEarnings = (): Promise<PartnerEarnings> => (USE_MOCKS ? mock.getEarnings() : notConnected('Earnings'))
export const requestPayout = (amount: number): Promise<PartnerEarnings> => (USE_MOCKS ? mock.requestPayout(amount) : notConnected('Payouts'))
export const listHistory = (): Promise<PartnerJob[]> => (USE_MOCKS ? mock.listHistory() : realJobs.listHistory())
/** The mock has no pages, so counting its unread items gives the true count. */
export const listPartnerNotifications = (): Promise<PartnerNotificationList> =>
  USE_MOCKS
    ? mock.listPartnerNotifications().then((items) => ({ items, unread_count: items.filter((n) => !n.read).length }))
    : real.listPartnerNotifications()
export const markPartnerNotificationsRead = (): Promise<void> => (USE_MOCKS ? mock.markPartnerNotificationsRead() : real.markPartnerNotificationsRead())
export const reportIssue = (i: { type: PartnerIssueType; note: string; reference: string | null }): Promise<{ id: string }> =>
  USE_MOCKS ? mock.reportIssue(i) : realJobs.reportIssue(i)
