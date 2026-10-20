import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { OrderDraftContext } from './orderDraftContext'
import { clearDraft, loadDraft, newDraft, saveDraft, type OrderDraft } from './draft'

/**
 * Holds the order draft for the customer screens. Every update is written to
 * sessionStorage straight away (inside the setter, not an effect, so nothing
 * is lost if the tab is closed right after a change).
 */
export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OrderDraft>(loadDraft)

  const update = useCallback((patch: Partial<OrderDraft> | ((d: OrderDraft) => Partial<OrderDraft>)) => {
    setDraft((d) => {
      const next = { ...d, ...(typeof patch === 'function' ? patch(d) : patch) }
      saveDraft(next)
      return next
    })
  }, [])

  const reset = useCallback((seed?: Partial<OrderDraft>) => {
    clearDraft()
    const next = { ...newDraft(), ...seed }
    if (seed) saveDraft(next)
    setDraft(next)
  }, [])

  const value = useMemo(() => ({ draft, update, reset }), [draft, update, reset])
  return <OrderDraftContext.Provider value={value}>{children}</OrderDraftContext.Provider>
}
