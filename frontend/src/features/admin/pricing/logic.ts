/**
 * Pricing screen logic (#173): staff wording for rules and history, the rule
 * form's checks, and the save errors, as docs/design/admin-pricing.md words
 * them (decisions 4, 5 and 7). Pure functions, so the page stays layout.
 */
import type { PriceList, PriceListChange, PriceMargin, PriceRule, WaterCategoryOption } from '../../../domain/admin'
import { ApiError } from '../../../lib/api/client'
import { formatNaira, nairaInputToKobo } from '../../../lib/format/money'

/** Names for areas and water categories, by id. */
export interface PriceNames {
  areas: Map<string, string>
  waters: Map<string, string>
}

export function priceNames(areas: { id: string; name: string }[], waters: WaterCategoryOption[]): PriceNames {
  return { areas: new Map(areas.map((a) => [a.id, a.name])), waters: new Map(waters.map((w) => [w.id, w.label])) }
}

/** "Every area" for `null` (decision 4); an id the zone list no longer has is shown as "Unknown area". */
export function areaLabel(id: string | null, names: PriceNames): string {
  return id === null ? 'Every area' : (names.areas.get(id) ?? 'Unknown area')
}

export function waterLabel(id: string | null, names: PriceNames): string {
  return id === null ? 'Every water' : (names.waters.get(id) ?? 'Unknown water')
}

const litres = (n: number) => `${n.toLocaleString('en-NG')} L`

/** "600 L and up" or "600 L to 4,000 L". */
export function bandLabel(rule: Pick<PriceRule, 'min_litres' | 'max_litres'>): string {
  return rule.max_litres === null ? `${litres(rule.min_litres)} and up` : `${litres(rule.min_litres)} to ${litres(rule.max_litres)}`
}

/** "10 %" (up to two decimals) or "₦1,500 fixed". */
export function marginLabel(margin: PriceMargin): string {
  if (margin.type === 'fixed') return `${formatNaira(margin.amount_minor_units)} fixed`
  return `${(margin.basis_points / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })} %`
}

const FIELD_LABEL: Record<string, string> = {
  zone_id: 'Area',
  water_category_id: 'Water',
  min_litres: 'From',
  max_litres: 'To',
  base_delivery_fee_minor_units: 'Base fee',
  distance_rate_minor_units_per_km: 'Per km',
  additional_trip_minor_units: 'Second trip',
  handling_minor_units: 'Handling',
  margin: 'Margin',
}

function valueLabel(field: string, value: unknown, names: PriceNames): string {
  if (value === null || value === undefined) return field === 'max_litres' ? 'no upper limit' : '–'
  if (field === 'zone_id') return areaLabel(value as string, names)
  if (field === 'water_category_id') return waterLabel(value as string, names)
  if (field === 'margin') return marginLabel(value as PriceMargin)
  if (field.endsWith('_litres')) return litres(value as number)
  if (typeof value === 'number') return formatNaira(value)
  return String(value)
}

/**
 * One history line per change (decision 5): "Handling, every area: ₦400 →
 * ₦500"; "Rule added: <area>, <water>, <band>"; "Rule removed: …". The scope
 * comes from the version's own rule at that index.
 */
export function changeLines(version: PriceList, names: PriceNames): string[] {
  const scope = (r: Pick<PriceRule, 'zone_id' | 'water_category_id'>) =>
    [areaLabel(r.zone_id, names), r.water_category_id === null ? null : waterLabel(r.water_category_id, names)].filter(Boolean).join(', ')
  return version.changes.map((c: PriceListChange) => {
    const whole = /^rules\[(\d+)\]$/.exec(c.path)
    if (whole) {
      const r = (c.to ?? c.from) as PriceRule
      return `${c.to ? 'Rule added' : 'Rule removed'}: ${areaLabel(r.zone_id, names)}, ${waterLabel(r.water_category_id, names)}, ${bandLabel(r)}`
    }
    const field = /^rules\[(\d+)\]\.(\w+)$/.exec(c.path)
    if (!field) return 'Price list changed'
    const rule = version.rules[Number(field[1])]
    const name = FIELD_LABEL[field[2]] ?? field[2]
    const where = rule ? `, ${scope(rule).replace(/^Every area/, 'every area')}` : ''
    return `${name}${where}: ${valueLabel(field[2], c.from, names)} → ${valueLabel(field[2], c.to, names)}`
  })
}

