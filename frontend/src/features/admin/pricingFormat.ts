/**
 * Staff wording for the FR-022 price list (docs/design/admin-pricing.md,
 * decisions 4, 5 and 7): "Area" for zone, "Water" for category, "Every area" /
 * "Every water" for `null`, and the history in words from `changes[]`.
 */
import type { PriceChange, PriceList, PriceRule } from '../../domain/admin'
import { formatNaira } from '../../lib/format/money'

/** Names for the ids a rule holds, from the zone list and the water category list. */
export interface PriceNames {
  /** Service zone id to its name. */
  areas: ReadonlyMap<string, string>
  /** Water category id to its label. */
  waters: ReadonlyMap<string, string>
}

export const EVERY_AREA = 'Every area'
export const EVERY_WATER = 'Every water'

/** Shown when a rule names an area or water the lists do not have, rather than a guess. */
const AREA_NOT_LISTED = 'Area not listed'
const WATER_NOT_LISTED = 'Water not listed'

export function areaName(zoneId: string | null, names: PriceNames): string {
  return zoneId === null ? EVERY_AREA : (names.areas.get(zoneId) ?? AREA_NOT_LISTED)
}

export function waterName(categoryId: string | null, names: PriceNames): string {
  return categoryId === null ? EVERY_WATER : (names.waters.get(categoryId) ?? WATER_NOT_LISTED)
}

const litres = new Intl.NumberFormat('en-NG')

/** "600 to 1,999 L", or "2,000 L and up" with no upper limit. */
export function bandText(min: number, max: number | null): string {
  return max === null ? `${litres.format(min)} L and up` : `${litres.format(min)} to ${litres.format(max)} L`
}

/** Basis points as a percentage with up to two decimals: 1000 is "10%", 1050 is "10.5%". */
export function percentText(basisPoints: number): string {
  return `${Number((basisPoints / 100).toFixed(2))}%`
}

/** "10%" or "₦500", for the margin. */
export function marginText(margin: PriceRule['margin']): string {
  return margin.type === 'percentage' ? percentText(margin.basis_points) : formatNaira(margin.amount_minor_units)
}

/** The row labels of the rule fields, in staff words (decision 4). */
const FIELD_LABEL: Record<string, string> = {
  zone_id: 'Area',
  water_category_id: 'Water',
  min_litres: 'From (litres)',
  max_litres: 'To (litres)',
  handling_minor_units: 'Handling',
  margin: 'Margin',
  base_delivery_fee_minor_units: 'Base delivery fee',
  distance_rate_minor_units_per_km: 'Distance rate per km',
  additional_trip_minor_units: 'Second trip',
}

/** One value of a changed field, in staff words. */
function valueText(field: string, value: unknown, names: PriceNames): string {
  if (field === 'zone_id') return areaName(value as string | null, names)
  if (field === 'water_category_id') return waterName(value as string | null, names)
  if (field === 'max_litres') return value === null ? 'no upper limit' : `${litres.format(value as number)} L`
  if (field === 'min_litres') return `${litres.format(value as number)} L`
  if (field === 'margin') return marginText(value as PriceRule['margin'])
  if (typeof value === 'number') return formatNaira(value)
  return String(value)
}

/** "Every area, 600 to 1,999 L" or "GRA, Utility Water, 600 to 1,999 L": which rule, in words. */
export function ruleScope(rule: PriceRule, names: PriceNames): string {
  const water = rule.water_category_id === null ? [] : [waterName(rule.water_category_id, names)]
  return [areaName(rule.zone_id, names), ...water, bandText(rule.min_litres, rule.max_litres)].join(', ')
}

const RULE_PATH = /^rules\[(\d+)\](?:\.(\w+))?$/

/**
 * One change in words: "Handling, every area, 600 to 1,999 L: ₦400 → ₦500",
 * "Rule added: GRA, Utility Water, 600 to 1,999 L" or "Rule removed: …".
 * The rule is looked up in the version the change belongs to; a removed rule
 * is read from the change itself. A path that is not a rule path is shown as
 * it came, never hidden.
 */
export function describeChange(change: PriceChange, version: PriceList, names: PriceNames): string {
  const match = RULE_PATH.exec(change.path)
  if (!match) return `${change.path}: ${String(change.from)} → ${String(change.to)}`
  const [, index, field] = match
  if (field === undefined) {
    if (change.from === null) return `Rule added: ${ruleScope(change.to as PriceRule, names)}`
    if (change.to === null) return `Rule removed: ${ruleScope(change.from as PriceRule, names)}`
    return `Rule changed: ${ruleScope(change.to as PriceRule, names)}`
  }
  const rule = version.rules[Number(index)]
  const label = FIELD_LABEL[field] ?? field
  const scope = rule ? `, ${lowerFirst(ruleScope(rule, names))}` : ''
  return `${label}${scope}: ${valueText(field, change.from, names)} → ${valueText(field, change.to, names)}`
}

/** "Every area" becomes "every area" after a field label, but a name such as "GRA" stays as typed. */
function lowerFirst(text: string): string {
  return text.startsWith(EVERY_AREA) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}
