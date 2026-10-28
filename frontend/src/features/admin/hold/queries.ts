/**
 * Query hooks for the hold review sheet (#166). They go through the admin API
 * switch (`adminApi.ts`), so mock mode shows the seeded holds and real-API mode
 * calls the agreed endpoints.
 */
import { useQuery } from '@tanstack/react-query'
import * as api from '../adminApi'
import { adminKeys, useAdminMutation } from '../queries'
import type { AdminTransitionRequest, HoldDecisionRequest, ProofOverrideRequest, WithdrawRequest } from '../real/holds'

const holdKeys = {
  review: (reference: string) => [...adminKeys.all, 'hold', reference] as const,
}

/**
 * The evidence for the order's open hold, read again each time the sheet
 * opens. Not retried: a 404 `hold_not_found` ("This order has no open hold")
 * is an answer, not a failure.
 */
export const useHoldReview = (reference: string) =>
  useQuery({ queryKey: holdKeys.review(reference), queryFn: () => api.getHoldReview(reference), retry: false, staleTime: 0, gcTime: 0 })

/** Approve or reject the alternative proof: one request, never repeated on its own. Every admin query refreshes after it. */
export const useDecideProof = (reference: string) => useAdminMutation((request: ProofOverrideRequest) => api.decideProof(reference, request))

/** Let the driver continue after a source review (R2). */
export const useContinueSource = (reference: string) => useAdminMutation((request: HoldDecisionRequest) => api.continueSource(reference, request))

/** Resume after an unsafe stop, with the safe alternative as the note (R3). */
export const useResumeUnsafe = (reference: string) => useAdminMutation((request: HoldDecisionRequest) => api.resumeUnsafe(reference, request))

/**
 * What cancelling would cost the customer: the server's sentence, read each
 * time the CANCEL dialog opens. Not retried: a 409 ("can no longer be
 * cancelled") is an answer; Try again is the dispatcher's.
 */
export const useCancellationOutcome = (reference: string, open: boolean) =>
  useQuery({ queryKey: [...adminKeys.all, 'cancellation-outcome', reference] as const, queryFn: () => api.getCancellationOutcome(reference), enabled: open, retry: false, staleTime: 0, gcTime: 0 })

/** Fail the delivery or cancel the order (FAIL, CANCEL): one request, never repeated on its own. Every admin query refreshes after it. */
export const useTransitionOrder = (reference: string) => useAdminMutation((request: AdminTransitionRequest) => api.transitionOrder(reference, request))

/** Take the job back from the driver before they leave (R3). */
export const useWithdrawJob = (reference: string) => useAdminMutation((request: WithdrawRequest) => api.withdrawJob(reference, request))
