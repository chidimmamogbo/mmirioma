import { Illustration } from '../../../../components/brand/Illustration'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../../components/layout/MobileShell'
import { ErrorBlock } from '../../../../components/layout/StateScreens'
import { ButtonLink } from '../../../../components/ui/Button'
import { Card } from '../../../../components/ui/Card'
import { SampleTag } from '../../../../components/ui/Chip'
import { OptionTile } from '../../../../components/ui/Choice'
import { KeyValue, SectionHeader, Separator } from '../../../../components/ui/Content'
import { CAN_SIZES, canCountsFor, fitCanCount, kekeTotalLitres } from '../../../../domain/orders'
import { formatNaira } from '../../../../lib/format/money'
import { OptionGroup, OrderStepHeading, SummaryTotal } from '../../components/OrderParts'
import { draftChoice } from '../../order/draft'
import { addressStepPath } from '../../order/flow'
import { useOrderDraft } from '../../order/orderDraftContext'
import { useAddresses, useQuote } from '../../queries'

/**
 * Keke order: jerrycan size and number of cans (`c-keke`). No water source
 * question for Keke (decision 10).
 * The price comes from the server (FR-022). Without an address there is no
 * delivery fee yet, so the summary shows the water price and says the
 * delivery fee follows (decision 10).
 */
export function KekeOrder() {
  const { draft, update } = useOrderDraft()
  const addresses = useAddresses()
  const choice = draftChoice({ ...draft, delivery_type: 'keke' })
  const quote = useQuote(choice, null)
  const q = quote.data?.status === 'quote_available' ? quote.data : undefined
  const keke = choice.delivery_type === 'keke' ? choice : null

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
              </OptionTile>
            ))}
          </div>
        </OptionGroup>
        <OptionGroup legend="How many cans?" className="rise-3">
          <div className="grid grid-cols-4 gap-2.5">
            {canCountsFor(draft.keke.can_size_litres).map((count) => (
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
        {quote.isError ? (
          <ErrorBlock error={quote.error} onRetry={() => quote.refetch()} />
        ) : (
          <Card pad className="rise-4">
            <SectionHeader title="Order summary" action={<SampleTag>SAMPLE PRICES</SampleTag>} className="mb-2" />
            <div className="flex items-center gap-3">
              <Illustration name="keke" className="animate-drive h-auto w-[118px] shrink-0" />
              <div className="flex-1">
                <KeyValue label="Water size" value={`${draft.keke.can_size_litres} litres`} />
                <KeyValue label="Quantity" value={`${draft.keke.can_count} cans`} />
                {keke && <KeyValue label="Total water" value={`${kekeTotalLitres(keke).toLocaleString('en-NG')} L`} />}
                <KeyValue label="Price per can" value={q?.water.unit_minor_units !== undefined ? formatNaira(q.water.unit_minor_units) : '…'} />
                <KeyValue label="Delivery" value={<span className="font-semibold text-mute">After address</span>} />
              </div>
            </div>
            <Separator />
            <SummaryTotal quote={quote.data} label="Water total" loading={quote.isFetching} />
          </Card>
        )}
      </ScrollArea>
      <Footer>
        <ButtonLink to={addressStepPath(addresses.data)}>Continue</ButtonLink>
      </Footer>
    </MobileShell>
  )
}
