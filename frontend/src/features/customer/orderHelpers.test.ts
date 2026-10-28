import { describe, expect, it } from 'vitest'
import type { CustomerOrder } from '../../domain/orders'
import { PRICE_PENDING, orderIllustration, orderPlaceLabel, orderPriceText, orderQuantityText } from './orderHelpers'

const ORDER: CustomerOrder = {
  reference: 'MO-7KQ2M9XH4T',
  created_at: '2026-10-26T12:35:00Z',
  choice: { delivery_type: 'keke', can_size_litres: 25, can_count: 24 },
  address_label: 'Home',
  address: '12 Sample Close, Independence Layout, Enugu',
  landmark: null,
  receiver_name: 'Sample Customer',
  receiver_phone: '+2348000000001',
  instructions: null,
  stage: 'waiting_rider',
  payment: { method: 'pay_on_delivery', status: null },
  quote: { currency: 'NGN', total_minor_units: 2_000_000, water: null, delivery: null, is_sample: false },
  partner: null,
  station_name: null,
  eta_minutes: null,
  delivery_code: null,
  timeline: [],
  delivery_window: null,
  delivered_at: null,
  delivered_quantity: null,
  points_earned: null,
  feedback: null,
}

/** An order sent before #21: litres only, no price yet, no saved label. */
const OLD: CustomerOrder = { ...ORDER, choice: null, quantity_litres: 1200, quote: null, address_label: null }

describe('order helpers', () => {
  it('describe the quantity from the choice, or the server litres in both units', () => {
    expect(orderQuantityText(ORDER)).toContain('25 L × 24 cans')
    expect(orderQuantityText(OLD)).toContain('1,200')
    expect(orderQuantityText(OLD)).toContain('300')
  })

  it('show the total, or the pending text for a quote request, never a computed price', () => {
    expect(orderPriceText(ORDER)).toContain('20,000')
    expect(orderPriceText(OLD)).toBe(PRICE_PENDING)
  })

  it('fall back to the address when there is no saved label', () => {
    expect(orderPlaceLabel(ORDER)).toBe('Home')
    expect(orderPlaceLabel(OLD)).toBe(OLD.address)
  })

  it('picture a neutral drop when the delivery type is not known', () => {
    expect(orderIllustration(ORDER)).toBe('keke')
    expect(orderIllustration(ORDER, 'jerrycan')).toBe('jerrycan')
    expect(orderIllustration(OLD)).toBe('drop-hero')
  })
})
