import { GroundTankArt, OverheadTankArt } from '../../../../components/art/Art'
import { Illustration } from '../../../../components/brand/Illustration'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../../components/layout/MobileShell'
import { Button, ButtonLink } from '../../../../components/ui/Button'
import { Card } from '../../../../components/ui/Card'
import { OptionTile } from '../../../../components/ui/Choice'
import { KeyValue, SectionHeader } from '../../../../components/ui/Content'
import { TextField } from '../../../../components/ui/Field'
import { TANK_SIZES, WATER_SOURCE_LABEL, describeTankSize, type TankType } from '../../../../domain/orders'
import { litresFromGallons } from '../../../../domain/quantity'
import { parseGallons } from '../../../../domain/tankCapacity'
import { OptionGroup, OrderStepHeading, PriceComesLater, WaterSourcePicker } from '../../components/OrderParts'
import { useOrderDraft } from '../../order/orderDraftContext'
import { addressStepPath } from '../../order/flow'
import { useAddresses } from '../../queries'

const TANK_TYPES: { value: TankType; title: string; sub: string }[] = [
  { value: 'ground', title: 'Ground tank', sub: 'At ground level' },
  { value: 'overhead', title: 'Overhead tank', sub: 'We pump it up' },
]

/**
 * Tanker order: tank type, capacity and water source (`c-tanker`). Sizes are
 * in gallons as designed, always shown with their exact litres (1 local
 * gallon = 4 L, FR-021; decision of 2026-10-26). No price here: it comes on
 * Review, after the address and area (#42; customer-live-prices.md).
 */
export function TankerOrder() {
  const { draft, update } = useOrderDraft()
  const addresses = useAddresses()
  const size = draft.tanker.tank_size_gallons
  const customMissing = size === null && draft.tanker.custom_gallons.trim() === ''
  const customGallons = size === null ? parseGallons(draft.tanker.custom_gallons) : null
  const sizeText = describeTankSize(size, draft.tanker.custom_gallons)

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
                <span className="text-[11px] text-mute">{litresFromGallons(g).toLocaleString('en-NG')} L</span>
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
              {size.toLocaleString('en-NG')} gallons is {litresFromGallons(size).toLocaleString('en-NG')} litres.
            </p>
          ) : (
            <TextField
              className="mt-3"
              label="Your tank size in gallons"
              inputMode="numeric"
              placeholder="e.g. 2,000"
              hint={customGallons !== null ? `That is ${litresFromGallons(customGallons).toLocaleString('en-NG')} litres.` : undefined}
              value={draft.tanker.custom_gallons}
              onChange={(e) => update((d) => ({ tanker: { ...d.tanker, custom_gallons: e.target.value.replace(/[^\d,]/g, '') } }))}
            />
          )}
        </OptionGroup>
        <WaterSourcePicker className="rise-3" value={draft.source} onChange={(source) => update({ source })} />
        <Card pad className="rise-4">
          <SectionHeader title="Order summary" className="mb-2" />
          <div className="flex items-center gap-3">
            <Illustration name="tanker" className="animate-drive h-auto w-[124px] shrink-0" />
            <div className="flex-1">
              <KeyValue label="Tank" value={draft.tanker.tank_type === 'ground' ? 'Ground tank' : 'Overhead tank'} />
              <KeyValue label="Capacity" value={sizeText ?? 'Custom'} />
              <KeyValue label="Source" value={WATER_SOURCE_LABEL[draft.source]} />
            </div>
          </div>
        </Card>
        <PriceComesLater className="rise-5" />
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
