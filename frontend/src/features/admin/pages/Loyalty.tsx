import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { INPUT } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { MockPriceList, MockPriceListInput } from '../../../mocks/priceListTypes'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatDateTime, formatShortDate } from '../../../lib/format/datetime'
import * as api from '../adminApi'
import { MONEY_TABS, editablePrices } from '../adminFormat'
import { AdminFrame, LinkTabs, PageHead } from '../AdminParts'
import { useAdminMutation, useAudit, useMockPriceLists } from '../queries'


/**
 * Loyalty points (a-pricing "Loyalty points" tab; added page). The points
 * rules are part of the versioned price list, so they change the same way
 * and show in the same change log. Points are SAMPLE rewards (decision 16).
 */
export function Loyalty() {
  const lists = useMockPriceLists()
  const audit = useAudit()
  const save = useAdminMutation((draft: MockPriceListInput) => api.saveMockPriceList(draft))
  const pointChanges = (audit.data ?? []).filter((a) => /points/i.test(a.action)).slice(0, 8)
  return (
    <AdminFrame searchPlaceholder="Search settings">
      <PageHead title="Pricing, points and payouts" sub="Every change is versioned. Points already earned stay as they are." actions={<SampleTag>SAMPLE VALUES, NOT AGREED RULES</SampleTag>} />
      <LinkTabs className="rise-2" label="Money settings" tabs={MONEY_TABS} />
      {lists.isPending && <LoadingBlock label="Loading the points rules" />}
      {lists.isError && <ErrorBlock error={lists.error} onRetry={() => lists.refetch()} />}
      {lists.data && <RulesEditor key={lists.data[0].version} versions={lists.data} save={save} />}
      <Card className="rise-4 flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[18px] font-extrabold">Recent point changes</h2>
          <Link to="/admin/customers" className="text-[14px] font-bold text-primary no-underline hover:text-primary-dark">
            Adjust a customer's points
          </Link>
        </div>
        {audit.isError && <ErrorBlock error={audit.error} onRetry={() => audit.refetch()} />}
        {audit.isSuccess && pointChanges.length === 0 && <p className="m-0 text-mute">No point changes yet.</p>}
        <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
          {pointChanges.map((a) => (
            <li key={a.id} className="border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
              <b>{a.action}</b>
              {a.reason && <span className="text-mute"> · {a.reason}</span>}
              <span className="block text-chip text-mute">
                {a.actor} · {formatDateTime(a.at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </AdminFrame>
  )
}

function RulesEditor({ versions, save }: { versions: MockPriceList[]; save: ReturnType<typeof useAdminMutation<MockPriceListInput, MockPriceList>> }) {
  const current = versions[0]
  const [draft, setDraft] = useState<MockPriceListInput>(() => editablePrices(current))
  const p = draft.points
  const set = (k: keyof MockPriceListInput['points']) => (text: string) => {
    const n = Number(text.replace(/[^\d]/g, ''))
    setDraft((d) => ({ ...d, points: { ...d.points, [k]: Number.isFinite(n) ? n : 0 } }))
  }
  const changed = JSON.stringify(draft.points) !== JSON.stringify(current.points)
  const example = Math.floor(650_000 / (Math.max(1, p.naira_per_point) * 100) / Math.max(1, p.round_to)) * Math.max(1, p.round_to)
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <Card className="rise-3 flex min-w-0 flex-1 flex-col gap-1 p-4">
        <h2 className="m-0 mb-1 text-[18px] font-extrabold">Points rules</h2>
        <Rule label="Points earned" sub="One point for every amount spent">
          1 point per ₦ <NumberBox label="Naira per point earned" value={p.naira_per_point} onChange={set('naira_per_point')} />
        </Rule>
        <Rule label="Rounding" sub="Points are rounded down to a multiple of">
          <NumberBox label="Round points to" value={p.round_to} onChange={set('round_to')} />
        </Rule>
        <Rule label="Welcome bonus" sub="Points for a new customer's first order">
          <NumberBox label="Welcome bonus points" value={p.welcome_bonus} onChange={set('welcome_bonus')} /> points
        </Rule>
        <Rule label="Spending points" sub="Value of one point at checkout or as a refund">
          1 point = ₦ <NumberBox label="Naira per point spent" value={p.naira_per_redeemed_point} onChange={set('naira_per_redeemed_point')} /> off
        </Rule>
        <p className="mt-2 mb-0 rounded-input bg-gold-tint px-3 py-2 text-[13.5px] text-gold-ink">Example: a ₦6,500 order earns {example} points with these rules.</p>
      </Card>
      <ChangeLog versions={versions} saveLabel={`Save as version ${current.version + 1}`} changed={changed} save={save} onSave={() => save.mutate(draft)} />
    </div>
  )
}

function Rule({ label, sub, children }: { label: string; sub: string; children: ReactNode }) {
  return (
    <div className="mo-li flex-wrap">
      <span className="min-w-[200px] flex-1">
        <span className="block font-bold">{label}</span>
        <span className="text-chip text-mute">{sub}</span>
      </span>
      <span className="flex items-center gap-2 font-bold">{children}</span>
    </div>
  )
}

function NumberBox({ label, value, onChange }: { label: string; value: number; onChange: (text: string) => void }) {
  return <input aria-label={label} inputMode="numeric" className={`${INPUT} w-24`} value={String(value)} onChange={(e) => onChange(e.target.value)} />
}

/** The change log with the save button for the mock points rule. */
function ChangeLog({
  versions,
  saveLabel,
  changed,
  save,
  onSave,
}: {
  versions: MockPriceList[]
  saveLabel: string
  changed: boolean
  save: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown }
  onSave: () => void
}) {
  return (
    <Card className="rise-4 flex w-full shrink-0 flex-col gap-3 p-4 xl:sticky xl:top-4 xl:w-[340px]">
      <h2 className="m-0 text-[18px] font-extrabold">Change log</h2>
      <ol className="m-0 flex list-none flex-col p-0">
        {versions.slice(0, 6).map((v) => (
          <li key={v.version} className="flex items-start gap-3 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
            <Chip tone={v.version === versions[0].version ? 'blue' : 'gray'}>v{v.version}</Chip>
            <span className="min-w-0">
              <span className="block text-[14px]">{v.note}</span>
              <span className="block text-chip text-mute">
                {v.created_by} · {formatShortDate(v.created_at)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
      {save.isSuccess && <Notice tone="success">Saved. New orders use this version; placed orders keep theirs.</Notice>}
      <Button disabled={!changed} loading={save.isPending} onClick={onSave}>
        {saveLabel}
      </Button>
      {!changed && <p className="m-0 text-center text-caption text-mute">Change a value to save a new version.</p>}
    </Card>
  )
}
