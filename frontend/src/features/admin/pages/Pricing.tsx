import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { Toggle } from '../../../components/ui/Controls'
import { Notice } from '../../../components/ui/Notice'
import type { PriceList, PriceListInput } from '../../../domain/admin'
import { TANK_SIZES, WATER_SOURCE_LABEL } from '../../../domain/orders'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatShortDate } from '../../../lib/format/datetime'
import * as api from '../adminApi'
import { MONEY_TABS, editablePrices as editable } from '../adminFormat'
import { AdminFrame, LinkTabs, NairaInput, PageHead } from '../AdminParts'
import { useAdminMutation, usePriceLists } from '../queries'

const TH = 'border-b border-line px-3 py-2.5 text-left text-chip font-bold whitespace-nowrap text-mute'
const TD = 'border-b border-row-line px-3 py-2.5'

/**
 * Pricing (`a-pricing`, Pricing tab). Every save is a new version and orders
 * already placed keep their price (FR-024). Ninth Mile tanker water has its
 * own price (decision 10b); the delivery fee methods are switched here
 * (decision 10a). All values are SAMPLES, not agreed prices.
 */
export function Pricing() {
  const lists = usePriceLists()
  // Owned here so "Saved" survives the editor restarting on the new version.
  const save = useAdminMutation((draft: PriceListInput) => api.savePriceList(draft))
  if (lists.isPending) return <Frame><LoadingBlock label="Loading prices" /></Frame>
  if (lists.isError) return <Frame><ErrorBlock error={lists.error} onRetry={() => lists.refetch()} /></Frame>
  // Remount the editor when a new version arrives, so it starts from that version.
  return (
    <Frame>
      <PriceEditor key={lists.data[0].version} versions={lists.data} save={save} />
    </Frame>
  )
}

type SaveMutation = ReturnType<typeof useAdminMutation<PriceListInput, PriceList>>

function Frame({ children }: { children: ReactNode }) {
  return (
    <AdminFrame searchPlaceholder="Search settings">
      <PageHead title="Pricing, points and payouts" sub="Every change is versioned. Orders already placed keep their price." actions={<SampleTag>SAMPLE VALUES, NOT AGREED PRICES</SampleTag>} />
      <LinkTabs className="rise-2" label="Money settings" tabs={MONEY_TABS} />
      {children}
    </AdminFrame>
  )
}

