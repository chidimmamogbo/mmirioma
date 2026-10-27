import { fitCanCount, type CustomerOrder, type SavedAddress } from '../../../domain/orders'
import { formatPhone } from '../../../lib/format/phone'
import type { OrderDraft } from './draft'

/**
 * Draft values for "Order this again" / "Reorder": same water, same address
 * and receiver. Prices are not copied: the review screen asks the server for
 * a fresh quote, because prices may have changed since (FR-024). An order
 * sent before #21 has no recorded cans or tank, so the water choice keeps the
 * draft's defaults rather than a guess.
 */
export function draftFromOrder(order: CustomerOrder, addresses: SavedAddress[]): Partial<OrderDraft> {
  const saved = addresses.find((a) => a.address === order.address)
  const choice = order.choice
  const base: Partial<OrderDraft> = {
    ...(choice ? { delivery_type: choice.delivery_type } : {}),
    ...(choice?.delivery_type === 'tanker' ? { source: choice.source } : {}),
    receiver_name: order.receiver_name,
    receiver_phone: formatPhone(order.receiver_phone),
    instructions: order.instructions ?? '',
    address_id: saved?.id ?? null,
    new_address: saved
      ? { address: '', landmark: '', label: '', save: 'another' }
      : { address: order.address, landmark: order.landmark ?? '', label: order.address_label ?? '', save: 'once' },
  }
  if (choice?.delivery_type === 'keke') {
    // An older order may be below today's minimum (12 × 25 L): reorder the smallest size that is offered.
    base.keke = { can_size_litres: choice.can_size_litres, can_count: fitCanCount(choice.can_size_litres, choice.can_count) }
  } else if (choice?.delivery_type === 'tanker') {
    base.tanker = { tank_type: choice.tank_type, tank_size_gallons: choice.tank_size_gallons, custom_gallons: '' }
  }
  return base
}
