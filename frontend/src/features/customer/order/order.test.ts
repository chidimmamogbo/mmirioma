// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { CustomerOrder } from '../../../domain/orders'
import { choiceLitres, describeChoice, shortReference } from '../../../domain/orders'
import { clearDraft, draftChoice, loadDraft, newDraft, saveDraft } from './draft'
import { addressStepPath } from './flow'
import { draftFromOrder } from './reorder'

beforeEach(() => clearDraft())

describe('order draft', () => {
  it('survives a reload (NFR-012) and keeps its idempotency key', () => {
    const d = { ...newDraft(), receiver_name: 'Adaeze' }
    saveDraft(d)
    const loaded = loadDraft()
    expect(loaded.receiver_name).toBe('Adaeze')
    expect(loaded.idempotency_key).toBe(d.idempotency_key)
  })

  it('gives each new draft its own idempotency key', () => {
    expect(newDraft().idempotency_key).not.toBe(newDraft().idempotency_key)
  })

  it('sends no water source for Keke, and the chosen source for Tanker', () => {
    const d = { ...newDraft(), source: 'ninth_mile' as const }
    expect(draftChoice(d)).toEqual({ delivery_type: 'keke', can_size_litres: 25, can_count: 24 })
    expect(draftChoice({ ...d, delivery_type: 'tanker' })).toMatchObject({ delivery_type: 'tanker', source: 'ninth_mile' })
  })
})

describe('flow helpers', () => {
  it('sends returning customers to the address picker', () => {
    expect(addressStepPath([])).toBe('/order/details')
    expect(addressStepPath(undefined)).toBe('/order/details')
    expect(addressStepPath([{ id: 'a', label: 'Home', address: 'x', landmark: null, is_default: true }])).toBe('/order/address')
  })

  it('describes quantities in exact litres and gallons, with no estimates (FR-021)', () => {
    const keke = { delivery_type: 'keke', can_size_litres: 25, can_count: 24 } as const
    const tanker = { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: 1000, source: 'borehole' } as const
    expect(describeChoice(keke)).toBe('25 L × 24 cans (600 L · 150 gal)')
    expect(describeChoice(keke, 'short')).toBe('25 L × 24 (600 L · 150 gal)')
    expect(describeChoice(tanker)).toBe('1,000 gallons (4,000 litres)')
    expect(describeChoice(tanker, 'short')).toBe('1,000 gal · 4,000 L')
    expect(describeChoice({ ...tanker, tank_size_gallons: null })).toBe('Custom size')
    expect(choiceLitres({ ...tanker, tank_size_gallons: 500 })).toBe(2000)
    expect(choiceLitres({ ...tanker, tank_size_gallons: null })).toBeNull()
    expect(shortReference('MO-7KQ2M9XH4T')).toBe('MO-7KQ2')
  })
})

describe('draftFromOrder (reorder)', () => {
  const order = {
    choice: { delivery_type: 'tanker', tank_type: 'overhead', tank_size_gallons: 750, source: 'ninth_mile' },
    address: '4 Zik Avenue, Uwani, Enugu',
    address_label: 'Office',
    landmark: 'Second gate',
    receiver_name: 'Adaeze Nwosu',
    receiver_phone: '+2348031234567',
    instructions: null,
  } as unknown as CustomerOrder

  it('reuses a saved address by id and copies no prices', () => {
    const d = draftFromOrder(order, [{ id: 'addr-office', label: 'Office', address: order.address, landmark: null, is_default: false }])
    expect(d.address_id).toBe('addr-office')
    expect(d.tanker).toEqual({ tank_type: 'overhead', tank_size_gallons: 750, custom_gallons: '' })
    expect(d.source).toBe('ninth_mile')
    expect(d.receiver_phone).toBe('0803 123 4567')
    expect(JSON.stringify(d)).not.toContain('minor_units')
  })

  it('uses the address once when it is no longer saved', () => {
    const d = draftFromOrder(order, [])
    expect(d.address_id).toBeNull()
    expect(d.new_address).toMatchObject({ address: order.address, save: 'once' })
  })
})
