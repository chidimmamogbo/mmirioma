import { describe, expect, it } from 'vitest'

import { describeQuantity, gallonsFromLitres, litresFromGallons } from './quantity'

describe('litres and local gallons (1 gal = 4 L, FR-021)', () => {
  it('converts the tank sizes exactly', () => {
    expect(litresFromGallons(500)).toBe(2000)
    expect(litresFromGallons(750)).toBe(3000)
    expect(litresFromGallons(1000)).toBe(4000)
  })

  it('shows gallons to two decimals for litres that are not a multiple of 4', () => {
    expect(gallonsFromLitres(600)).toBe(150)
    expect(gallonsFromLitres(601)).toBe(150.25)
    expect(gallonsFromLitres(25)).toBe(6.25)
  })

  it('writes both units, leading with the one the order is sized in', () => {
    expect(describeQuantity(600)).toBe('600 litres (150 gallons)')
    expect(describeQuantity(2000, 'gallons')).toBe('500 gallons (2,000 litres)')
    expect(describeQuantity(601)).toBe('601 litres (150.25 gallons)')
  })

  it('abbreviates for tight rows', () => {
    expect(describeQuantity(1200, 'litres', 'short')).toBe('1,200 L · 300 gal')
    expect(describeQuantity(4000, 'gallons', 'short')).toBe('1,000 gal · 4,000 L')
  })
})
