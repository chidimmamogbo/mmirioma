import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/client'
import {
  amountDueLine,
  cashInputToKobo,
  compareCash,
  comparisonMessage,
  custodyLabel,
  dueDateTime,
  formatCash,
  handOverBy,
  handoverProblem,
  recordProblem,
} from './logic'

const apiError = (code: string, details: unknown = null, kind: 'http' | 'network' = 'http') =>
  new ApiError({ kind, status: kind === 'network' ? null : 409, code, message: code, details })

describe('driver cash wording (driver-cash.md)', () => {
  it('shows naira with kobo', () => {
    expect(formatCash(650_000)).toBe('₦6,500.00')
    expect(formatCash(0)).toBe('₦0.00')
    expect(() => formatCash(1.5)).toThrow(RangeError)
  })

  it('writes the hand-over time from the server, in Lagos', () => {
    // 17:00 UTC is 6:00 pm in Lagos.
    expect(handOverBy('2026-10-26T17:00:00Z')).toBe('Hand over by Mon 26 Oct, 6:00 pm')
    expect(dueDateTime('2026-10-26T17:00:00Z')).toBe('Mon 26 Oct 2026, 6:00 pm')
  })

  it('names the custody by app and status', () => {
    expect(custodyLabel({ status: 'collected', received_by: null }, 'keke')).toBe('Collected by rider')
    expect(custodyLabel({ status: 'collected', received_by: null }, 'tanker')).toBe('Collected by driver')
    expect(custodyLabel({ status: 'awaiting_remittance', received_by: null }, 'keke')).toBe('Ready to hand over')
    expect(custodyLabel({ status: 'remitted', received_by: { id: 'a', name: 'Ngozi E.' } }, 'keke')).toBe('Received by Ngozi E.')
    expect(custodyLabel({ status: 'reconciled', received_by: null }, 'keke')).toBe('Reconciled')
  })

  it('says "Manual quote" only for manual_quote (decision 8)', () => {
    expect(amountDueLine('manual_quote')).toBe('Manual quote · Pay on delivery: cash after unloading')
    expect(amountDueLine('quote')).toBe('Pay on delivery: cash after unloading')
    expect(amountDueLine('something_new')).toBe('Pay on delivery: cash after unloading')
  })

  it('compares the cash with the amount due', () => {
    expect(compareCash(650_000, 650_000)).toBe('equal')
    expect(compareCash(500_000, 650_000)).toBe('less')
    expect(compareCash(700_000, 650_000)).toBe('more')
    expect(compareCash(0, 650_000)).toBe('none')
    expect(comparisonMessage('less', 500_000, 650_000).text).toBe('₦1,500.00 will show as outstanding.')
    expect(comparisonMessage('more', 700_000, 650_000).text).toBe('The office will review the difference of ₦500.00.')
    expect(comparisonMessage('none', 0, 650_000)).toMatchObject({ title: 'Customer paid nothing.', text: 'The full ₦6,500.00 will show as outstanding.' })
  })

  it('reads whole naira only', () => {
    expect(cashInputToKobo('6,500')).toBe(650_000)
    expect(cashInputToKobo('0')).toBe(0)
    expect(cashInputToKobo('6500.50')).toBeNull()
    expect(cashInputToKobo('')).toBeNull()
  })
})

describe('record and handover errors', () => {
  it('words each refusal of Record cash', () => {
    expect(recordProblem(apiError('cash_already_recorded', { amount_minor_units: 650_000 }))).toMatchObject({
      closes: true,
      title: 'Cash already recorded',
      text: '₦6,500.00 was recorded for this order. Contact the office if that is wrong.',
    })
    expect(recordProblem(apiError('transition_requirements_unmet'))).toMatchObject({ closes: true, title: 'Finish unloading first' })
    expect(recordProblem(apiError('order_not_found'))).toMatchObject({ closes: true, title: 'This order is no longer yours' })
    expect(recordProblem(apiError('validation_error', [{ loc: ['body', 'note'], msg: 'Tell us what happened' }]))).toMatchObject({
      closes: false,
      retry: false,
      fields: { note: 'Tell us what happened' },
    })
    expect(recordProblem(apiError('network_error', null, 'network'))).toMatchObject({
      retry: true,
      title: 'Not sent',
      text: 'Check your connection and try again. Nothing was recorded.',
    })
  })

  it('words a changed handover and a lost one', () => {
    expect(handoverProblem(apiError('cash_collection_changed'))).toEqual({
      title: 'Some cash changed',
      text: 'The office already received some of it. Your list is updated.',
      reload: true,
    })
    expect(handoverProblem(apiError('network_error', null, 'network'))).toMatchObject({ title: 'Not sent', reload: false })
  })
})
