/**
 * TanStack Query hooks for the customer app. Screens use these, never the API
 * functions directly, so caching and refresh after changes live in one place.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProblemType, WaterChoice } from '../../domain/orders'
import * as api from './customerApi'

export const customerKeys = {
  profile: ['customer', 'profile'] as const,
  addresses: ['customer', 'addresses'] as const,
  orders: ['customer', 'orders'] as const,
  order: (reference: string) => ['customer', 'orders', reference] as const,
  quote: (choice: WaterChoice | null, address: string | null) => ['customer', 'quote', choice, address] as const,
  notifications: ['customer', 'notifications'] as const,
  points: ['customer', 'points'] as const,
  tickets: ['customer', 'tickets'] as const,
}

export const useProfile = () => useQuery({ queryKey: customerKeys.profile, queryFn: api.getProfile })
export const useAddresses = () => useQuery({ queryKey: customerKeys.addresses, queryFn: api.listAddresses })
export const useOrders = () => useQuery({ queryKey: customerKeys.orders, queryFn: api.listOrders })
export const useNotifications = () => useQuery({ queryKey: customerKeys.notifications, queryFn: api.listNotifications })
export const usePoints = () => useQuery({ queryKey: customerKeys.points, queryFn: api.getPoints })
export const useTickets = () => useQuery({ queryKey: customerKeys.tickets, queryFn: api.listTickets })

/**
 * One order. Active orders refresh every 20 seconds so the tracking screen
 * follows stage changes; there is no live push channel (no false real-time
 * claim, PRD §9).
 */
export function useOrder(reference: string | undefined) {
  return useQuery({
    queryKey: customerKeys.order(reference ?? ''),
    queryFn: () => api.getOrder(reference!),
    enabled: Boolean(reference),
    refetchInterval: (q) => {
      const stage = q.state.data?.stage
      return stage && stage !== 'delivered' && stage !== 'cancelled' ? 20_000 : false
    },
  })
}

/**
 * Server price for a choice. `address` null prices the water only; with an
 * address the delivery fee is included (it depends on the area, decision
 * 10a). Keeps the previous price on screen while a new one loads, so the
 * summary does not flash empty on every tap.
 */
export function useQuote(choice: WaterChoice | null, address: string | null) {
  return useQuery({
    queryKey: customerKeys.quote(choice, address),
    queryFn: () => api.getQuote(choice!, address),
    enabled: choice !== null,
    placeholderData: keepPreviousData,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

export function useUpdateProfile() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: api.updateProfile, onSuccess: () => invalidate(customerKeys.profile) })
}

export function useAddAddress() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: api.addAddress, onSuccess: () => invalidate(customerKeys.addresses, customerKeys.profile) })
}

export function useUpdateAddress() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.AddressInput }) => api.updateAddress(id, input),
    onSuccess: () => invalidate(customerKeys.addresses),
  })
}

export function useSetDefaultAddress() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: api.setDefaultAddress, onSuccess: () => invalidate(customerKeys.addresses) })
}

export function useRemoveAddress() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: api.removeAddress, onSuccess: () => invalidate(customerKeys.addresses, customerKeys.profile) })
}

export function useCreateOrder() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => invalidate(customerKeys.orders, customerKeys.notifications, customerKeys.profile),
  })
}

export function useSubmitFeedback(reference: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (f: { rating: number; poured_by_partner: boolean }) => api.submitFeedback(reference, f),
    onSuccess: () => invalidate(customerKeys.order(reference)),
  })
}

export function useDemoAdvance(reference: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (to: 'delivered' | 'next') => api.demoAdvanceOrder(reference, to),
    onSuccess: () => invalidate(customerKeys.order(reference), customerKeys.orders, customerKeys.points, customerKeys.profile),
  })
}

export function useMarkNotificationsRead() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (ids?: string[]) => api.markNotificationsRead(ids), onSuccess: () => invalidate(customerKeys.notifications) })
}

export function useCreateTicket() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (i: { type: ProblemType; message: string; reference: string | null }) => api.createTicket(i),
    onSuccess: () => invalidate(customerKeys.tickets),
  })
}

export function useRequestAccountDeletion() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: api.requestAccountDeletion, onSuccess: () => invalidate(customerKeys.tickets) })
}
