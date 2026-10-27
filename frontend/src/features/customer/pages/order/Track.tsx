import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { MapBadge, MapControl, MapFrame, MapPin, TrackMapArt } from '../../../../components/art/Art'
import { Illustration } from '../../../../components/brand/Illustration'
import { CheckIcon, HelpCircleIcon, LockIcon, MessageSquareIcon, PhoneIcon } from '../../../../components/icons/icons'
import { BackLink, MobileShell, ScrollArea, TopBar } from '../../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../../components/layout/StateScreens'
import { Avatar } from '../../../../components/ui/Avatar'
import { Card } from '../../../../components/ui/Card'
import { IconBadge, ScreenHeading } from '../../../../components/ui/Content'
import { IconLink } from '../../../../components/ui/IconButton'
import { choiceLitres, isActiveStage, type CustomerOrder } from '../../../../domain/orders'
import { orderIllustration, orderQuantityText } from '../../orderHelpers'
import { describeQuantity } from '../../../../domain/quantity'
import { USE_MOCKS } from '../../../../lib/api/mode'
import { cx } from '../../../../lib/cx'
import { useDemoAdvance, useOrder } from '../../queries'

const STEPS = ['Picked up', 'On the way', 'Near you', 'Delivered'] as const

/**
 * Which tracker step is current: -1 before pickup. "Near you" has no order
 * status of its own; it lights up only when the partner's estimate says they
 * are 3 minutes away or less (decision 14: no invented progress).
 */
function currentStep(o: CustomerOrder): number {
  switch (o.stage) {
    case 'picked_up':
      return 0
    case 'on_the_way':
      return o.eta_minutes !== null && o.eta_minutes <= 3 ? 2 : 1
    case 'delivered':
      return 3
    default:
      return -1
  }
}

function headline(o: CustomerOrder): { title: string; sub: string } {
  const first = o.partner?.name.split(' ')[0]
  // An order sent before #21 has no cans or tank, only the server's litres (FR-021).
  const litres = o.choice ? choiceLitres(o.choice) : (o.quantity_litres ?? null)
  const qty =
    o.delivered_quantity ??
    (litres !== null ? describeQuantity(litres, o.choice?.delivery_type === 'tanker' ? 'gallons' : 'litres', 'short') : orderQuantityText(o, 'short'))
  switch (o.stage) {
    // Before confirmation no rider is looked for yet (FR-027; customer-live-prices.md, screen 6).
    case 'request_received':
      return { title: 'Request received', sub: "We're preparing your price." }
    case 'awaiting_confirmation':
      return { title: 'Awaiting confirmation', sub: "We'll call you to agree the delivery time." }
    case 'waiting_rider':
      return { title: 'Finding a rider', sub: 'You will see them here the moment one accepts.' }
    case 'rider_assigned':
      return { title: 'Rider on the way to the station', sub: `${o.partner?.name ?? 'Your rider'} accepted your order.` }
    case 'picked_up':
      return { title: 'Water collected', sub: `${first ?? 'Your rider'} collected ${qty} at ${o.station_name ?? 'the refill station'}.` }
    case 'on_the_way':
      return { title: 'Your water is on the way', sub: `${first ?? 'Your rider'} collected ${qty} at ${o.station_name ?? 'the refill station'}.` }
    default:
      return { title: 'Order update', sub: '' }
  }
}

