import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { SampleTag } from '../../../components/ui/Chip'
import { Toggle } from '../../../components/ui/Controls'
import { INPUT } from '../../../components/ui/Field'
import { cx } from '../../../lib/cx'
import { Notice } from '../../../components/ui/Notice'
import type { ServiceArea } from '../../../domain/admin'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatNaira, nairaInputToKobo } from '../../../lib/format/money'
import * as api from '../adminApi'
import { AdminFrame, PageHead } from '../AdminParts'
import { useAdminMutation, useAreas, useMockPriceLists } from '../queries'

type Draft = { name: string; enabled: boolean; latitude: string; longitude: string; fee: string }

function toDraft(a: ServiceArea | null): Draft {
  return {
    name: a?.name ?? '',
    enabled: a?.enabled ?? true,
    latitude: a ? String(a.centre.latitude) : '',
    longitude: a ? String(a.centre.longitude) : '',
    fee: a?.fixed_fee_minor_units != null ? String(a.fixed_fee_minor_units / 100) : '',
  }
}

/** Plain decimal degrees: an optional minus, digits and an optional decimal point. Rejects "1e1", "0x10", "Infinity" and the like. */
const DECIMAL_DEGREES = /^-?(\d+\.?\d*|\.\d+)$/

/** A coordinate typed in, or `NaN` when it is empty or not plain decimal degrees. */
const coordinate = (text: string): number => (DECIMAL_DEGREES.test(text.trim()) ? Number(text) : NaN)

/** Z4's two checks, the only ones the contract makes (admin-directory.md, `centre`). */
function coordinateErrors(d: Pick<Draft, 'latitude' | 'longitude'>): { latitude?: string; longitude?: string } {
  const lat = coordinate(d.latitude)
  const lng = coordinate(d.longitude)
  return {
    latitude: lat >= -90 && lat <= 90 ? undefined : 'Enter a latitude between -90 and 90',
    longitude: lng >= -180 && lng <= 180 ? undefined : 'Enter a longitude between -180 and 180',
  }
}

/** The area to save. Call only when `coordinateErrors` finds nothing. */
function fromDraft(d: Draft): Omit<ServiceArea, 'id'> {
  return {
    name: d.name,
    enabled: d.enabled,
    centre: { latitude: coordinate(d.latitude), longitude: coordinate(d.longitude) },
    fixed_fee_minor_units: d.fee.trim() === '' ? null : nairaInputToKobo(d.fee),
  }
}

/**
 * Service areas (Z4, docs/design/handoff-v1.md). Orders are accepted for
 * enabled areas. Each area has its coordinates, typed in by admin since no map
 * provider is approved, and an optional delivery fee per order. The boundary is
 * not edited here. Which of these sets the delivery fee is chosen on the pricing page.
 */
export function Areas() {
  const areas = useAreas()
  const prices = useMockPriceLists()
  const fee = prices.data?.[0]?.delivery_fee
  const [adding, setAdding] = useState(false)

  return (
    <AdminFrame searchPlaceholder="Search orders, customers, riders">
      <PageHead
        title="Service areas"
        sub="Where we deliver, each area's coordinates, and the delivery fee per order."
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
          <Link to="/admin/pricing" className="font-bold text-primary no-underline hover:text-primary-dark">
            Change on Pricing
          </Link>
        </Notice>
      )}
      {areas.isPending && <LoadingBlock label="Loading areas" />}
      {areas.isError && <ErrorBlock error={areas.error} onRetry={() => areas.refetch()} />}
      {areas.data && (
        <Card className="rise-3 flex flex-col p-2">
          <div role="row" className={`${GRID} hidden border-0 border-b border-solid border-line px-3 py-2.5 text-chip font-bold text-mute lg:grid`}>
            {['Area', 'Taking orders', 'Latitude', 'Longitude', 'Delivery fee per order (₦)', ''].map((h) => (
              <span key={h} role="columnheader">
                {h}
              </span>
            ))}
          </div>
          {adding && <AreaRow area={null} onDone={() => setAdding(false)} />}
          {areas.data.length === 0 && !adding && <p className="m-0 px-3 py-4 text-sub text-mute">No service areas yet. Add the first one.</p>}
          {areas.data.map((a) => (
            <AreaRow key={a.id} area={a} />
          ))}
        </Card>
      )}
      <p className="m-0 text-caption text-mute">
        Latitude and longitude: decimal degrees, e.g. 6.4447 and 7.5108. Delivery fee: leave empty for no fee; quotes for this area become manual.
      </p>
      <p className="m-0 flex items-center gap-2 text-caption text-mute">
        <SampleTag /> The area list is a sample until the first service zone is confirmed (PRD §13.1).
      </p>
    </AdminFrame>
  )
}

/** Table-like columns from 1024 px; below that each area is a stacked card with labelled fields. */
const GRID = 'lg:grid-cols-[minmax(130px,1.2fr)_96px_minmax(110px,1fr)_minmax(110px,1fr)_150px_auto] lg:items-start lg:gap-3'

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-chip font-bold text-mute lg:sr-only">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-caption font-bold text-red">
          {error}
        </span>
      )}
    </label>
  )
}

/** The red border of an invalid field, as the shared text field draws it. */
const INVALID = 'border-[#DC2626] bg-[#FEF2F2]'

/** Keep digits, a decimal point and a leading minus: what a coordinate is made of. */
const coordinateText = (text: string): string => text.replace(/[^\d.-]/g, '')

function AreaRow({ area, onDone }: { area: ServiceArea | null; onDone?: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(area))
  // Errors show once Save was pressed, so a half-typed coordinate is not flagged early.
  const [tried, setTried] = useState(false)
  const save = useAdminMutation(() => api.saveArea(area?.id ?? null, fromDraft(d)))
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(area))
  const errors = coordinateErrors(d)

  function submit() {
    setTried(true)
    if (errors.latitude || errors.longitude) return
    save.mutate(undefined, { onSuccess: () => onDone?.() })
  }

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
        <Field label="Latitude" error={tried ? errors.latitude : undefined}>
          <input
            inputMode="decimal"
            className={cx(INPUT, tried && errors.latitude && INVALID)}
            value={d.latitude}
            aria-invalid={tried && errors.latitude ? true : undefined}
            onChange={(e) => setD({ ...d, latitude: coordinateText(e.target.value) })}
            placeholder="e.g. 6.4447"
          />
        </Field>
        <Field label="Longitude" error={tried ? errors.longitude : undefined}>
          <input
            inputMode="decimal"
            className={cx(INPUT, tried && errors.longitude && INVALID)}
            value={d.longitude}
            aria-invalid={tried && errors.longitude ? true : undefined}
            onChange={(e) => setD({ ...d, longitude: coordinateText(e.target.value) })}
            placeholder="e.g. 7.5108"
          />
        </Field>
        <Field label="Delivery fee per order (₦)">
          <input inputMode="numeric" className={INPUT} value={d.fee} onChange={(e) => setD({ ...d, fee: e.target.value.replace(/[^\d,]/g, '') })} placeholder="None" />
        </Field>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <Button size="sm" block={false} className="px-4" disabled={!dirty} loading={save.isPending} onClick={submit}>
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
