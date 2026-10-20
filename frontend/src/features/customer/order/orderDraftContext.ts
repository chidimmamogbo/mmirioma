import { createContext, useContext } from 'react'
import type { OrderDraft } from './draft'

export interface OrderDraftValue {
  draft: OrderDraft
  /** Merge changes into the draft (persisted immediately). */
  update: (patch: Partial<OrderDraft> | ((d: OrderDraft) => Partial<OrderDraft>)) => void
  /** Start a new draft, optionally pre-filled (e.g. "Order this again"). */
  reset: (seed?: Partial<OrderDraft>) => void
}

export const OrderDraftContext = createContext<OrderDraftValue | null>(null)

/** The current order draft. Must be used inside `OrderDraftProvider`. */
export function useOrderDraft(): OrderDraftValue {
  const value = useContext(OrderDraftContext)
  if (!value) throw new Error('useOrderDraft must be used inside OrderDraftProvider')
  return value
}
