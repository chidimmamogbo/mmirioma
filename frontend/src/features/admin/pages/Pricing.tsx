import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { PriceList, PriceListDraft, PriceRule, WaterCategoryOption } from '../../../domain/admin'
import { USE_MOCKS } from '../../../lib/api/mode'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatDateTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import * as api from '../adminApi'
import { AdminFrame, PageHead } from '../AdminParts'
import { areaLabel, bandLabel, changeLines, draftRules, marginLabel, priceNames, saveProblem, waterLabel, type PriceNames } from '../pricing/logic'
import { RuleSheet } from '../pricing/RuleSheet'
import { useAdminMutation, useCurrentPriceList, usePriceAreas, usePriceListHistory, useWaterCategories } from '../queries'

/**
 * Pricing (`a-pricing`, redesigned in #44, linked in #173): the FR-022 price
 * list (docs/design/admin-pricing.md; docs/api/admin-directory.md "Price
 * lists"). Rules set the handling and margin per area, water and quantity;
 * saving makes the next version, and quotes and placed orders keep theirs
 * (FR-024). Pricing stands alone: no Money tabs in the pilot (decision 9).
 */
export function Pricing() {
  const current = useCurrentPriceList()
  const history = usePriceListHistory()
  const areas = usePriceAreas()
  const waters = useWaterCategories()
  // Owned here so "Saved as version N." survives the editor restarting on the new version.
  const save = useAdminMutation((draft: PriceListDraft) => api.savePriceList(draft))
  const failed = current.isError || areas.isError || waters.isError
  const retry = () => void Promise.all([current.refetch(), history.refetch(), areas.refetch(), waters.refetch()])

  return (
    <AdminFrame searchPlaceholder="Search settings">
      <PageHead
        title="Pricing"
        sub="Every save is a new version. Quotes already given and placed orders keep their price."
        actions={USE_MOCKS ? <SampleTag>SAMPLE DATA</SampleTag> : undefined}
      />
      {failed ? (
        <Card className="rise-2 flex flex-col items-start gap-3 p-6" role="alert">
          <h2 className="m-0 text-[18px] font-extrabold">We couldn&apos;t load the prices.</h2>
          <p className="m-0 text-mute">Check your connection and try again. Nothing has changed.</p>
          <Button block={false} className="px-5" onClick={retry}>
            Try again
          </Button>
        </Card>
      ) : current.isPending || areas.isPending || waters.isPending ? (
        <Card className="rise-2 p-6">
          <LoadingBlock label="Loading prices" />
        </Card>
      ) : (
        <PriceEditor
          // Restart from the new version whenever one is saved or loaded.
          key={current.data?.version ?? 0}
          current={current.data}
          history={history.data ?? []}
          names={priceNames(areas.data, waters.data)}
          areas={areas.data}
          waters={waters.data}
          save={save}
          onLoadLatest={() => {
            save.reset()
            void Promise.all([current.refetch(), history.refetch()])
          }}
        />
      )}
    </AdminFrame>
  )
}

type SaveMutation = ReturnType<typeof useAdminMutation<PriceListDraft, PriceList>>