/** What the rule sheet edits, as typed. */
export interface RuleForm {
  zoneId: string | null
  waterId: string | null
  from: string
  to: string
  noUpperLimit: boolean
  handling: string
  marginType: 'percentage' | 'fixed'
  marginValue: string
  base: string
  perKm: string
  secondTrip: string
}

export type RuleField = 'from' | 'to' | 'handling' | 'margin' | 'base' | 'perKm' | 'secondTrip'

const nairaText = (kobo: number) => String(kobo / 100)

export function ruleToForm(rule: PriceRule | null): RuleForm {
  if (!rule) {
    return { zoneId: null, waterId: null, from: '600', to: '', noUpperLimit: true, handling: '', marginType: 'percentage', marginValue: '', base: '0', perKm: '0', secondTrip: '0' }
  }
  return {
    zoneId: rule.zone_id,
    waterId: rule.water_category_id,
    from: String(rule.min_litres),
    to: rule.max_litres === null ? '' : String(rule.max_litres),
    noUpperLimit: rule.max_litres === null,
    handling: nairaText(rule.handling_minor_units),
    marginType: rule.margin.type,
    marginValue: rule.margin.type === 'percentage' ? String(rule.margin.basis_points / 100) : nairaText(rule.margin.amount_minor_units),
    base: nairaText(rule.base_delivery_fee_minor_units),
    perKm: nairaText(rule.distance_rate_minor_units_per_km),
    secondTrip: nairaText(rule.additional_trip_minor_units),
  }
}

function wholeLitres(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '')
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null
}

/** Percent typed with up to two decimals, as basis points (decision 7). */
export function percentToBasisPoints(text: string): number | null {
  const cleaned = text.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null
  const bp = Math.round(Number(cleaned) * 100)
  return bp <= 10_000 ? bp : null
}

/** The client's checks, before the server's (design, P1 field errors). */
export function ruleErrors(form: RuleForm): Partial<Record<RuleField, string>> {
  const errors: Partial<Record<RuleField, string>> = {}
  const min = wholeLitres(form.from)
  if (min === null || min < 600) errors.from = 'Start at 600 litres or more.'
  if (!form.noUpperLimit) {
    const max = wholeLitres(form.to)
    if (max === null) errors.to = 'Enter whole litres, or tick "No upper limit".'
    else if (min !== null && max < min) errors.to = 'End at the From quantity or more.'
  }
  if (nairaInputToKobo(form.handling) === null) errors.handling = 'Enter a whole naira amount, ₦0 or more.'
  if (form.marginType === 'percentage' ? percentToBasisPoints(form.marginValue) === null : nairaInputToKobo(form.marginValue) === null) {
    errors.margin = form.marginType === 'percentage' ? 'Enter 0 to 100, up to two decimals.' : 'Enter a whole naira amount, ₦0 or more.'
  }
  for (const f of ['base', 'perKm', 'secondTrip'] as const) if (nairaInputToKobo(form[f]) === null) errors[f] = 'Enter a whole naira amount, ₦0 or more.'
  return errors
}

/** The rule a valid form describes. Call only when `ruleErrors` is empty. */
export function formToRule(form: RuleForm): PriceRule {
  const kobo = (t: string) => nairaInputToKobo(t) ?? 0
  return {
    zone_id: form.zoneId,
    water_category_id: form.waterId,
    min_litres: wholeLitres(form.from) ?? 600,
    max_litres: form.noUpperLimit ? null : wholeLitres(form.to),
    base_delivery_fee_minor_units: kobo(form.base),
    distance_rate_minor_units_per_km: kobo(form.perKm),
    additional_trip_minor_units: kobo(form.secondTrip),
    handling_minor_units: kobo(form.handling),
    margin: form.marginType === 'percentage' ? { type: 'percentage', basis_points: percentToBasisPoints(form.marginValue) ?? 0 } : { type: 'fixed', amount_minor_units: kobo(form.marginValue) },
  }
}

