// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getDriverCash } from './adminCashMock'
import { mockLogin, mockLogout } from './authMock'
import { resetMockDb } from './db'
import { getMyCash, handOverCash, recordCash, remittanceDueAt } from './partnerCashMock'
import { getJob, verifyCode } from './partnerMock'
import { DEMO_RIDER_ID } from './partnerSeed'
import { DEMO_ADMIN_PHONE, DEMO_PASSWORD } from './seed'

const RIDER = { phone: '0800 000 0101', password: DEMO_PASSWORD }
const DRIVER = { phone: '0800 000 0102', password: DEMO_PASSWORD }
/** A seeded job of the demo rider, waiting for the customer's code, with a customer order behind it. */
const REF = 'MO-7KQ2M9XH4T'

/** Deliver the seeded job and return its amount due. */
async function delivered(): Promise<number> {
  await mockLogin(RIDER)
  const job = await verifyCode(REF, '482791')
  expect(job.cash).toMatchObject({ collection: null, record_allowed: true, amount_due_label: 'quote' })
  return job.cash!.amount_due_minor_units
}

beforeEach(() => resetMockDb())

describe('driver cash mock (K1, K2, #20)', () => {
  it('shows no Cash card before delivery', async () => {
    await mockLogin(RIDER)
    expect((await getJob(REF)).cash).toBeNull()
    await expect(recordCash(REF, { amount_minor_units: 100, note: null })).rejects.toMatchObject({ code: 'transition_requirements_unmet' })
  })

  it('records the amount due, puts it on hand and on the job, and repeats safely', async () => {
    const due = await delivered()
    const before = await getMyCash()
    const row = await recordCash(REF, { amount_minor_units: due, note: null })
    expect(row).toMatchObject({ order_reference: REF, amount_minor_units: due, status: 'collected', overdue: false })
    expect((await getJob(REF)).cash).toMatchObject({ record_allowed: false, collection: { id: row.id } })
    expect((await getMyCash()).on_hand_minor_units).toBe(before.on_hand_minor_units + due)
    expect((await recordCash(REF, { amount_minor_units: due, note: null })).id).toBe(row.id)
    await expect(recordCash(REF, { amount_minor_units: due - 10_000, note: 'Short' })).rejects.toMatchObject({
      code: 'cash_already_recorded',
      details: { amount_minor_units: due },
    })
  })

  it('needs a note when the amount differs, and whole naira', async () => {
    const due = await delivered()
    await expect(recordCash(REF, { amount_minor_units: 0, note: '  ' })).rejects.toMatchObject({ code: 'validation_error', details: [{ loc: ['body', 'note'] }] })
    await expect(recordCash(REF, { amount_minor_units: due + 50, note: 'x' })).rejects.toMatchObject({
      code: 'validation_error',
      details: [{ loc: ['body', 'amount_minor_units'] }],
    })
    expect((await recordCash(REF, { amount_minor_units: 0, note: 'Customer paid nothing.' })).amount_minor_units).toBe(0)
  })

  it('refuses another partner’s job as not found', async () => {
    await delivered()
    await mockLogout()
    await mockLogin(DRIVER)
    await expect(recordCash(REF, { amount_minor_units: 0, note: 'x' })).rejects.toMatchObject({ code: 'order_not_found' })
  })

  it('hands over collected cash, refuses changed records, and the office sees it', async () => {
    const due = await delivered()
    const row = await recordCash(REF, { amount_minor_units: due, note: null })
    const after = await handOverCash([row.id])
    expect(after.collections.find((c) => c.id === row.id)?.status).toBe('awaiting_remittance')
    expect(after.ready_minor_units).toBeGreaterThanOrEqual(due)
    await expect(handOverCash([row.id])).rejects.toMatchObject({ code: 'cash_collection_changed', details: { collection_ids: [row.id] } })
    await expect(handOverCash([])).rejects.toMatchObject({ code: 'validation_error' })
    await mockLogout()
    await mockLogin({ phone: DEMO_ADMIN_PHONE, password: DEMO_PASSWORD })
    const office = await getDriverCash(DEMO_RIDER_ID)
    expect(office.collections.find((c) => c.id === row.id)?.status).toBe('awaiting_remittance')
  })

  it('is due at 6:00 pm Lagos, or the next day after 6:00 pm', () => {
    // 16:00 and 18:30 Lagos (UTC+1) on 26 Oct 2026.
    expect(remittanceDueAt(new Date('2026-10-26T15:00:00Z'))).toBe('2026-10-26T17:00:00.000Z')
    expect(remittanceDueAt(new Date('2026-10-26T17:30:00Z'))).toBe('2026-10-27T17:00:00.000Z')
  })
})
