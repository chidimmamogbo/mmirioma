/** TanStack Query hooks for the partner apps. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DeclineReason, PartnerIssueType } from '../../domain/partner'
import * as api from './partnerApi'

export const partnerKeys = {
  all: ['partner'] as const,
  profile: ['partner', 'profile'] as const,
  available: ['partner', 'available'] as const,
  active: ['partner', 'active'] as const,
  job: (ref: string) => ['partner', 'job', ref] as const,
  earnings: ['partner', 'earnings'] as const,
  history: ['partner', 'history'] as const,
  notifications: ['partner', 'notifications'] as const,
  cash: ['partner', 'cash'] as const,
}

export const usePartnerProfile = () => useQuery({ queryKey: partnerKeys.profile, queryFn: api.getPartnerProfile })
/** `enabled` false skips the request (the home screens while partner pay is out of the MVP, #157). */
export const useEarnings = (enabled = true) => useQuery({ queryKey: partnerKeys.earnings, queryFn: api.getEarnings, enabled })
export const useHistory = (enabled = true) => useQuery({ queryKey: partnerKeys.history, queryFn: api.listHistory, enabled })
export const usePartnerNotifications = () => useQuery({ queryKey: partnerKeys.notifications, queryFn: api.listPartnerNotifications })

/**
 * The open pool. Refreshes every 30 seconds while the screen is open, so new
 * orders appear without a push channel (no countdown, no live claim).
 */
export const useAvailableJobs = () =>
  useQuery({ queryKey: partnerKeys.available, queryFn: api.listAvailableJobs, refetchInterval: 30_000 })

/** Jobs assigned to or accepted by me. Refreshes so an admin assignment shows up. */
export const useActiveJobs = () => useQuery({ queryKey: partnerKeys.active, queryFn: api.listMyActiveJobs, refetchInterval: 30_000 })

/** The partner's cash (K2). `enabled` false skips the request. */
export const useMyCash = (enabled = true) => useQuery({ queryKey: partnerKeys.cash, queryFn: api.getMyCash, enabled })

export const useJob = (ref: string) => useQuery({ queryKey: partnerKeys.job(ref), queryFn: () => api.getJob(ref), enabled: Boolean(ref) })

/** Any job change can move work between lists, so refresh everything partner-side. */
function useRefreshAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: partnerKeys.all })
}

export function useSetOnline() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: api.setOnline, onSuccess: refresh })
}

export function useUpdatePartnerProfile() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: api.updatePartnerProfile, onSuccess: refresh })
}

export function useUploadDocument() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: ({ id, fileName }: { id: string; fileName: string }) => api.uploadDocument(id, fileName), onSuccess: refresh })
}

export function useAcceptJob() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: api.acceptJob, onSettled: refresh })
}

export function useDeclineJob() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: ({ ref, reason, note }: { ref: string; reason: DeclineReason; note: string }) => api.declineJob(ref, reason, note),
    onSuccess: refresh,
  })
}

export function useConfirmPickup(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (p: { loaded: boolean; receipt: boolean; photo_url: string | null; gallons_loaded: number | null }) => api.confirmPickup(ref, p),
    onSuccess: refresh,
  })
}

export function useCompleteUnloading(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => api.completeUnloading(ref), onSuccess: refresh })
}

/** "I have arrived" (U1, FR-038). Refreshes on failure too: a 409 means the job is no longer at this step. */
export function useArriveAtCustomer(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => api.arriveAtCustomer(ref), onSettled: refresh })
}

/** "Start unloading" (U2). Refreshes on failure too, as for arrival. */
export function useStartUnloading(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => api.startUnloading(ref), onSettled: refresh })
}

/** "I tried to reach the customer" (U3): one more recorded attempt. Refreshes on failure too. */
export function useRecordContactAttempt(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => api.recordContactAttempt(ref), onSettled: refresh })
}

/**
 * "Fail the delivery" (U3-S): ends the job as "customer not reachable". Refreshes on failure too: a refused end
 * (`transition_requirements_unmet`) means the screen's attempts or wait were stale.
 */
export function useFailUnreachable(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => api.failUnreachable(ref), onSettled: refresh })
}

export function useVerifyCode(ref: string) {
  const refresh = useRefreshAll()
  // Refresh on failure too: a wrong code changes the tries left.
  return useMutation({ mutationFn: (code: string) => api.verifyCode(ref, code), onSettled: refresh })
}

export function useResendCode(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: () => api.resendCode(ref), onSuccess: refresh })
}

export function useRequestPayout() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: api.requestPayout, onSuccess: refresh })
}

export function useMarkPartnerNotificationsRead() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: api.markPartnerNotificationsRead, onSuccess: refresh })
}

export function useReportIssue() {
  return useMutation({ mutationFn: (i: { type: PartnerIssueType; note: string; reference: string | null }) => api.reportIssue(i) })
}

/** Record the cash for a delivered job (K1). Refreshes the job's card and My cash. */
export function useRecordCash(ref: string) {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: (request: api.RecordCashRequest) => api.recordCash(ref, request), onSuccess: refresh })
}

/** Mark records ready to hand over (K2). Refreshes on failure too: a 409 means the list changed. */
export function useHandOverCash() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: api.handOverCash, onSettled: refresh })
}
