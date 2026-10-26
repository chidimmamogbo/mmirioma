import { describe, expect, it } from 'vitest'

import { customerStageFromStatus } from './orderStage'

describe('customerStageFromStatus', () => {
  it.each([
    ['quote_requested', 'waiting_rider'],
    ['awaiting_confirmation', 'waiting_rider'],
    ['confirmed', 'waiting_rider'],
    ['awaiting_payment', 'waiting_rider'],
    ['accepted', 'rider_assigned'],
    ['departed', 'rider_assigned'],
    ['collected', 'picked_up'],
    ['en_route', 'on_the_way'],
    ['arrived', 'on_the_way'],
    ['unloading', 'on_the_way'],
    ['delivered', 'delivered'],
    ['cancelled', 'cancelled'],
  ])('maps %s to %s', (status, stage) => {
    expect(customerStageFromStatus(status)).toBe(stage)
  })

  it('hides an assignment until the driver accepts (FR-032)', () => {
    expect(customerStageFromStatus('assigned')).toBe('waiting_rider')
  })

  it('shows failed and disputed with the two new stages', () => {
    expect(customerStageFromStatus('failed')).toBe('failed')
    expect(customerStageFromStatus('disputed')).toBe('under_review')
  })

  it('returns null for a status the app does not know, instead of failing', () => {
    expect(customerStageFromStatus('refund_pending')).toBeNull()
    // Inherited object keys are not statuses.
    expect(customerStageFromStatus('toString')).toBeNull()
  })
})
