/**
 * Query hooks for the hold review sheet (#166). They go through the admin API
 * switch (`adminApi.ts`), so mock mode shows the seeded holds and real-API mode
 * calls the agreed endpoints.
 */
import { useQuery } from '@tanstack/react-query'
import * as api from '../adminApi'
import { adminKeys, useAdminMutation } from '../queries'
import type { ProofOverrideRequest } from '../real/holds'

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
