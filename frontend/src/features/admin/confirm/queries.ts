/**
 * Query hooks for confirming an order (#136). Kept with the confirm screens
 * so they do not touch the shared admin API switch: they call the typed
 * clients directly, in real-API mode only. The mock places orders straight to
 * "Awaiting rider", so no mock order is ever confirmed and nothing here runs
 * in mock mode.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmOrder, getConfirmationOptions, type ConfirmRequest } from '../../../lib/api/adminConfirmation'
import { getAdminOrderDetail } from '../../../lib/api/adminDispatch'
import { USE_MOCKS } from '../../../lib/api/mode'
import { adminKeys } from '../queries'

const confirmKeys = {
  detail: (reference: string) => [...adminKeys.all, 'confirm', 'detail', reference] as const,
  options: (reference: string) => [...adminKeys.all, 'confirm', 'options', reference] as const,
}

/** The order with its quote, checks and confirmation fields. */
export const useConfirmDetail = (reference: string) =>
  useQuery({ queryKey: confirmKeys.detail(reference), queryFn: ({ signal }) => getAdminOrderDetail(reference, signal), enabled: !USE_MOCKS })

/** Categories and sources, fetched again each time the sheet opens (upstream C1). */
export const useConfirmationOptions = (reference: string, open: boolean) =>
  useQuery({
    queryKey: confirmKeys.options(reference),
    queryFn: ({ signal }) => getConfirmationOptions(reference, signal),
    enabled: open && !USE_MOCKS,
    staleTime: 0,
  })

/**
 * Confirm the order: one request, never retried on its own (a repeat of a
 * confirmation that succeeded is 409, never a second SMS). Every admin query
 * refreshes after it.
 */
export function useConfirmOrder(reference: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: ConfirmRequest) => confirmOrder(reference, request),
    retry: false,
    // Not awaited: the refresh unmounts the sheet, and the caller's onSuccess
    // (the toast) must run first.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

/** Reload the sources after a refusal ("The source list has been refreshed"). */
export function useRefreshOptions(reference: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: confirmKeys.options(reference) })
}
