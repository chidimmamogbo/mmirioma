/**
 * Mock driver cash endpoints (K1 and K2, docs/design/driver-cash.md, #20).
 *
 * Same shapes and rules as docs/api/payments.md, "Driver endpoints", on the
 * same records as the admin cash mock (`admin.cash`, `adminCashMock.ts`), so
 * cash a rider records shows on the office's cash page and a handover there
 * shows here. Recording needs a delivered job of the signed-in partner
 * (unloading complete, BR-15); a different amount needs a note; a repeat of
 * the same amount and note answers with the same record; handing over moves
 * `collected` records to `awaiting_remittance` and nothing else. All amounts
 * are SAMPLE DATA.
 */
import type { AdminCashCollection } from '../lib/api/adminCash'
import type { CashCollection, DriverCash, JobCash, RecordCashRequest } from '../lib/api/driverCash'
import { CASH_NOTE_MAX_LENGTH, MAX_HANDOVER_RECORDS } from '../lib/api/driverCash'
import { cashOf, collection, peekCash } from './adminCashMock'
import { currentPrices } from './adminState'
import { requireUserId } from './authMock'
import { mutate, read } from './db'
import { findCustomerOrder } from './orderSync'
import { quoteFor } from './pricing'
import type { MockState, StoredJob } from './seed'
import { clone, delay, mockError, newId } from './store'
import { lagosToday } from './time'

const KOBO_PER_NAIRA = 100
const DAY_MS = 24 * 60 * 60 * 1000
/** Handed-over records stay on My cash this long (payments.md, `GET /driver/cash`). */
const HANDED_OVER_DAYS = 7
const ON_HAND = new Set<AdminCashCollection['status']>(['collected', 'awaiting_remittance'])

function partnerId(s: MockState): string {
  const id = requireUserId()
  const user = s.users.find((u) => u.id === id)
  if (user?.role !== 'driver' || !s.partners[id]) throw mockError(403, 'forbidden', 'This account is not a partner account')
  return id
}

function invalid(field: string, msg: string): never {
  throw mockError(422, 'validation_error', 'Request validation failed', [{ loc: ['body', field], msg, type: 'value_error' }])
}

/** True once the due time has passed while the cash is still on hand. */
function isOverdue(row: AdminCashCollection, now: number): boolean {
  return ON_HAND.has(row.status) && (row.overdue || Date.parse(row.remittance_due_at) < now)
}

/** The partner's view of a record: the contract's `CashCollection`, without the office's fields. */
function driverView(row: AdminCashCollection, now: number): CashCollection {
  return {
    id: row.id,
    order_reference: row.order_reference,
    amount_minor_units: row.amount_minor_units,
    amount_due_minor_units: row.amount_due_minor_units,
    note: row.note,
    status: row.status,
    collected_at: row.collected_at,
    remittance_due_at: row.remittance_due_at,
    overdue: isOverdue(row, now),
    remitted_at: row.remitted_at,
    received_by: row.received_by,
    reconciled_at: row.reconciled_at,
  }
}

/** `GET /driver/cash` from the records: what is on hand, plus the last 7 days handed over, newest first. */
function cashFor(rows: AdminCashCollection[], driverId: string, now = Date.now()): DriverCash {
  const mine = rows.filter((row) => row.driver.id === driverId)
  const onHand = mine.filter((row) => ON_HAND.has(row.status))
  const recent = mine.filter((row) => !ON_HAND.has(row.status) && now - Date.parse(row.remitted_at ?? row.collected_at) <= HANDED_OVER_DAYS * DAY_MS)
  const due = onHand.map((row) => row.remittance_due_at).sort()
  return clone({
    on_hand_minor_units: onHand.reduce((sum, row) => sum + row.amount_minor_units, 0),
    ready_minor_units: onHand.filter((row) => row.status === 'awaiting_remittance').reduce((sum, row) => sum + row.amount_minor_units, 0),
    remittance_due_at: due[0] ?? null,
    overdue: onHand.some((row) => isOverdue(row, now)),
    collections: [...onHand, ...recent].sort((a, b) => b.collected_at.localeCompare(a.collected_at)).map((row) => driverView(row, now)),
  })
}

/**
 * The order's amount due: the customer order's frozen total when the job came
 * from one, else the sample price for the job's water (seeded jobs). `null`
 * when the sample price list cannot price it.
 */
function amountDue(s: MockState, job: StoredJob): number | null {
  const order = findCustomerOrder(s, job.reference)?.order
  if (order) return order.quote.total_minor_units
  const quote = quoteFor(job.choice, null, currentPrices(s))
  return quote.status === 'quote_available' ? quote.total_minor_units : null
}

/**
 * The job's `cash` object (K1 Cash card), as the server puts it on every job:
 * only once the job is delivered (unloading complete). Seeded history paid
 * before the cash flow existed has no card; a job delivered in the demo has
 * one until its cash is recorded, then shows the record.
 */
