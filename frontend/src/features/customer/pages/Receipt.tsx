import { useParams } from 'react-router-dom'
import { Logo } from '../../../components/brand/Logo'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar, TopBarSpacer, TopBarTitle } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { SampleTag } from '../../../components/ui/Chip'
import { KeyValue, Separator } from '../../../components/ui/Content'
import { STAGE_LABEL, WATER_SOURCE_LABEL, describeChoice } from '../../../domain/orders'
import { formatDateTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import { formatPhone } from '../../../lib/format/phone'
import { PAYMENT_LABEL } from '../orderHelpers'
import { useOrder } from '../queries'

/**
 * Receipt for an order, behind the "Download receipt" button on
 * `c-order-detail`. Not in the handoff. "Save or print" uses the phone's own
 * print dialog, which can save a PDF, so no PDF library is needed.
 */
export function Receipt() {
  const { reference = '' } = useParams()
  const order = useOrder(reference)
  const o = order.data
  return (
    <MobileShell>
      <TopBar
        className="print:hidden"
        left={<BackLink to={`/orders/${reference}`} />}
        center={<TopBarTitle>Receipt</TopBarTitle>}
        right={<TopBarSpacer />}
      />
      <ScrollArea className="gap-3">
        {order.isPending && <LoadingBlock lines={2} />}
        {order.isError && <ErrorBlock error={order.error} onRetry={() => order.refetch()} />}
        {o && (
          <Card pad className="rise-1">
            <div className="mb-3 flex items-center justify-between">
              <Logo height={30} />
              {o.quote.is_sample && <SampleTag>SAMPLE</SampleTag>}
            </div>
            <KeyValue label="Order" value={o.reference} />
            <KeyValue label="Placed" value={formatDateTime(o.created_at)} />
            {o.delivered_at && <KeyValue label="Delivered" value={formatDateTime(o.delivered_at)} />}
            <KeyValue label="Status" value={STAGE_LABEL[o.stage]} />
            <Separator />
            <KeyValue label="Water" value={describeChoice(o.choice)} />
            {o.choice.delivery_type === 'tanker' && <KeyValue label="Source" value={WATER_SOURCE_LABEL[o.choice.source]} />}
            {o.delivered_quantity && <KeyValue label="Delivered quantity" value={o.delivered_quantity} />}
            <KeyValue label="Deliver to" value={o.address} />
            <KeyValue label="Receiver" value={`${o.receiver_name} · ${formatPhone(o.receiver_phone)}`} />
            <Separator />
            <KeyValue label={o.quote.water.label} value={formatNaira(o.quote.water.amount_minor_units)} />
            {o.quote.delivery && <KeyValue label={o.quote.delivery.label} value={formatNaira(o.quote.delivery.amount_minor_units)} />}
            <div className="flex items-center justify-between pt-1">
              <span className="font-extrabold">Total</span>
              <span className="text-[20px] font-extrabold text-primary-dark">{formatNaira(o.quote.total_minor_units)}</span>
            </div>
            <KeyValue label="Payment" value={PAYMENT_LABEL[o.payment.status]} />
            <p className="mt-3 mb-0 text-chip text-mute">
              Payment is marked paid only after our team confirms it. Times are Lagos time.
            </p>
          </Card>
        )}
      </ScrollArea>
      <Footer className="print:hidden">
        <Button onClick={() => window.print()} disabled={!o}>
          Save or print
        </Button>
      </Footer>
    </MobileShell>
  )
}
