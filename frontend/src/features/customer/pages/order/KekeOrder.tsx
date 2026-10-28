import { Illustration } from '../../../../components/brand/Illustration'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../../components/layout/MobileShell'
import { ButtonLink } from '../../../../components/ui/Button'
import { Card } from '../../../../components/ui/Card'
import { OptionTile } from '../../../../components/ui/Choice'
import { KeyValue, SectionHeader } from '../../../../components/ui/Content'
import { CAN_SIZES, canCountsFor, fitCanCount, kekeTotalLitres } from '../../../../domain/orders'
import { describeQuantity, gallonsFromLitres } from '../../../../domain/quantity'
import { cx } from '../../../../lib/cx'
import { OptionGroup, OrderStepHeading, PriceComesLater } from '../../components/OrderParts'
import { draftChoice } from '../../order/draft'
import { addressStepPath } from '../../order/flow'
import { useOrderDraft } from '../../order/orderDraftContext'
import { useAddresses } from '../../queries'

/**
 * Keke order: jerrycan size and number of cans (`c-keke`). No water source
 * question for Keke (decision 10).
 * No price here: the price comes on Review, after the address and area,
 * because a water-only price would reveal the supplier's cost per litre (#42;
 * customer-live-prices.md, decision 6).
 */
export function KekeOrder() {
  const { draft, update } = useOrderDraft()
  const addresses = useAddresses()
  const choice = draftChoice({ ...draft, delivery_type: 'keke' })
  const keke = choice.delivery_type === 'keke' ? choice : null
  const counts = canCountsFor(draft.keke.can_size_litres)

  return (
    <MobileShell>
      <TopBar left={<BackLink to="/order" />} />
      <ScrollArea>
        <OrderStepHeading step={2} title="Water size and quantity" sub="Pick a jerrycan size, then how many cans you need." />
        <OptionGroup legend="Jerrycan size" className="rise-2">
          <div className="grid grid-cols-2 gap-3">
            {CAN_SIZES.map((size) => (
              <OptionTile
                key={size}
                selected={draft.keke.can_size_litres === size}
                onSelect={() =>
                  update((d) => ({ delivery_type: 'keke', keke: { can_size_litres: size, can_count: fitCanCount(size, d.keke.can_count) } }))
                }
                className="px-2 pt-4 pb-3"
              >
                <Illustration name="jerrycan" style={{ height: size === 25 ? 46 : 60 }} />
                <span className="text-[16px] font-extrabold">{size} litres</span>
                <span className="text-[11px] text-mute">{gallonsFromLitres(size)} gallons</span>
              </OptionTile>
            ))}
          </div>
        </OptionGroup>
        <OptionGroup legend="How many cans?" className="rise-3">
          {/* Three or four counts, depending on the can size: fill the row either way. */}
          <div className={cx('grid gap-2.5', counts.length === 3 ? 'grid-cols-3' : 'grid-cols-4')}>
            {counts.map((count) => (
              <OptionTile
                key={count}
                selected={draft.keke.can_count === count}
                tick={false}
                onSelect={() => update((d) => ({ delivery_type: 'keke', keke: { ...d.keke, can_count: count } }))}
                className="px-1 py-3"
              >
                <span className="text-[19px] font-extrabold">{count}</span>
                <span className="text-tab text-mute">cans</span>
              </OptionTile>
            ))}
          </div>
        </OptionGroup>
        <Card pad className="rise-4">
          <SectionHeader title="Order summary" className="mb-2" />
          <div className="flex items-center gap-3">
            <Illustration name="keke" className="animate-drive h-auto w-[118px] shrink-0" />
            <div className="flex-1">
              <KeyValue label="Water size" value={`${draft.keke.can_size_litres} litres per can`} />
              <KeyValue label="Quantity" value={`${draft.keke.can_count} cans`} />
              {keke && <KeyValue label="Total water" value={describeQuantity(kekeTotalLitres(keke))} />}
            </div>
          </div>
        </Card>
        <PriceComesLater className="rise-5" />
      </ScrollArea>
      <Footer>
        <ButtonLink to={addressStepPath(addresses.data)}>Continue</ButtonLink>
      </Footer>
    </MobileShell>
  )
}