export function jobCash(s: MockState, job: StoredJob, now = Date.now()): JobCash | null {
  if (job.stage !== 'delivered') return null
  const row = peekCash(s).collections.find((c) => c.order_reference === job.reference) ?? null
  if (!row && job.payment_status === 'paid') return null
  const due = row?.amount_due_minor_units ?? amountDue(s, job)
  if (due === null) return null
  return {
    amount_due_minor_units: due,
    amount_due_label: 'quote',
    collection: row ? driverView(row, now) : null,
    record_allowed: row === null,
  }
}

/** The 6:00 pm Lagos due time: today, or tomorrow when the cash came after 6:00 pm (payments.md, "The 6:00 PM rule"). */
export function remittanceDueAt(now = new Date()): string {
  const today = lagosToday(18, 0, now)
  return Date.parse(today) > now.getTime() ? today : lagosToday(18, 0, now, -1)
}

/** `GET /driver/cash` (K2). */
export async function getMyCash(): Promise<DriverCash> {
  await delay(null)
  const s = read()
  return cashFor(peekCash(s).collections, partnerId(s))
}

/**
 * `POST /driver/jobs/{reference}/cash-collection` (K1).
 *
 * @throws 404 `order_not_found`; 409 `transition_requirements_unmet` before
 *   delivery; 409 `cash_already_recorded` for a different amount or note;
 *   422 `validation_error` for the amount or a missing note.
 */
export async function recordCash(reference: string, request: RecordCashRequest): Promise<CashCollection> {
  await delay(null, 400)
  return mutate((s) => {
    const driverId = partnerId(s)
    const job = s.jobs.find((j) => j.reference === reference && j.partner_id === driverId)
    if (!job) throw mockError(404, 'order_not_found', 'Order not found')
    if (job.stage !== 'delivered') {
      throw mockError(409, 'transition_requirements_unmet', 'Unloading is not complete', { missing: ['unloading_completed'] })
    }
    const amount = request.amount_minor_units
    if (!Number.isSafeInteger(amount) || amount < 0 || amount % KOBO_PER_NAIRA !== 0) invalid('amount_minor_units', 'Enter an amount in whole naira')
    const note = (request.note ?? '').trim() || null
    if (note && note.length > CASH_NOTE_MAX_LENGTH) invalid('note', `Use ${CASH_NOTE_MAX_LENGTH} characters or fewer`)
    const cash = cashOf(s)
    const existing = cash.collections.find((c) => c.order_reference === reference)
    if (existing) {
      if (existing.amount_minor_units === amount && existing.note === note) return driverView(existing, Date.now())
      throw mockError(409, 'cash_already_recorded', 'Cash for this order is already recorded.', { amount_minor_units: existing.amount_minor_units })
    }
    const due = amountDue(s, job)
    if (due === null) throw mockError(409, 'transition_requirements_unmet', 'The order has no price yet', { missing: ['price_recorded'] })
    if (amount !== due && !note) invalid('note', 'Tell us what happened')
    const user = s.users.find((u) => u.id === driverId)
    const driver = { id: driverId, name: user?.name ?? 'Partner' }
    if (!cash.drivers.some((d) => d.id === driverId)) {
      const vehicle = s.partners[driverId]?.profile.vehicle
      cash.drivers.push({ ...driver, vehicle: vehicle ? `${vehicle.type === 'tanker' ? 'Tanker' : 'Keke'} ${vehicle.plate}` : null })
    }
    const now = new Date()
    const row = collection({
      id: newId('cash'),
      order_reference: reference,
      amount_minor_units: amount,
      amount_due_minor_units: due,
      note,
      status: 'collected',
      collected_at: now.toISOString(),
      remittance_due_at: remittanceDueAt(now),
      driver,
      customer: { name: job.customer.contact_name, phone: job.customer.phone },
    })
    cash.collections.push(row)
    return driverView(row, now.getTime())
  })
}

/**
 * `POST /driver/cash/handover` (K2). Moves no money: the cash stays the
 * partner's until an administrator receives it.
 *
 * @throws 422 `validation_error` for the list; 409 `cash_collection_changed`
 *   when a record is not this partner's or no longer `collected` (nothing changes).
 */
export async function handOverCash(collectionIds: string[]): Promise<DriverCash> {
  await delay(null, 300)
  return mutate((s) => {
    const driverId = partnerId(s)
    if (!Array.isArray(collectionIds) || collectionIds.length < 1 || collectionIds.length > MAX_HANDOVER_RECORDS || new Set(collectionIds).size !== collectionIds.length) {
      invalid('collection_ids', `Choose between 1 and ${MAX_HANDOVER_RECORDS} records, each once`)
    }
    const cash = cashOf(s)
    const rows = collectionIds.map((id) => cash.collections.find((c) => c.id === id && c.driver.id === driverId && c.status === 'collected'))
    const stale = collectionIds.filter((_, i) => !rows[i])
    if (stale.length > 0) throw mockError(409, 'cash_collection_changed', 'These cash records changed. Reload and try again.', { collection_ids: stale })
    for (const row of rows) if (row) row.status = 'awaiting_remittance'
    return cashFor(cash.collections, driverId)
  })
}
