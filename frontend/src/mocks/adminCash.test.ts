// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { correctCollection, getCashDay, getDriverCash, lagosDateOf, paymentAfterReceipt, receiveCash, reconcileCollections } from './adminCashMock'
import { mockLogin } from './authMock'
import { resetMockDb } from './db'
import { DEMO_DRIVER_ID, DEMO_RIDER_ID } from './partnerSeed'
import { DEMO_PASSWORD } from './seed'

const ADMIN = { phone: '0800 000 0100', password: DEMO_PASSWORD }
const RIDER = { phone: '0800 000 0101', password: DEMO_PASSWORD }

async function failure(promise: Promise<unknown>): Promise<{ status: number; code: string; details: unknown }> {
  return promise.then(
    () => {
      throw new Error('expected a failure')
    },
    (e: { status: number; code: string; details: unknown }) => e,
  )
}

const today = () => lagosDateOf(new Date().toISOString())

beforeEach(async () => {
  resetMockDb()
  await mockLogin(ADMIN)
})

describe('payment status at receipt (payments.md, "Payment status")', () => {
  it('follows the contract table', () => {
    expect(paymentAfterReceipt(4_500_000, 4_500_000)).toEqual({ payment_status: 'paid', outstanding_balance_minor_units: 0, overpaid_minor_units: 0 })
    expect(paymentAfterReceipt(4_000_000, 4_500_000)).toEqual({ payment_status: 'partially_paid', outstanding_balance_minor_units: 500_000, overpaid_minor_units: 0 })
    expect(paymentAfterReceipt(0, 4_500_000)).toEqual({ payment_status: 'partially_paid', outstanding_balance_minor_units: 4_500_000, overpaid_minor_units: 0 })
    expect(paymentAfterReceipt(5_000_000, 4_500_000)).toEqual({ payment_status: 'paid', outstanding_balance_minor_units: 0, overpaid_minor_units: 500_000 })
  })
})

describe('admin cash mock (#19)', () => {
  it('refuses partners (403)', async () => {
    await mockLogin(RIDER)
    expect((await failure(getCashDay(today()))).code).toBe('forbidden')
  })

  it('shows the day: overdue driver first, cash with drivers, a record to reconcile', async () => {
    const day = await getCashDay(today())
    expect(day.drivers.map((row) => [row.driver.id, row.overdue])).toEqual([
      [DEMO_DRIVER_ID, true],
      [DEMO_RIDER_ID, false],
    ])
    expect(day.totals.with_drivers_minor_units).toBe(650_000 + 500_000 + 2_500_000)
    expect(day.totals.recorded_minor_units).toBe(650_000 + 500_000)
    expect(day.awaiting_reconciliation.map((row) => row.status)).toEqual(['remitted'])
  })

  it('answers driver_not_found for an unknown driver', async () => {
    expect((await failure(getDriverCash('nobody'))).code).toBe('driver_not_found')
  })

  it('needs a note when the count differs, then sets each payment status and refuses a repeat', async () => {
    const ids = (await getDriverCash(DEMO_RIDER_ID)).collections.map((row) => row.id)
    const short = { driver_id: DEMO_RIDER_ID, collection_ids: ids, counted_minor_units: 1_100_000, note: null }
    const missing = await failure(receiveCash(short))
    expect([missing.status, missing.code]).toEqual([422, 'validation_error'])

    const received = await receiveCash({ ...short, note: 'One note was torn.' })
    expect(received.difference_minor_units).toBe(1_100_000 - 1_150_000)
    // The difference belongs to the handover: each order is set from its own recorded amount.
    expect(received.orders.map((o) => [o.payment_status, o.outstanding_balance_minor_units])).toEqual([
      ['paid', 0],
      ['partially_paid', 90_000],
    ])
    expect((await getDriverCash(DEMO_RIDER_ID)).collections).toEqual([])
    expect((await getCashDay(today())).totals.differences).toBe(1)

    const again = await failure(receiveCash({ ...short, note: 'Retry' }))
    expect([again.status, again.code, again.details]).toEqual([409, 'cash_collection_changed', { collection_ids: ids }])
  })

  it('corrects a record before receipt, keeping the driver’s amount', async () => {
    const [first] = (await getDriverCash(DEMO_RIDER_ID)).collections
    expect((await failure(correctCollection(first.id, { amount_minor_units: first.amount_minor_units, reason: 'Same' }))).code).toBe('validation_error')
    expect((await failure(correctCollection(first.id, { amount_minor_units: 700_000, reason: '  ' }))).code).toBe('validation_error')
    const corrected = await correctCollection(first.id, { amount_minor_units: 700_000, reason: 'Driver typed it wrong' })
    expect([corrected.amount_minor_units, corrected.original_amount_minor_units, corrected.correction_reason]).toEqual([700_000, 650_000, 'Driver typed it wrong'])
    expect((await failure(correctCollection('nobody', { amount_minor_units: 100, reason: 'x' }))).code).toBe('cash_collection_not_found')
  })

  it('reconciles received records without changing their payment status', async () => {
    const [waiting] = (await getCashDay(today())).awaiting_reconciliation
    const [done] = await reconcileCollections({ collection_ids: [waiting.id], note: null })
    expect([done.status, done.payment_status]).toEqual(['reconciled', waiting.payment_status])
    expect((await getCashDay(today())).awaiting_reconciliation).toEqual([])
    expect((await failure(reconcileCollections({ collection_ids: [waiting.id], note: null }))).code).toBe('cash_collection_changed')
  })
})
