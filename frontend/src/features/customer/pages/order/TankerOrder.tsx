import { GroundTankArt, OverheadTankArt } from '../../../../components/art/Art'
import { Illustration } from '../../../../components/brand/Illustration'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../../components/layout/MobileShell'
import { ErrorBlock } from '../../../../components/layout/StateScreens'
import { Button, ButtonLink } from '../../../../components/ui/Button'
import { Card } from '../../../../components/ui/Card'
import { SampleTag } from '../../../../components/ui/Chip'
import { OptionTile } from '../../../../components/ui/Choice'
import { KeyValue, SectionHeader, Separator } from '../../../../components/ui/Content'
import { TextField } from '../../../../components/ui/Field'
import { TANK_SIZES, WATER_SOURCE_LABEL, describeTankLitres, type TankType } from '../../../../domain/orders'
import { formatNaira } from '../../../../lib/format/money'
import { OptionGroup, OrderStepHeading, SummaryTotal, WaterSourcePicker } from '../../components/OrderParts'
import { draftChoice } from '../../order/draft'
import { addressStepPath } from '../../order/flow'
import { useOrderDraft } from '../../order/orderDraftContext'
import { useAddresses, useQuote } from '../../queries'

const TANK_TYPES: { value: TankType; title: string; sub: string }[] = [
  { value: 'ground', title: 'Ground tank', sub: 'At ground level' },
  { value: 'overhead', title: 'Overhead tank', sub: 'We pump it up' },
]

/**
 * Tanker order: tank type, capacity and water source (`c-tanker`). Sizes are
 * in gallons as designed, with the approximate litres shown once chosen
 * (decision 11). "Custom" sizes need a quote from the team (FR-021).
 */
export function TankerOrder() {
  const { draft, update } = useOrderDraft()
  const addresses = useAddresses()
  const choice = draftChoice({ ...draft, delivery_type: 'tanker' })
  const quote = useQuote(choice, null)
  const q = quote.data?.status === 'quote_available' ? quote.data : undefined
  const size = draft.tanker.tank_size_gallons
  const customMissing = size === null && draft.tanker.custom_gallons.trim() === ''

  return (
    <MobileShell>
      <TopBar left={<BackLink to="/order" />} />
      <ScrollArea>
        <OrderStepHeading step={2} title="Tank type and capacity" sub="Tell us where the water goes and how much you need." />
        <OptionGroup legend="Tank type" className="rise-2">
          <div className="grid grid-cols-2 gap-3">
            {TANK_TYPES.map((t) => (
              <OptionTile
                key={t.value}
                selected={draft.tanker.tank_type === t.value}
                onSelect={() => update((d) => ({ delivery_type: 'tanker', tanker: { ...d.tanker, tank_type: t.value } }))}
                className="px-2 pt-3.5 pb-3"
              >
                {t.value === 'ground' ? <GroundTankArt /> : <OverheadTankArt />}
                <span className="text-[15px] font-extrabold">{t.title}</span>
                <span className="text-tab text-mute">{t.sub}</span>
              </OptionTile>
            ))}
          </div>
        </OptionGroup>
        <OptionGroup legend="Tank capacity" className="rise-3">
          <div className="grid grid-cols-4 gap-2">
            {TANK_SIZES.map((g) => (
              <OptionTile
                key={g}
                selected={size === g}
                tick={false}
                onSelect={() => update((d) => ({ delivery_type: 'tanker', tanker: { ...d.tanker, tank_size_gallons: g } }))}
                className="px-0.5 py-3"
              >
                <span className="text-[16px] font-extrabold">{g.toLocaleString('en-NG')}</span>
                <span className="text-[11px] text-mute">gallons</span>
              </OptionTile>
            ))}
            <OptionTile
              selected={size === null}
              tick={false}
              onSelect={() => update((d) => ({ delivery_type: 'tanker', tanker: { ...d.tanker, tank_size_gallons: null } }))}
              className="px-0.5 py-3"
            >
              <span className="text-[16px] font-extrabold">Custom</span>
              <span className="text-[11px] text-mute">size</span>
            </OptionTile>
          </div>
          {size !== null ? (
            <p className="mt-2 mb-0 text-caption text-mute" aria-live="polite">
              {size.toLocaleString('en-NG')} gallons is {describeTankLitres(size)}.
            </p>
          ) : (
            <TextField
              className="mt-3"
              label="Your tank size in gallons"
              inputMode="numeric"
              placeholder="e.g. 2,000"
              hint="Our team will call you with a price for this size."
              value={draft.tanker.custom_gallons}
              onChange={(e) => update((d) => ({ tanker: { ...d.tanker, custom_gallons: e.target.value.replace(/[^\d,]/g, '') } }))}
            />
          )}
        </OptionGroup>
        <WaterSourcePicker className="rise-3" value={draft.source} onChange={(source) => update({ source })} />
        {quote.isError ? (
          <ErrorBlock error={quote.error} onRetry={() => quote.refetch()} />
        ) : (
          <Card pad className="rise-4">
            <SectionHeader title="Order summary" action={<SampleTag>SAMPLE PRICES</SampleTag>} className="mb-2" />
            <div className="flex items-center gap-3">
              <Illustration name="tanker" className="animate-drive h-auto w-[124px] shrink-0" />
              <div className="flex-1">
                <KeyValue label="Tank" value={draft.tanker.tank_type === 'ground' ? 'Ground tank' : 'Overhead tank'} />
                <KeyValue
                  label="Capacity"
                  value={size === null ? (draft.tanker.custom_gallons ? `${draft.tanker.custom_gallons} gallons` : 'Custom') : `${size.toLocaleString('en-NG')} gallons`}
                />
                {size !== null && <KeyValue label="In litres" value={describeTankLitres(size)} />}
                <KeyValue label="Source" value={WATER_SOURCE_LABEL[draft.source]} />
                {q && <KeyValue label="Water" value={formatNaira(q.water.amount_minor_units)} />}
                <KeyValue label="Delivery" value={<span className="font-semibold text-mute">After address</span>} />
              </div>
            </div>
            <Separator />
            <SummaryTotal quote={quote.data} label="Water total" loading={quote.isFetching} />
          </Card>
        )}
      </ScrollArea>
      <Footer>
        {customMissing ? (
          <p className="m-0 text-center text-caption text-mute">Enter your tank size to continue.</p>
        ) : null}
        {customMissing ? <Button disabled>Continue</Button> : <ButtonLink to={addressStepPath(addresses.data)}>Continue</ButtonLink>}
      </Footer>
    </MobileShell>
  )
}