function PriceEditor({
  current,
  history,
  names,
  areas,
  waters,
  save,
  onLoadLatest,
}: {
  current: PriceList | null
  history: PriceList[]
  names: PriceNames
  areas: { id: string; name: string; is_active: boolean }[]
  waters: WaterCategoryOption[]
  save: SaveMutation
  onLoadLatest: () => void
}) {
  const opened = draftRules(current)
  const [rules, setRules] = useState<PriceRule[]>(opened)
  const [reason, setReason] = useState('')
  // The rule in the sheet: an index to edit, 'new' to add, null when closed.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const dirty = JSON.stringify(rules) !== JSON.stringify(opened)
  const nextVersion = (current?.version ?? 0) + 1
  const problem = save.isError ? saveProblem(save.error, current?.version ?? null) : null
  const marked = new Set(problem?.rows ?? [])

  function change(next: PriceRule[]) {
    if (save.isError || save.isSuccess) save.reset()
    setRules(next)
  }

  const empty = current === null && rules.length === 0

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="rise-2 flex min-w-0 flex-1 flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="m-0 text-[17px] font-extrabold">How a price is made</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Part title="Water">Cost per litre of the source. Set by the technical lead with the water sources, not here.</Part>
            <Part title="Delivery">
              The area&apos;s fee, set on{' '}
              <Link to="/admin/areas" className="font-bold text-primary no-underline hover:text-primary-dark">
                Service areas
              </Link>
              .
            </Part>
            <Part title="Handling" here>
              Per order. Set here.
            </Part>
            <Part title="Margin" here>
              A percentage or a fixed amount. Set here.
            </Part>
          </div>
          <p className="m-0 text-caption text-mute">
            The total is rounded up to the next whole naira. Customers see only the total. An order no rule covers goes to your team as a price request.
          </p>
        </Card>

        {empty ? (
          <Card className="flex flex-col items-start gap-3 p-6">
            <h2 className="m-0 text-[20px] font-extrabold">No price list yet</h2>
            <p className="m-0 max-w-[640px] text-mute">
              Until you save one, the app can&apos;t price an order: every order reaches your team as a price request, and you agree the total on the call.
            </p>
            <Button block={false} className="px-5" onClick={() => setEditing('new')}>
              Add the first rule
            </Button>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-[17px] font-extrabold">{current ? `Rules in version ${current.version}` : 'New price list'}</h2>
                <span className="text-caption text-mute">
                  An order uses the one rule that fits its area, water and quantity. A rule for one area beats &quot;Every area&quot;.
                </span>
              </div>
              <Button variant="alt" size="sm" block={false} onClick={() => setEditing('new')}>
                + Add a rule
              </Button>
            </div>

            {problem && problem.rows.length > 0 && (
              <Notice tone="error">
                <b>{problem.title}</b> {problem.body}
              </Notice>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-chip text-mute">
                    <th scope="col" className="border-0 border-b border-solid border-line px-2.5 py-2">#</th>
                    <th scope="col" className="border-0 border-b border-solid border-line px-2.5 py-2">Applies to</th>
                    <th scope="col" className="border-0 border-b border-solid border-line px-2.5 py-2">Quantity</th>
                    <th scope="col" className="border-0 border-b border-solid border-line px-2.5 py-2">Handling</th>
                    <th scope="col" className="border-0 border-b border-solid border-line px-2.5 py-2">Margin</th>
                    <th scope="col" className="border-0 border-b border-solid border-line px-2.5 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r, i) => {
                    const n = i + 1
                    const changed = JSON.stringify(r) !== JSON.stringify(opened[i])
                    return (
                      <tr key={i} className={cx(marked.has(n) ? 'bg-red-bg' : changed && 'bg-gold-tint')}>
                        <td className="border-0 border-b border-solid border-row-line px-2.5 py-3 font-bold">{n}</td>
                        <td className="border-0 border-b border-solid border-row-line px-2.5 py-3">
                          <span className="block font-bold">{areaLabel(r.zone_id, names)}</span>
                          <span className="block text-caption text-mute">{waterLabel(r.water_category_id, names)}</span>
                        </td>
                        <td className="border-0 border-b border-solid border-row-line px-2.5 py-3">{bandLabel(r)}</td>
                        <td className="border-0 border-b border-solid border-row-line px-2.5 py-3 font-bold">{formatNaira(r.handling_minor_units)}</td>
                        <td className="border-0 border-b border-solid border-row-line px-2.5 py-3 font-bold">{marginLabel(r.margin)}</td>
                        <td className="border-0 border-b border-solid border-row-line px-1.5 py-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            aria-label={`Edit rule ${n}`}
                            className="hit-44 cursor-pointer border-0 bg-transparent px-2 font-bold text-primary"
                            onClick={() => setEditing(i)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove rule ${n}`}
                            className="hit-44 cursor-pointer border-0 bg-transparent px-2 font-bold text-red"
                            onClick={() => change(rules.filter((_, j) => j !== i))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <details className="rounded-option bg-[#F5F8FC] px-3.5 py-3">
              <summary className="min-h-6 cursor-pointer font-bold">Delivery rates for road distance: saved, not used yet</summary>
              <p className="mt-2 mb-0 text-caption text-mute">
                Each rule can hold a base delivery fee, a rate per km and a charge for a second trip. They take over from the area fees once the app can
                measure road distance. Until then, delivery is the area&apos;s fee on Service areas, and these rates don&apos;t change any price.
              </p>
            </details>
          </Card>
        )}
      </div>

      <aside className="rise-3 flex w-full shrink-0 flex-col gap-4 xl:w-[360px]">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="m-0 text-[17px] font-extrabold">Save changes</h2>
          <TextField label="Reason" optional maxLength={500} placeholder="e.g. Diesel price rise" value={reason} onChange={(e) => setReason(e.target.value)} />
          {save.isSuccess && (
            <Notice tone="success">
              <b>Saved as version {save.data.version}.</b> New quotes use it now. Quotes already given and placed orders keep their price.
            </Notice>
          )}
          {problem && problem.rows.length === 0 && (
            <Notice tone={problem.tone === 'note' ? 'note' : 'error'}>
              <b className="block">{problem.title}</b>
              {problem.body}
              {problem.loadVersion !== undefined && (
                <span className="mt-2 block">
                  <Button variant="line" size="sm" block={false} onClick={onLoadLatest}>
                    Load version {problem.loadVersion}
                  </Button>
                </span>
              )}
            </Notice>
          )}
          {save.isError && !problem && <Notice tone="error">{errorMessage(save.error)}</Notice>}
          <Button
            disabled={!dirty || rules.length === 0}
            loading={save.isPending}
            onClick={() => save.mutate({ base_version: current?.version ?? null, reason: reason.trim() || null, rules })}
          >
            Save as version {nextVersion}
          </Button>
          {!dirty && !empty && <p className="m-0 text-center text-caption text-mute">Change a rule to save a new version.</p>}
        </Card>

        <Card className="flex flex-col gap-1 p-4">
          <h2 className="m-0 mb-1.5 text-[17px] font-extrabold">Version history</h2>
          {history.length === 0 && <p className="m-0 text-mute">No versions saved yet.</p>}
          <ol className="m-0 flex list-none flex-col p-0">
            {history.map((v) => {
              const lines = v.changes.length > 0 ? changeLines(v, names) : [`${v.rules.length} ${v.rules.length === 1 ? 'rule' : 'rules'}`]
              return (
                <li key={v.version} className="flex items-start gap-2.5 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
                  <Chip tone={v.version === current?.version ? 'blue' : 'gray'}>v{v.version}</Chip>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[14px] font-bold">{v.reason ?? 'No reason given'}</span>
                    {lines.slice(0, 3).map((line) => (
                      <span key={line} className="text-[13px]">
                        {line}
                      </span>
                    ))}
                    {lines.length > 3 && <span className="text-[13px] text-mute">and {lines.length - 3} more</span>}
                    <span className="text-chip text-mute">
                      {v.created_by.name} · {formatDateTime(v.effective_from)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        </Card>
      </aside>

      {editing !== null && (
        <RuleSheet
          number={editing === 'new' ? null : editing + 1}
          rule={editing === 'new' ? null : rules[editing]}
          areas={areas}
          waters={waters}
          onClose={() => setEditing(null)}
          onDone={(rule) => {
            change(editing === 'new' ? [...rules, rule] : rules.map((r, i) => (i === editing ? rule : r)))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function Part({ title, here = false, children }: { title: string; here?: boolean; children: ReactNode }) {
  return (
    <div className={cx('flex flex-col gap-1 rounded-option p-3', here ? 'bg-sky' : 'bg-[#F5F8FC]')}>
      <span className={cx('font-extrabold', here && 'text-primary-dark')}>{title}</span>
      <span className="text-[13px] text-mute">{children}</span>
    </div>
  )
}
