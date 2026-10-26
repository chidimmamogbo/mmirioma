import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api/client'
import { cashErrorMessage, custodyLabel, fieldError, formatCash, isCalendarDate, lagosDate, paymentAtReceipt, shiftDate } from './cashFormat'

describe('admin cash formatting', () => {
  it('always shows kobo, as the approved cash screens do', () => {
    expect(formatCash(650_000)).toBe('₦6,500.00')
    expect(formatCash(0)).toBe('₦0.00')
    expect(formatCash(-200_000)).toBe('−₦2,000.00')
    expect(() => formatCash(1.5)).toThrow(RangeError)
  })

  it('words the payment set at receipt and the custody status', () => {
    expect(paymentAtReceipt({ payment_status: 'paid', outstanding_balance_minor_units: 0, overpaid_minor_units: 0 })).toBe('Paid · Matches the amount due')
    expect(paymentAtReceipt({ payment_status: 'partially_paid', outstanding_balance_minor_units: 250_000, overpaid_minor_units: 0 })).toBe('Part paid · ₦2,500.00 outstanding')
    expect(paymentAtReceipt({ payment_status: 'paid', outstanding_balance_minor_units: 0, overpaid_minor_units: 500_000 })).toBe('Paid · More than due: review ₦5,000.00')
    expect(custodyLabel({ status: 'remitted', received_by: { id: 'a', name: 'Ngozi E.' } })).toBe('Received by Ngozi E.')
    expect(custodyLabel({ status: 'awaiting_remittance', received_by: null })).toBe('Ready to hand over')
  })

  it('works in Lagos calendar days', () => {
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    expect(lagosDate(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-27')
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31')
    expect(isCalendarDate('2026-10-27')).toBe(true)
    expect(isCalendarDate('27-10-2026')).toBe(false)
    expect(isCalendarDate(null)).toBe(false)
  })

  it('uses the approved wording for a change meanwhile and a failed session check', () => {
    const changed = new ApiError({ kind: 'http', status: 409, code: 'cash_collection_changed', message: 'Server text' })
    const csrf = new ApiError({ kind: 'http', status: 403, code: 'csrf_failed', message: 'Server text' })
    expect(cashErrorMessage(changed)).toBe('These records changed while you were counting. The list has been reloaded.')
    expect(cashErrorMessage(csrf)).toBe('Your session check failed. Reload the page and try again.')
  })

  it('finds the server message for one field of a 422', () => {
    const error = new ApiError({
      kind: 'http',
      status: 422,
      code: 'validation_error',
      message: 'Request validation failed',
      details: [{ loc: ['body', 'note'], msg: 'Say what happened', type: 'value_error' }],
    })
    expect(fieldError(error, 'note')).toBe('Say what happened')
    expect(fieldError(error, 'counted_minor_units')).toBeUndefined()
  })
})