/** A refused save, as the design words it. `rows` are the rule numbers (1-based) to mark. */
export interface SaveProblem {
  tone: 'note' | 'error'
  title: string
  body: string
  rows: number[]
  /** For `price_list_changed`: the version to load. */
  loadVersion?: number
}

/** The design's message for a refused save, or `null` for any other error (shown with the usual message). */
export function saveProblem(error: unknown, openedVersion: number | null): SaveProblem | null {
  if (!(error instanceof ApiError)) return null
  const details = Array.isArray(error.details) ? (error.details as { loc?: unknown[]; msg?: string }[]) : []
  switch (error.code) {
    case 'price_list_changed': {
      const current = (error.details as { current_version?: number } | null)?.current_version
      return {
        tone: 'note',
        title: 'Prices changed since you opened this page.',
        body: `${current ? `Someone saved version ${current}. ` : ''}Your edits were not saved.`,
        rows: [],
        loadVersion: current ?? undefined,
      }
    }
    case 'price_list_unchanged':
      return { tone: 'note', title: 'Nothing to save.', body: `These rules are the same as version ${openedVersion ?? 1}.`, rows: [] }
    case 'price_rules_overlap': {
      const pairs = details.map((d) => {
        const later = typeof d.loc?.[2] === 'number' ? d.loc[2] + 1 : null
        const earlier = /rules\[(\d+)\]/.exec(d.msg ?? '')
        return { later, earlier: earlier ? Number(earlier[1]) + 1 : null }
      })
      const sentence = pairs
        .filter((p) => p.later !== null && p.earlier !== null)
        .map((p) => `Rule ${p.later} overlaps rule ${p.earlier}`)
        .join('; ')
      return {
        tone: 'error',
        title: 'Two rules cover the same orders.',
        body: `${sentence ? `${sentence}. ` : ''}Change a quantity band or remove one rule, then save again. Nothing was saved.`,
        rows: pairs.flatMap((p) => [p.later, p.earlier]).filter((n): n is number => n !== null),
      }
    }
    case 'service_zone_not_found':
      return { tone: 'error', title: 'This area is no longer listed.', body: 'Choose it again. Nothing was saved.', rows: [] }
    case 'water_category_not_found':
      return { tone: 'error', title: 'This water is no longer listed.', body: 'Choose it again. Nothing was saved.', rows: [] }
    case 'validation_error': {
      const rows = details.map((d) => (typeof d.loc?.[2] === 'number' ? d.loc[2] + 1 : null)).filter((n): n is number => n !== null)
      return {
        tone: 'error',
        title: 'Check the marked rules.',
        body: details.map((d) => (typeof d.loc?.[2] === 'number' ? `Rule ${d.loc[2] + 1}: ${d.msg}` : d.msg)).filter(Boolean).join(' ') || 'Nothing was saved.',
        rows,
      }
    }
    default:
      return null
  }
}

/** The rules of a version without their ids: what a draft starts from. */
export function draftRules(list: PriceList | null): PriceRule[] {
  return (list?.rules ?? []).map((r) => ({
    zone_id: r.zone_id,
    water_category_id: r.water_category_id,
    min_litres: r.min_litres,
    max_litres: r.max_litres,
    base_delivery_fee_minor_units: r.base_delivery_fee_minor_units,
    distance_rate_minor_units_per_km: r.distance_rate_minor_units_per_km,
    additional_trip_minor_units: r.additional_trip_minor_units,
    handling_minor_units: r.handling_minor_units,
    margin: r.margin,
  }))
}