function PriceEditor({ versions, save }: { versions: PriceList[]; save: SaveMutation }) {
  const current = versions[0]
  const [draft, setDraft] = useState<PriceListInput>(() => editable(current))
  const set = (fn: (d: PriceListInput) => void) =>
    setDraft((d) => {
      const next = structuredClone(d)
      fn(next)
      return next
    })
  const changed = JSON.stringify(draft) !== JSON.stringify(editable(current))

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="rise-3 flex min-w-0 flex-1 flex-col gap-4">
        <Card className="overflow-x-auto p-4">
          <div className="mb-2 flex items-center gap-3">
            <Illustration name="keke" className="w-24 shrink-0" />
            <div>
              <h2 className="m-0 text-[18px] font-extrabold">Keke prices</h2>
              <p className="m-0 text-mute">Per jerrycan, plus one delivery fee per order</p>
            </div>
          </div>
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">Keke prices</caption>
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={TH}>Customer pays (₦)</th>
                <th className={TH}>Rider earns (₦)</th>
              </tr>
            </thead>
            <tbody>
              {([25, 50] as const).map((size) => (
                <tr key={size}>
                  <td className={`${TD} font-bold`}>{size} L can</td>
                  <td className={TD}>
                    <NairaInput label={`${size} L can price`} value={draft.keke.can_minor_units[size]} onChange={(v) => set((d) => (d.keke.can_minor_units[size] = v ?? 0))} />
                  </td>
                  <td className={`${TD} text-mute`}>Per trip below</td>
                </tr>
              ))}
              <tr>
                <td className={`${TD} font-bold`}>Delivery and pouring</td>
                <td className={TD}>
                  <NairaInput label="Keke delivery fee" value={draft.keke.delivery_minor_units} onChange={(v) => set((d) => (d.keke.delivery_minor_units = v ?? 0))} />
                </td>
                <td className={TD}>
                  <NairaInput label="Keke rider pay per trip" value={draft.keke.rider_pay_minor_units} onChange={(v) => set((d) => (d.keke.rider_pay_minor_units = v ?? 0))} />
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto p-4">
          <div className="mb-2 flex items-center gap-3">
            <Illustration name="tanker" className="w-24 shrink-0" />
            <div>
              <h2 className="m-0 text-[18px] font-extrabold">Tanker prices</h2>
              <p className="m-0 text-mute">Ground and overhead use the same base price. Ninth Mile water costs more.</p>
            </div>
          </div>
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">Tanker prices</caption>
            <thead>
              <tr>
                <th className={TH}>Capacity</th>
                <th className={TH}>{WATER_SOURCE_LABEL.borehole} (₦)</th>
                <th className={TH}>{WATER_SOURCE_LABEL.ninth_mile} (₦)</th>
                <th className={TH}>Delivery (₦)</th>
                <th className={TH}>Driver earns (₦)</th>
              </tr>
            </thead>
            <tbody>
              {TANK_SIZES.map((size) => {
                const g = size.toLocaleString('en-NG')
                return (
                  <tr key={size}>
                    <td className={`${TD} font-bold`}>{g} gal</td>
                    <td className={TD}>
                      <NairaInput label={`${g} gal borehole water`} value={draft.tanker[size].water_minor_units.borehole} onChange={(v) => set((d) => (d.tanker[size].water_minor_units.borehole = v ?? 0))} />
                    </td>
                    <td className={TD}>
                      <NairaInput label={`${g} gal Ninth Mile water`} value={draft.tanker[size].water_minor_units.ninth_mile} onChange={(v) => set((d) => (d.tanker[size].water_minor_units.ninth_mile = v ?? 0))} />
                    </td>
                    <td className={TD}>
                      <NairaInput label={`${g} gal delivery`} value={draft.tanker[size].delivery_minor_units} onChange={(v) => set((d) => (d.tanker[size].delivery_minor_units = v ?? 0))} />
                    </td>
                    <td className={TD}>
                      <NairaInput label={`${g} gal driver pay`} value={draft.tanker[size].driver_pay_minor_units} onChange={(v) => set((d) => (d.tanker[size].driver_pay_minor_units = v ?? 0))} />
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td className={`${TD} font-bold`}>Custom size</td>
                <td className={TD} colSpan={4}>
                  <Chip tone="amber">Manual quote by admin</Chip>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="m-0 text-[18px] font-extrabold">Delivery fee method</h2>
          <p className="m-0 text-mute">
            With both off, each order pays the delivery fee in the tables above. A fixed area fee wins where the area has one; otherwise the rate per km uses the area's distance.
          </p>
          <div className="mo-li">
            <span className="flex-1">
              <span className="block font-bold">Rate per km</span>
              <span className="text-chip text-mute">Distance from the refill station to the area, entered on Service areas</span>
            </span>
            <NairaInput label="Rate per km" value={draft.delivery_fee.per_km_minor_units} onChange={(v) => set((d) => (d.delivery_fee.per_km_minor_units = v ?? 0))} />
            <Toggle label="Rate per km" checked={draft.delivery_fee.per_km_enabled} onChange={(v) => set((d) => (d.delivery_fee.per_km_enabled = v))} />
          </div>
          <div className="mo-li">
            <span className="flex-1">
              <span className="block font-bold">Fixed fee per area</span>
              <span className="text-chip text-mute">
                Set each area's fee on{' '}
                <Link to="/admin/areas" className="font-bold text-primary no-underline">
                  Service areas
                </Link>
              </span>
            </span>
            <Toggle label="Fixed fee per area" checked={draft.delivery_fee.per_area_enabled} onChange={(v) => set((d) => (d.delivery_fee.per_area_enabled = v))} />
          </div>
        </Card>
      </div>

      <ChangeLog versions={versions} saveLabel={`Save as version ${current.version + 1}`} changed={changed} save={save} onSave={() => save.mutate(draft)} />
    </div>
  )
}

/** The change log with the save button, shared by Pricing and Loyalty points. */
export function ChangeLog({
  versions,
  saveLabel,
  changed,
  save,
  onSave,
}: {
  versions: PriceList[]
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
