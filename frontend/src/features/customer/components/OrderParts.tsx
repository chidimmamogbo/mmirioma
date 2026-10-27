import type { ReactNode } from 'react'
import { OptionTile } from '../../../components/ui/Choice'
import { ScreenHeading, StepBar } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import { WATER_SOURCE_LABEL, type WaterSource } from '../../../domain/orders'

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

/**
 * The quantity screens' line instead of a price (customer-live-prices.md,
 * screen 1): the price comes on Review, after the address and area (#42).
 */
export function PriceComesLater({ className }: { className?: string }) {
  return (
    <Notice tone="info" className={className}>
      You'll see your price on the review screen, after you add the delivery address and your area.
    </Notice>
  )
}