/** Delivery tracking with the delivery code (`c-track`). */
export function Track() {
  const { reference = '' } = useParams()
  const navigate = useNavigate()
  const order = useOrder(reference)
  const demo = useDemoAdvance(reference)
  const o = order.data

  if (o?.stage === 'delivered') return <Navigate to={`/orders/${reference}/delivered`} replace />
  // Cancelled, failed or under review: nothing to track, so show the order detail.
  if (o && !isActiveStage(o.stage)) return <Navigate to={`/orders/${reference}`} replace />

  const step = o ? currentStep(o) : -1
  const h = o ? headline(o) : null
  const hasRider = Boolean(o?.partner) && o?.stage !== 'waiting_rider'

  return (
    <MobileShell>
      <TopBar
        left={<BackLink to="/orders" />}
        right={
          <IconLink to={`/support?order=${reference}`} label="Get help">
            <HelpCircleIcon size={22} roundJoin={false} />
          </IconLink>
        }
      />
      <ScrollArea className="gap-3 pt-3.5">
        {order.isPending && <LoadingBlock label="Loading your delivery" />}
        {order.isError && <ErrorBlock error={order.error} onRetry={() => order.refetch()} />}
        {o && h && (
          <>
            <ScreenHeading className="rise-1" titleClassName="text-[22px]" title={h.title} sub={h.sub} />
            <ol aria-label="Delivery progress" className="rise-2 relative m-0 grid list-none grid-cols-4 p-0">
              {STEPS.map((label, i) => {
                const done = i < step || (i === step && i === 3)
                const current = i === step && i !== 3
                return (
                  <li
                    key={label}
                    aria-current={current ? 'step' : undefined}
                    className={cx(
                      'relative flex flex-col items-center gap-1 text-tab',
                      done ? 'font-bold text-primary-dark' : current ? 'font-extrabold text-ink' : 'font-semibold text-mute',
                    )}
                  >
                    {done ? (
                      <span className="z-[1] flex size-6 items-center justify-center rounded-full bg-primary">
                        <CheckIcon size={12} strokeWidth={3.4} color="#fff" roundJoin={false} />
                      </span>
                    ) : current ? (
                      <span className="glow z-[1] box-border size-6 rounded-full border-[7px] border-primary bg-white" />
                    ) : (
                      <span className="z-[1] box-border size-6 rounded-full border-2 border-ring-line bg-white" />
                    )}
                    {label}
                    <span className="sr-only">{done ? ' (done)' : current ? ' (now)' : ''}</span>
                    {i < STEPS.length - 1 && (
                      <span aria-hidden="true" className={cx('absolute top-[11px] right-[-50%] left-1/2 h-[3px]', i < step ? 'bg-primary' : 'bg-[#DCE5F0]')} />
                    )}
                  </li>
                )
              })}
            </ol>
            <MapFrame height={268} className="rise-3">
              <TrackMapArt />
              {hasRider && (
                <Illustration
                  name={orderIllustration(o)}
                  alt={o.choice ? (o.choice.delivery_type === 'keke' ? "Rider's keke" : "Driver's tanker") : 'Delivery partner'}
                  className="animate-drive absolute top-[48%] left-[37%] w-[76px] drop-shadow-[0_6px_8px_rgba(10,37,64,0.25)]"
                />
              )}
              <MapPin color="#DC2626" ringColor="rgba(220,38,38,.35)" ringSize={20} className="absolute top-[34px] left-[76%]" />
              {o.eta_minutes !== null && (
                <MapBadge className="right-3 bottom-3.5 text-[14px]">
                  {o.eta_minutes} min away
                </MapBadge>
              )}
              <MapControl style={{ top: 10 }} />
            </MapFrame>
            {hasRider && o.partner && (
              <Card className="rise-4 flex items-center gap-3 px-3.5 py-3">
                <Avatar name={o.partner.name} size={48} fontSize={15} />
                <div className="flex-1">
                  <div className="font-extrabold">{o.partner.name}</div>
                  <div className="text-caption text-mute">
                    {o.partner.rating !== null && (
                      <>
                        <span className="text-gold-icon">★</span> {o.partner.rating.toFixed(1)} ·{' '}
                      </>
                    )}
                    {o.partner.vehicle === 'keke' ? 'Keke' : 'Tanker'} · {o.partner.plate}
                  </div>
                </div>
                <a
                  href={`sms:${o.partner.phone}`}
                  aria-label={`Message ${o.partner.vehicle === 'keke' ? 'rider' : 'driver'}`}
                  className="flex size-11 items-center justify-center rounded-icon bg-sky text-primary-dark hover:text-primary-dark"
                >
                  <MessageSquareIcon size={20} />
                </a>
                <a
                  href={`tel:${o.partner.phone}`}
                  aria-label={`Call ${o.partner.vehicle === 'keke' ? 'rider' : 'driver'}`}
                  className="flex size-11 items-center justify-center rounded-icon bg-green-bg text-green hover:text-green"
                >
                  <PhoneIcon size={20} />
                </a>
              </Card>
            )}
            {o.delivery_code && (
              <div className="rise-5 flex items-center gap-3 rounded-stat border-2 border-dashed border-gold bg-[#FFFBEF] px-3.5 py-3">
                <IconBadge tone="gold">
                  <LockIcon size={20} />
                </IconBadge>
                <div className="flex-1">
                  <div className="text-chip font-bold text-[#6B5210]">Delivery code · give it after the water is in</div>
                  <div className="text-[22px] font-extrabold tracking-[6px] text-ink" aria-label={`Delivery code ${o.delivery_code.split('').join(' ')}`}>
                    {o.delivery_code.slice(0, 3)} {o.delivery_code.slice(3)}
                  </div>
                </div>
              </div>
            )}
            {USE_MOCKS && (
              <button
                type="button"
                disabled={demo.isPending}
                onClick={() => demo.mutate('delivered', { onSuccess: () => navigate(`/orders/${reference}/delivered`) })}
                className="cursor-pointer border-0 bg-transparent text-center text-[13px] font-bold text-primary"
              >
                Demo: see delivered screen
              </button>
            )}
          </>
        )}
      </ScrollArea>
    </MobileShell>
  )
}
