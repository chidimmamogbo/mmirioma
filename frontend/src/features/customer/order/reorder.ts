import type { CustomerOrder, SavedAddress } from '../../../domain/orders'
import { formatPhone } from '../../../lib/format/phone'
import type { OrderDraft } from './draft'

/**
 * Draft values for "Order this again" / "Reorder": same water, same address
 * and receiver. Prices are not copied: the review screen asks the server for
 * a fresh quote, because prices may have changed since (FR-024).
 */
export function draftFromOrder(order: CustomerOrder, addresses: SavedAddress[]): Partial<OrderDraft> {
  const saved = addresses.find((a) => a.address === order.address)
  const base: Partial<OrderDraft> = {
    delivery_type: order.choice.delivery_type,
    ...(order.choice.delivery_type === 'tanker' ? { source: order.choice.source } : {}),
    receiver_name: order.receiver_name,
    receiver_phone: formatPhone(order.receiver_phone),
    instructions: order.instructions ?? '',
    address_id: saved?.id ?? null,
    new_address: saved
      ? { address: '', landmark: '', label: '', save: 'another' }
      : { address: order.address, landmark: order.landmark ?? '', label: order.address_label, save: 'once' },
  }
  if (order.choice.delivery_type === 'keke') {
    base.keke = { can_size_litres: order.choice.can_size_litres, can_count: order.choice.can_count }
  } else {
    base.tanker = { tank_type: order.choice.tank_type, tank_size_gallons: order.choice.tank_size_gallons, custom_gallons: '' }
  }
  return base
}
