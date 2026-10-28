import { describe, expect, it } from 'vitest'
import priceList from '../../../../../docs/api/examples/admin-price-list.json'
import type { PriceList } from '../../../domain/admin'
import { ApiError } from '../../../lib/api/client'
import { bandLabel, changeLines, draftRules, formToRule, marginLabel, percentToBasisPoints, priceNames, ruleErrors, ruleToForm, saveProblem } from './logic'

const names = priceNames([{ id: '9e8d7c6b-5a4f-4e3d-8c1b-0a9f8e7d6c5b', name: 'Independence Layout' }], [{ id: 'wc-u', label: 'Utility Water', is_active: true }])
const apiError = (code: string, details: unknown = null) => new ApiError({ kind: 'http', status: 409, code, message: code, details })

describe('pricing wording (admin-pricing.md, decisions 4, 5, 7)', () => {
  it('words bands and margins in staff terms', () => {
    expect(bandLabel({ min_litres: 600, max_litres: null })).toBe('600 L and up')
    expect(bandLabel({ min_litres: 600, max_litres: 4000 })).toBe('600 L to 4,000 L')
    expect(marginLabel({ type: 'percentage', basis_points: 1050 })).toBe('10.5 %')
    expect(marginLabel({ type: 'fixed', amount_minor_units: 150_000 })).toBe('₦1,500 fixed')
  })

  it('words the history from changes[]', () => {
    expect(changeLines(priceList as PriceList, names)).toEqual(['Per km, every area: ₦120 → ₦150'])
    const added: PriceList = { ...(priceList as PriceList), changes: [{ path: 'rules[2]', from: null, to: priceList.rules[2] }] }
    expect(changeLines(added, names)).toEqual(['Rule added: Independence Layout, Every water, 2,000 L and up'])
  })
})

describe('the rule form', () => {
  it('round-trips a rule, percent typed with decimals and sent as basis points', () => {
    const [, plain] = draftRules(priceList as PriceList)
    expect(formToRule(ruleToForm(plain))).toEqual(plain)
    expect(percentToBasisPoints('12.25')).toBe(1225)
    expect(percentToBasisPoints('100.01')).toBeNull()
    expect(percentToBasisPoints('1.234')).toBeNull()
  })

  it('checks the quantity, handling and margin before the server does', () => {
    const form = { ...ruleToForm(null), from: '500', noUpperLimit: false, to: '400', handling: '400.50', marginValue: '120' }
    expect(ruleErrors(form)).toEqual({
      from: 'Start at 600 litres or more.',
      to: 'End at the From quantity or more.',
      handling: 'Enter a whole naira amount, ₦0 or more.',
      margin: 'Enter 0 to 100, up to two decimals.',
    })
  })
})

describe('refused saves', () => {
  it('names the version to load when prices changed meanwhile', () => {
    expect(saveProblem(apiError('price_list_changed', { current_version: 4 }), 3)).toMatchObject({
      title: 'Prices changed since you opened this page.',
      body: 'Someone saved version 4. Your edits were not saved.',
      loadVersion: 4,
    })
  })

  it('says there is nothing to save', () => {
    expect(saveProblem(apiError('price_list_unchanged'), 3)).toMatchObject({ title: 'Nothing to save.', body: 'These rules are the same as version 3.' })
  })

  it('names and marks the overlapping rules', () => {
    const details = [{ loc: ['body', 'rules', 2], msg: 'Overlaps rules[0] (600 to 1,999 litres)', type: 'value_error' }]
    expect(saveProblem(apiError('price_rules_overlap', details), 3)).toMatchObject({
      title: 'Two rules cover the same orders.',
      body: 'Rule 3 overlaps rule 1. Change a quantity band or remove one rule, then save again. Nothing was saved.',
      rows: [3, 1],
    })
  })

  it('asks to choose a removed area again', () => {
    expect(saveProblem(apiError('service_zone_not_found'), 3)).toMatchObject({ title: 'This area is no longer listed.' })
  })

  it('leaves other errors to the usual message', () => {
    expect(saveProblem(apiError('network_error'), 3)).toBeNull()
  })
})
