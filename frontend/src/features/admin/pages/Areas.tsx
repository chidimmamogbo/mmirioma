import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { SampleTag } from '../../../components/ui/Chip'
import { Toggle } from '../../../components/ui/Controls'
import { INPUT } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { ServiceArea } from '../../../domain/admin'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatNaira, nairaInputToKobo } from '../../../lib/format/money'
import * as api from '../adminApi'
import { AdminFrame, PageHead } from '../AdminParts'
import { useAdminMutation, useAreas, usePriceLists, useStations } from '../queries'

type Draft = { name: string; enabled: boolean; station_id: string; distance: string; fee: string }

function toDraft(a: ServiceArea | null): Draft {
  return {
    name: a?.name ?? '',
    enabled: a?.enabled ?? true,
    station_id: a?.station_id ?? '',
    distance: a?.distance_km?.toString() ?? '',
    fee: a?.fixed_fee_minor_units != null ? String(a.fixed_fee_minor_units / 100) : '',
  }
}

function fromDraft(d: Draft): Omit<ServiceArea, 'id'> {
  const km = d.distance.trim() === '' ? null : Number(d.distance)
  return {
    name: d.name,
    enabled: d.enabled,
    station_id: d.station_id || null,
    distance_km: km === null || Number.isNaN(km) ? null : km,
    fixed_fee_minor_units: d.fee.trim() === '' ? null : nairaInputToKobo(d.fee),
  }
}

/**
 * Service areas (added, from the admin table pattern). Orders are accepted
 * for enabled areas; each area has the station that usually serves it, the
 * road distance admin entered (no map provider, decision 10a) and an optional
 * fixed delivery fee. Which of these sets the fee is chosen on the pricing page.
 */
export function Areas() {
  const areas = useAreas()
  const stations = useStations('')
  const prices = usePriceLists()
  const fee = prices.data?.[0]?.delivery_fee
  const [adding, setAdding] = useState(false)

  return (
    <AdminFrame searchPlaceholder="Search orders, customers, riders">
      <PageHead
        title="Service areas"
        sub="Where we deliver, which station serves each area, and the distance and fee used for delivery prices."
        actions={
          <Button size="sm" block={false} onClick={() => setAdding(true)}>
            + Add area
          </Button>
        }
      />
      {fee && (
        <Notice className="rise-2">
          Delivery fee now:{' '}
          <b>
            {fee.per_area_enabled && fee.per_km_enabled
              ? `fixed fee per area where set, otherwise ${formatNaira(fee.per_km_minor_units)} per km`
              : fee.per_area_enabled
                ? 'fixed fee per area where set, otherwise the flat fee'
                : fee.per_km_enabled
                  ? `${formatNaira(fee.per_km_minor_units)} per km of the area's distance`
                  : 'the flat delivery fee in the price list'}
          </b>
          .{' '}
          <Link to="/admin/pricing" className="font-bold text-primary no-underline">
            Change on Pricing
          </Link>
        </Notice>
      )}
      {areas.isPending && <LoadingBlock label="Loading areas" />}
      {areas.isError && <ErrorBlock error={areas.error} onRetry={() => areas.refetch()} />}
      {areas.data && (
        <Card className="rise-3 flex flex-col p-2">
          <div role="row" className={`${GRID} hidden border-0 border-b border-solid border-line px-3 py-2.5 text-chip font-bold text-mute lg:grid`}>
            {['Area', 'Taking orders', 'Serving station', 'Distance (km)', 'Fixed fee (₦)', ''].map((h) => (
              <span key={h} role="columnheader">
                {h}
              </span>
            ))}
          </div>
          {adding && <AreaRow area={null} stations={stations.data ?? []} onDone={() => setAdding(false)} />}
          {areas.data.map((a) => (
            <AreaRow key={a.id} area={a} stations={stations.data ?? []} />
          ))}
        </Card>
      )}
      <p className="m-0 flex items-center gap-2 text-caption text-mute">
        <SampleTag /> The area list is a sample until the first service zone is confirmed (PRD §13.1).
      </p>
    </AdminFrame>
  )
}

/** Table-like columns from 1024 px; below that each area is a stacked card with labelled fields. */
const GRID = 'lg:grid-cols-[minmax(130px,1.2fr)_96px_minmax(170px,1.6fr)_104px_120px_auto] lg:items-center lg:gap-3'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-chip font-bold text-mute lg:sr-only">{label}</span>
      {children}
    </label>
  )
}

function AreaRow({ area, stations, onDone }: { area: ServiceArea | null; stations: { id: string; name: string }[]; onDone?: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(area))
  const save = useAdminMutation(() => api.saveArea(area?.id ?? null, fromDraft(d)))
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(area))
  return (
    <div className="border-0 border-b border-solid border-row-line px-3 py-3 last:border-b-0">
      <div className={`${GRID} grid grid-cols-2 gap-3`}>
        <div className="col-span-2 lg:col-span-1">
          {area ? (
            <b className="text-[15px]">{area.name}</b>
          ) : (
            <Field label="Area name">
              <input className={INPUT} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Abakpa Nike" />
            </Field>
          )}
        </div>
        <div className="flex items-center gap-2 lg:block">
          <span className="text-chip font-bold text-mute lg:hidden">Taking orders</span>
          <Toggle label={`${d.name || 'New area'} taking orders`} checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <Field label="Serving station">
            <select className={INPUT} value={d.station_id} onChange={(e) => setD({ ...d, station_id: e.target.value })}>
              <option value="">Nearest open station</option>
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Distance (km)">
          <input inputMode="decimal" className={INPUT} value={d.distance} onChange={(e) => setD({ ...d, distance: e.target.value.replace(/[^\d.]/g, '') })} placeholder="—" />
        </Field>
        <Field label="Fixed fee (₦)">
          <input inputMode="numeric" className={INPUT} value={d.fee} onChange={(e) => setD({ ...d, fee: e.target.value.replace(/[^\d,]/g, '') })} placeholder="None" />
        </Field>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <Button size="sm" block={false} className="px-4" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => onDone?.() })}>
            Save
          </Button>
          {onDone && (
            <Button variant="line" size="sm" block={false} className="px-4" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {save.isError && (
        <Notice tone="error" className="mt-2">
          {errorMessage(save.error)}
        </Notice>
      )}
    </div>
  )
}
