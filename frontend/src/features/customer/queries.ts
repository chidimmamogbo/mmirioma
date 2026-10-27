/**
 * TanStack Query hooks for the customer app. Screens use these, never the API
 * functions directly, so caching and refresh after changes live in one place.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProblemType } from '../../domain/orders'
import { POINTS_ENABLED } from '../../lib/features'
import * as api from './customerApi'
import type { PriceRequest } from './order/livePrice'

export const customerKeys = {
  profile: ['customer', 'profile'] as const,
  addresses: ['customer', 'addresses'] as const,
  orders: ['customer', 'orders'] as const,
  order: (reference: string) => ['customer', 'orders', reference] as const,
  quote: (request: PriceRequest | null) => ['customer', 'quote', request] as const,
  zones: ['customer', 'zones'] as const,
  notifications: ['customer', 'notifications'] as const,
  points: ['customer', 'points'] as const,
  tickets: ['customer', 'tickets'] as const,
}

export const useProfile = () => useQuery({ queryKey: customerKeys.profile, queryFn: api.getProfile })
export const useAddresses = () => useQuery({ queryKey: customerKeys.addresses, queryFn: api.listAddresses })
export const useOrders = () => useQuery({ queryKey: customerKeys.orders, queryFn: api.listOrders })
export const useNotifications = () =>
  useQuery({
    queryKey: customerKeys.notifications,
    queryFn: api.listNotifications,
    // Points are hidden for the pilot (POINTS_ENABLED), so are their messages,
    // and the unread count leaves out the hidden ones so the bell matches what
    // is shown. The server never sends `points`; only the mock does.
    select: (list) => {
      if (POINTS_ENABLED) return list
      const hiddenUnread = list.items.filter((n) => n.kind === 'points' && !n.read).length
      return {
        items: list.items.filter((n) => n.kind !== 'points'),
        unread_count: Math.max(0, list.unread_count - hiddenUnread),
      }
    },
  })
/** Never runs while points are hidden (POINTS_ENABLED), so `data` stays undefined. */
export const usePoints = () => useQuery({ queryKey: customerKeys.points, queryFn: api.getPoints, enabled: POINTS_ENABLED })
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

/** The areas a customer can pick (FR-020); they rarely change, so kept for 10 minutes. */
export const useServiceZones = () => useQuery({ queryKey: customerKeys.zones, queryFn: api.listServiceZones, staleTime: 10 * 60_000 })

/**
 * The server price for the order on Review, once the address and area are
 * known (no price before the address, #42). Every check counts toward the
 * limit of 30 per 10 minutes, so it is never retried or refreshed on its
 * own: a new price only when asked ("Get a new price", decision 4) or after a
 * 409 `quote_expired` when placing (`refetch`).
 */
export function useQuote(request: PriceRequest | null) {
  return useQuery({
    queryKey: customerKeys.quote(request),
    queryFn: () => api.getQuote(request!),
    enabled: request !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
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
