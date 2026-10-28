import { useMemo } from 'react'
import { EmptyBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import type { PriceList, PriceRule } from '../../../domain/admin'
import { USE_MOCKS } from '../../../lib/api/mode'
import { formatDateTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import { AdminFrame, PageHead } from '../AdminParts'
import { areaName, bandText, describeChange, marginText, ruleScope, waterName, type PriceNames } from '../pricingFormat'
import { useAreas, usePriceListCurrent, usePriceListHistory, useWaterCategories } from '../queries'

/**
 * Pricing (P0, docs/design/admin-pricing.md): the rules of the current FR-022
 * price list, the road-distance rates saved for later, and the version
 * history in words. Reading only so far; adding, editing and saving a version
 * come with the rule sheet (#173, part 2). Pricing stands alone, without the
 * Money tabs (decision 9).
 *
 * The names of areas and waters come from the zone list and the water
 * category list; the page waits for both, so a rule never shows a bare id.
 */
export function Pricing() {
  const current = usePriceListCurrent()
  const areas = useAreas()
  const waters = useWaterCategories()
  const names = useMemo<PriceNames | null>(() => {
    if (!areas.data || !waters.data) return null
    return { areas: new Map(areas.data.map((a) => [a.id, a.name])), waters: new Map(waters.data.map((w) => [w.id, w.label])) }
  }, [areas.data, waters.data])

  const failed = [current, areas, waters].find((q) => q.isError)
  const retry = () => [current, areas, waters].filter((q) => q.isError).forEach((q) => void q.refetch())

  let body
  if (failed) body = <LoadFailed onRetry={retry} />
  else if (current.data === undefined || !names) body = <LoadingBlock label="Loading prices" />
  else if (current.data === null) body = <EmptyBlock title="No price list yet" text="Quotes need a price list. The first one you save will show here." />
  else body = <PriceListView list={current.data} names={names} />

  return (
    <AdminFrame searchPlaceholder="Search settings">
      <PageHead
        title="Pricing"
        sub="Every save is a new version. Quotes already given and placed orders keep their price."
        actions={USE_MOCKS ? <SampleTag>SAMPLE VALUES, NOT AGREED PRICES</SampleTag> : undefined}
      />
      <HowAPriceIsMade />
      {body}
    </AdminFrame>
  )
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Card pad role="alert" className="flex flex-col gap-3">
      <p className="m-0 font-bold text-red">We couldn&apos;t load the prices.</p>
      <Button variant="alt" size="sm" block={false} className="self-start px-4" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  )
}

/** "How a price is made": the four parts and where each one is set (decision 2). */
function HowAPriceIsMade() {
  return (
    <Card pad className="rise-2">
      <h2 className="m-0 text-[18px] font-extrabold">How a price is made</h2>
      <p className="mt-1 mb-0 text-sub text-mute">
        A price adds up four parts: water, delivery, handling and margin. The water cost is set on each water source, and delivery is the area&apos;s fee under Service
        areas. Handling and margin are set here, by area, water and quantity.
      </p>
    </Card>
  )
}

function PriceListView({ list, names }: { list: PriceList; names: PriceNames }) {
  return (
    <>
      <RulesTable list={list} names={names} />
      <DistanceRates list={list} names={names} />
      <History names={names} />
    </>
  )
}

/** Table-like columns from 1024 px; below that each rule is a card (P2). */
const GRID = 'lg:grid-cols-[minmax(160px,1.6fr)_minmax(110px,1fr)_minmax(90px,0.8fr)_minmax(90px,0.8fr)] lg:items-center lg:gap-3'

function RulesTable({ list, names }: { list: PriceList; names: PriceNames }) {
  return (
    <Card className="rise-3 flex flex-col p-2">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <h2 className="m-0 text-[18px] font-extrabold">Rules</h2>
        <Chip tone="blue">Version {list.version}</Chip>
        <span className="text-chip text-mute">In use since {formatDateTime(list.effective_from)}</span>
      </div>
      <div role="row" className={`${GRID} hidden border-0 border-y border-solid border-line px-3 py-2.5 text-chip font-bold text-mute lg:grid`}>
        {['Area and water', 'Quantity', 'Handling', 'Margin'].map((h) => (
          <span key={h} role="columnheader">
            {h}
          </span>
        ))}
      </div>
      {list.rules.map((rule) => (
        <RuleRow key={rule.id} rule={rule} names={names} />
      ))}
    </Card>
  )
}

function RuleRow({ rule, names }: { rule: PriceRule; names: PriceNames }) {
  const water = rule.water_category_id === null ? null : waterName(rule.water_category_id, names)
  return (
    <div role="row" className="border-0 border-b border-solid border-row-line px-3 py-3 last:border-b-0">
      <div className={`${GRID} grid grid-cols-2 gap-x-3 gap-y-1`}>
        <div className="col-span-2 lg:col-span-1">
          <b className="text-[15px]">{areaName(rule.zone_id, names)}</b>
          <div className="text-caption text-mute">{water ?? 'Every water'}</div>
        </div>
        <Cell label="Quantity">{bandText(rule.min_litres, rule.max_litres)}</Cell>
        <Cell label="Handling">{formatNaira(rule.handling_minor_units)}</Cell>
        <Cell label="Margin">{marginText(rule.margin)}</Cell>
      </div>
    </div>
  )
}

function Cell({ label, children }: { label: string; children: string }) {
  return (
    <div role="cell">
      <span className="block text-chip font-bold text-mute lg:sr-only">{label}</span>
      {children}
    </div>
  )
}

/** The three road-distance rates, kept but collapsed: the pilot prices delivery from the area's fee (decision 1). */
function DistanceRates({ list, names }: { list: PriceList; names: PriceNames }) {
  return (
    <Card pad className="rise-4">
      <details>
        <summary className="cursor-pointer text-[15px] font-extrabold">Road-distance rates (saved, not used yet)</summary>
        <p className="mt-2 mb-3 text-sub text-mute">
          The pilot prices delivery from each area&apos;s fee, so these rates are saved with every version but not used until road distance is.
        </p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.rules.map((rule) => (
            <li key={rule.id} className="text-[14px]">
              <b>{ruleScope(rule, names)}</b>
              <div className="text-mute">
                Base delivery fee {formatNaira(rule.base_delivery_fee_minor_units)} · Distance rate {formatNaira(rule.distance_rate_minor_units_per_km)} per km · Second trip{' '}
                {formatNaira(rule.additional_trip_minor_units)}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

/** Version history in words (decision 5): reason, what changed, who and when. */
function History({ names }: { names: PriceNames }) {
  const history = usePriceListHistory()
  return (
    <Card pad className="rise-5 flex flex-col gap-3">
      <h2 className="m-0 text-[18px] font-extrabold">Version history</h2>
      {history.isPending && <LoadingBlock label="Loading history" />}
      {history.isError && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="m-0 font-bold text-red">We couldn&apos;t load the history.</p>
          <Button variant="alt" size="sm" block={false} className="self-start px-4" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {history.data && (
        <ol className="m-0 flex list-none flex-col p-0">
          {history.data.map((version) => (
            <li key={version.version} className="flex items-start gap-3 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
              <Chip tone={version.version === history.data[0].version ? 'blue' : 'gray'}>v{version.version}</Chip>
              <span className="min-w-0">
                {version.reason && <span className="block text-[14px] font-bold">{version.reason}</span>}
                {version.changes.length === 0 ? (
                  <span className="block text-[14px]">{version.version === 1 ? 'First price list' : 'No changes recorded'}</span>
                ) : (
                  version.changes.map((change) => (
                    <span key={change.path} className="block text-[14px]">
                      {describeChange(change, version, names)}
                    </span>
                  ))
                )}
                <span className="block text-chip text-mute">
                  {version.created_by.name} · {formatDateTime(version.effective_from)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
