import { useNavigate, useParams } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { DownloadIcon, RefreshIcon } from '../../../components/icons/icons'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { KeyValue, Separator } from '../../../components/ui/Content'
import { IconLink } from '../../../components/ui/IconButton'
import { STAGE_LABEL, isProblemStage, type CustomerOrder } from '../../../domain/orders'
import { cx } from '../../../lib/cx'
import { formatShortDate, formatTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import { useOrderDraft } from '../order/orderDraftContext'
import { draftFromOrder } from '../order/reorder'
import { PAYMENT_LABEL, PRICE_PENDING, orderIllustration, orderQuantityText } from '../orderHelpers'
import { useAddresses, useOrder } from '../queries'
import { POINTS_ENABLED } from '../../../lib/features'

function paymentText(o: CustomerOrder): string {
  const method = o.payment.method === 'bank_transfer' ? 'Bank transfer' : o.payment.method === 'cash' ? 'Cash' : 'Pay on delivery'
  // No status is sent to customers yet (docs/api/orders.md, decided question 3): the method only.
  if (o.payment.status === null) return method
  if (o.payment.status === 'paid') return `${method}, confirmed`
  return `${method}, ${PAYMENT_LABEL[o.payment.status].toLowerCase()}`
}

/** Order details with timeline and reorder (`c-order-detail`). */
export function OrderDetail() {
  const { reference = '' } = useParams()
  const navigate = useNavigate()
  const order = useOrder(reference)
  const addresses = useAddresses()
  const { reset } = useOrderDraft()
  const o = order.data

  function reorder() {
    if (!o) return
    reset(draftFromOrder(o, addresses.data ?? []))
    navigate('/order/review')
  }

  const keke = o?.choice?.delivery_type === 'keke'
  return (
    <MobileShell>
      <TopBar
        left={<BackLink to="/orders" />}
        center={<span className="text-[16px] font-extrabold">{reference}</span>}
        right={
          <IconLink to={`/orders/${reference}/receipt`} label="Download receipt">
            <DownloadIcon size={22} />
          </IconLink>
        }
      />
      <ScrollArea className="gap-3">
        {order.isPending && <LoadingBlock label="Loading your order" />}
        {order.isError && <ErrorBlock error={order.error} onRetry={() => order.refetch()} />}
        {o && (
          <>
            <div
              className={cx(
                'rise-1 flex items-center gap-2.5 overflow-hidden rounded-[22px] px-4 py-3.5',
                keke ? 'bg-[linear-gradient(160deg,#EEF6FF,#DCEBFD)]' : 'bg-[linear-gradient(160deg,#E7F7EE,#CDEFDC)]',
              )}
            >
              <div className="flex-1">
                <div className="text-[18px] font-extrabold">{orderQuantityText(o)}</div>
                {o.choice && (
                  <div className="text-[13px] text-slate">
                    {o.choice.delivery_type === 'tanker'
                      ? `${o.choice.tank_type === 'overhead' ? 'Overhead' : 'Ground'} tank · Tanker`
                      : 'Jerrycans · Keke'}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip
                    tone={o.stage === 'delivered' ? 'green' : isProblemStage(o.stage) ? 'red' : o.stage === 'under_review' ? 'amber' : 'blue'}
                    className="bg-white"
                  >
                    {o.stage === 'delivered' ? '✓ ' : ''}
                    {STAGE_LABEL[o.stage]}
                  </Chip>
                  {o.payment.status !== null && (
                    <Chip tone={o.payment.status === 'paid' ? 'blue' : o.payment.status === 'refund_due' ? 'red' : 'gray'} className="bg-white">
                      ₦ {PAYMENT_LABEL[o.payment.status]}
                    </Chip>
                  )}
                </div>
              </div>
              <Illustration name={orderIllustration(o)} className="animate-drive mr-[-20px] w-[150px]" />
            </div>

            <Card pad className="rise-2">
              <h2 className="m-0 mb-2.5 text-section font-extrabold">Timeline</h2>
              <ol className="m-0 flex list-none flex-col p-0">
                {o.timeline.map((t, i) => {
                  const last = i === o.timeline.length - 1
                  const finished = last && (o.stage === 'delivered' || isProblemStage(o.stage))
                  return (
                    <li key={`${t.label}-${t.at}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cx('size-3.5 rounded-full', finished ? (isProblemStage(o.stage) ? 'bg-[#DC2626]' : 'bg-[#16A34A]') : 'bg-primary')}
                        />
                        {!last && <span className="min-h-[22px] w-0.5 flex-1 bg-primary" />}
                      </div>
                      <div className={last ? undefined : 'pb-2.5'}>
                        <div className="text-sub font-bold">{t.label}</div>
                        <div className="text-chip text-mute">
                          {i === 0 ? `${formatShortDate(t.at)}, ${formatTime(t.at)}` : formatTime(t.at)}
                          {t.detail ? ` · ${t.detail}` : ''}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>

            <Card pad className="rise-3">
              <KeyValue label="Deliver to" value={o.address_label ? `${o.address_label} · ${o.address.split(',')[0]}` : o.address} />
              <KeyValue label="Payment" value={paymentText(o)} />
              {/* The server sends the total only (order-details-and-price.md, decision 6); only mock orders have lines. */}
              {o.quote?.water && (
                <KeyValue label={o.quote.water.label.startsWith('Water (') ? o.quote.water.label : 'Water'} value={formatNaira(o.quote.water.amount_minor_units)} />
              )}
              {o.quote?.delivery && <KeyValue label={o.quote.delivery.label} value={formatNaira(o.quote.delivery.amount_minor_units)} />}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-extrabold">Total</span>
                <span className="text-[20px] font-extrabold text-primary-dark">{o.quote ? formatNaira(o.quote.total_minor_units) : PRICE_PENDING}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                {o.quote?.is_sample ? <SampleTag>SAMPLE PRICES</SampleTag> : <span />}
                {POINTS_ENABLED && o.points_earned !== null && <span className="text-caption font-bold text-gold-ink">+{o.points_earned} points earned</span>}
              </div>
            </Card>
          </>
        )}
      </ScrollArea>
      <Footer row className="gap-2.5">
        <ButtonLink to={`/support?order=${reference}`} variant="line" className="flex-1">
          Get help
        </ButtonLink>
        <Button onClick={reorder} disabled={!o} className="flex-[1.4]">
          <RefreshIcon size={18} strokeWidth={2.2} />
          Reorder
        </Button>
      </Footer>
    </MobileShell>
  )
}
