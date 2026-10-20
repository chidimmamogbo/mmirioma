/**
 * The order being built across the order screens (type → quantity → details
 * → save address → review). Kept in sessionStorage so a reload or a lost
 * connection does not wipe what the customer entered (NFR-012). It holds no
 * secrets and no prices: prices always come from the server.
 */
import type { CanSizeLitres, TankSizeGallons, TankType, WaterChoice, WaterSource } from '../../../domain/orders'

export type SaveMode = 'default' | 'another' | 'once'

export interface OrderDraft {
  delivery_type: 'keke' | 'tanker'
  keke: { can_size_litres: CanSizeLitres; can_count: number }
  tanker: { tank_type: TankType; tank_size_gallons: TankSizeGallons | null; custom_gallons: string }
  /** Tanker orders only; ignored for Keke (decision 10). */
  source: WaterSource
  /** A saved address id, or `null` when entering a new address. */
  address_id: string | null
  new_address: { address: string; landmark: string; label: string; save: SaveMode }
  receiver_name: string
  receiver_phone: string
  instructions: string
  /**
   * One key per checkout attempt, reused on every retry so a double tap or a
   * network retry never creates two orders (FR-026). Replaced after success.
   */
  idempotency_key: string
}

const KEY = 'mmirioma.orderDraft.v1'

export function newDraft(): OrderDraft {
  return {
    delivery_type: 'keke',
    // Defaults match the design's pre-selected tiles.
    keke: { can_size_litres: 25, can_count: 24 },
    tanker: { tank_type: 'ground', tank_size_gallons: 750, custom_gallons: '' },
    source: 'borehole',
    address_id: null,
    new_address: { address: '', landmark: '', label: '', save: 'another' },
    receiver_name: '',
    receiver_phone: '',
    instructions: '',
    idempotency_key: crypto.randomUUID(),
  }
}

export function loadDraft(): OrderDraft {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return { ...newDraft(), ...(JSON.parse(raw) as Partial<OrderDraft>) }
  } catch {
    // Unreadable storage: start a fresh draft.
  }
  return newDraft()
}

export function saveDraft(draft: OrderDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Storage unavailable: the draft still works for this page view.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The water choice the draft describes, for quotes and the order request. */
export function draftChoice(draft: OrderDraft): WaterChoice {
  return draft.delivery_type === 'keke'
    ? { delivery_type: 'keke', ...draft.keke }
    : {
        delivery_type: 'tanker',
        tank_type: draft.tanker.tank_type,
        tank_size_gallons: draft.tanker.tank_size_gallons,
        source: draft.source,
      }
}
