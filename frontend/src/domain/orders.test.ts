import { describe, expect, it } from 'vitest'

import { STAGE_LABEL, canCountsFor, fitCanCount, isActiveStage, isProblemStage } from './orders'

describe('Keke can counts (600 L minimum, FR-021)', () => {
  it('drops 12 cans for 25 L cans (300 L) but keeps it for 50 L cans (600 L)', () => {
    expect(canCountsFor(25)).toEqual([24, 30, 60])
    expect(canCountsFor(50)).toEqual([12, 24, 30, 60])
  })

  it('keeps an allowed count when the size changes', () => {
    expect(fitCanCount(25, 30)).toBe(30)
  })

  it('moves to the smallest allowed count when the old one is too small', () => {
    expect(fitCanCount(25, 12)).toBe(24)
  })
})

describe('delivery stages', () => {
  it('tracks only orders that are still moving', () => {
    expect(isActiveStage('waiting_rider')).toBe(true)
    expect(isActiveStage('on_the_way')).toBe(true)
    expect(isActiveStage('delivered')).toBe(false)
    expect(isActiveStage('cancelled')).toBe(false)
    expect(isActiveStage('failed')).toBe(false)
    expect(isActiveStage('under_review')).toBe(false)
  })

  it('marks cancelled and failed as problems, but not an order under review', () => {
    expect(isProblemStage('cancelled')).toBe(true)
    expect(isProblemStage('failed')).toBe(true)
    expect(isProblemStage('under_review')).toBe(false)
    expect(isProblemStage('delivered')).toBe(false)
  })

  it('labels the two new stages as decided on 2026-10-26', () => {
    expect(STAGE_LABEL.failed).toBe('Delivery failed')
    expect(STAGE_LABEL.under_review).toBe('Under review')
  })
})
