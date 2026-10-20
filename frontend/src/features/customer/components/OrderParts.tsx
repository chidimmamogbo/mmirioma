import type { ReactNode } from 'react'
import { OptionTile } from '../../../components/ui/Choice'
import { Chip } from '../../../components/ui/Chip'
import { ScreenHeading, StepBar } from '../../../components/ui/Content'
import { WATER_SOURCE_LABEL, type Quote, type WaterSource } from '../../../domain/orders'
import { formatNaira } from '../../../lib/format/money'

/** Step bar and title at the top of each order step (4 steps: type, quantity, address, review). */
export function OrderStepHeading({ step, title, sub }: { step: 1 | 2 | 3 | 4; title: string; sub: string }) {
  return (
    <div className="rise-1">
      <StepBar total={4} done={step} className="mb-3.5" />
      <ScreenHeading title={title} sub={sub} />
    </div>
  )
}

/** Question group with the design's legend style (`.lbl`, 14 px). */
export function OptionGroup({ legend, className, children }: { legend: string; className?: string; children: ReactNode }) {
  return (
    <fieldset className={`m-0 border-0 p-0 ${className ?? ''}`}>
      <legend className="mb-1.5 p-0 text-[14px] font-bold">{legend}</legend>
      {children}
    </fieldset>
  )
}

/**
 * "Water source" question on the Tanker quantity screen only (decision 10). Not in the
 * handoff; built from the option tile pattern. Ninth Mile water costs more;
 * the price difference shows in the summary below, from the server.
 */
export function WaterSourcePicker({
  value,
  onChange,
  className,
}: {
  value: WaterSource
  onChange: (source: WaterSource) => void
  className?: string
}) {
  const options: WaterSource[] = ['borehole', 'ninth_mile']
  return (
    <OptionGroup legend="Water source" className={className}>
      <div className="grid grid-cols-2 gap-3">
        {options.map((s) => (
          <OptionTile key={s} selected={value === s} onSelect={() => onChange(s)} className="min-h-[72px] justify-center px-8 py-3">
            <span className="text-[15px] font-extrabold">{WATER_SOURCE_LABEL[s]}</span>
          </OptionTile>
        ))}
      </div>
    </OptionGroup>
  )
}

/** The summary total row (`Total ₦6,500`), or "Quote needed" for custom sizes (FR-021). */
export function SummaryTotal({ quote, label = 'Total', loading }: { quote: Quote | undefined; label?: string; loading?: boolean }) {
  if (quote?.status === 'manual_quote_required') {
    return (
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[15px] font-extrabold">{label}</span>
        <Chip tone="amber">Quote needed</Chip>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2.5" aria-busy={loading || undefined}>
      <span className="text-[15px] font-extrabold">{label}</span>
      <span className="text-[22px] font-extrabold text-primary-dark">
        {quote ? formatNaira(quote.total_minor_units) : '…'}
      </span>
    </div>
  )
}
