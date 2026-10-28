import { beforeEach, describe, expect, it } from 'vitest'
import type { PriceRule } from '../domain/admin'
import { ApiError } from '../lib/api/client'
import { mockLogin } from './authMock'
import { resetMockDb } from './db'
import { createPriceList, getCurrentPriceList, listPriceLists } from './priceListMock'
import { DEMO_ADMIN_PHONE, DEMO_PASSWORD } from './seed'

beforeEach(async () => {
  resetMockDb()
  await mockLogin({ phone: DEMO_ADMIN_PHONE, password: DEMO_PASSWORD })
})

async function rulesNow(): Promise<{ version: number; rules: PriceRule[] }> {
  const current = await getCurrentPriceList()
  return { version: current.version, rules: current.rules.map(({ id, ...r }) => (void id, r)) }
}

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ApiError)
  return (error as ApiError).code
}

// The mock refuses what the backend refuses (#173), so mock mode shows every state of the screen.
describe('mock price lists', () => {
  it('saves a new version with the changes worded by field', async () => {
    const { version, rules } = await rulesNow()
    rules[0] = { ...rules[0], handling_minor_units: 60_000 }
    const saved = await createPriceList({ base_version: version, reason: 'Diesel', rules })
    expect(saved.version).toBe(version + 1)
    expect(saved.changes).toEqual([{ path: 'rules[0].handling_minor_units', from: 50_000, to: 60_000 }])
    expect((await listPriceLists()).items[0].version).toBe(version + 1)
  })

  it('refuses a stale version, the same rules, overlaps and quantities under 600 litres', async () => {
    const { version, rules } = await rulesNow()
    expect(await code(createPriceList({ base_version: version - 1, reason: null, rules }))).toBe('price_list_changed')
    expect(await code(createPriceList({ base_version: version, reason: null, rules }))).toBe('price_list_unchanged')
    expect(await code(createPriceList({ base_version: version, reason: null, rules: [...rules, rules[0]] }))).toBe('price_rules_overlap')
    expect(await code(createPriceList({ base_version: version, reason: null, rules: [{ ...rules[0], min_litres: 500 }] }))).toBe('validation_error')
  })
})
