import { describe, expect, it } from 'vitest'
import type { PriceList, PriceRule } from '../../domain/admin'
import { areaName, bandText, describeChange, marginText, percentText, ruleScope, waterName, type PriceNames } from './pricingFormat'

const names: PriceNames = {
  areas: new Map([['z-gra', 'GRA']]),
  waters: new Map([['w-utility', 'Utility Water']]),
}

function rule(over: Partial<PriceRule> = {}): PriceRule {
  return {
    id: 'r1',
    zone_id: null,
    water_category_id: null,
    min_litres: 600,
    max_litres: 1999,
    base_delivery_fee_minor_units: 200_000,
    distance_rate_minor_units_per_km: 15_000,
    additional_trip_minor_units: 150_000,
    handling_minor_units: 50_000,
    margin: { type: 'percentage', basis_points: 1000 },
    ...over,
  }
}

const version = (rules: PriceRule[]): PriceList => ({
  version: 2,
  effective_from: '2026-10-01T09:00:00Z',
  created_by: { id: 'u1', name: 'Sample Dispatcher' },
  reason: null,
  rules,
  changes: [],
})

describe('price list wording (#173)', () => {
  it('names an area and a water, "Every" for null, and never a bare id', () => {
    expect([areaName(null, names), areaName('z-gra', names), areaName('z-gone', names)]).toEqual(['Every area', 'GRA', 'Area not listed'])
    expect([waterName(null, names), waterName('w-utility', names), waterName('w-gone', names)]).toEqual(['Every water', 'Utility Water', 'Water not listed'])
  })

  it('words the quantity band, with and without an upper limit', () => {
    expect(bandText(600, 1999)).toBe('600 to 1,999 L')
    expect(bandText(2000, null)).toBe('2,000 L and up')
  })

  it('words a margin in percent (up to two decimals) or whole naira', () => {
    expect([percentText(1000), percentText(1050), percentText(1)]).toEqual(['10%', '10.5%', '0.01%'])
    expect(marginText({ type: 'percentage', basis_points: 1000 })).toBe('10%')
    expect(marginText({ type: 'fixed', amount_minor_units: 50_000 })).toBe('₦500')
  })

  it('says which rule it is: area, water only when set, then the band', () => {
    expect(ruleScope(rule(), names)).toBe('Every area, 600 to 1,999 L')
    expect(ruleScope(rule({ zone_id: 'z-gra', water_category_id: 'w-utility' }), names)).toBe('GRA, Utility Water, 600 to 1,999 L')
  })

  it('words a changed amount: "Handling, every area, …: ₦400 → ₦500"', () => {
    const v = version([rule()])
    expect(describeChange({ path: 'rules[0].handling_minor_units', from: 40_000, to: 50_000 }, v, names)).toBe('Handling, every area, 600 to 1,999 L: ₦400 → ₦500')
  })

  it('words a changed margin, band end and area', () => {
    const v = version([rule({ zone_id: 'z-gra', max_litres: null })])
    expect(describeChange({ path: 'rules[0].margin', from: { type: 'percentage', basis_points: 1000 }, to: { type: 'fixed', amount_minor_units: 50_000 } }, v, names)).toBe(
      'Margin, GRA, 600 L and up: 10% → ₦500',
    )
    expect(describeChange({ path: 'rules[0].max_litres', from: 1999, to: null }, v, names)).toBe('To (litres), GRA, 600 L and up: 1,999 L → no upper limit')
    expect(describeChange({ path: 'rules[0].zone_id', from: null, to: 'z-gra' }, v, names)).toContain('Area, GRA, 600 L and up: Every area → GRA')
  })

  it('words an added and a removed rule', () => {
    const added = rule({ zone_id: 'z-gra', water_category_id: 'w-utility' })
    expect(describeChange({ path: 'rules[2]', from: null, to: added }, version([]), names)).toBe('Rule added: GRA, Utility Water, 600 to 1,999 L')
    expect(describeChange({ path: 'rules[2]', from: added, to: null }, version([]), names)).toBe('Rule removed: GRA, Utility Water, 600 to 1,999 L')
  })

  it('shows a path it does not know as it came, never hides it', () => {
    expect(describeChange({ path: 'something', from: 1, to: 2 }, version([]), names)).toBe('something: 1 → 2')
  })
})
