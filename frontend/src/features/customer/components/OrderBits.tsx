import { Illustration } from '../../../components/brand/Illustration'
import { CheckIcon } from '../../../components/icons/icons'
import { CardLink } from '../../../components/ui/Card'
import { Chip, type ChipTone } from '../../../components/ui/Chip'
import { STAGE_LABEL, describeChoice, shortReference, type CustomerOrder, type DeliveryStage } from '../../../domain/orders'
import { formatDate, formatTime } from '../../../lib/format/datetime'
import { orderIllustration, orderLink, orderPlaceLabel, orderPriceText, orderQuantityText, orderWhen } from '../orderHelpers'

const STAGE_TONE: Record<DeliveryStage, ChipTone> = {
  waiting_rider: 'amber',
  rider_assigned: 'blue',
  picked_up: 'blue',
  on_the_way: 'blue',
  delivered: 'green',
  cancelled: 'red',
  failed: 'red',
  under_review: 'amber',
  order_update: 'amber',
}

/** Delivery stage chip: colour plus words (and a tick when delivered). */
export function StageChip({ stage, className }: { stage: DeliveryStage; className?: string }) {
  return (
    <Chip
      tone={STAGE_TONE[stage]}
      className={className}
      icon={stage === 'delivered' ? <CheckIcon size={12} strokeWidth={3} roundJoin={false} /> : undefined}
    >
      {STAGE_LABEL[stage]}
    </Chip>
  )
}

/** Order card of the "My orders" list (`c-orders`). */
export function OrderListCard({ order, className }: { order: CustomerOrder; className?: string }) {
  const choice = order.choice
  const keke = choice?.delivery_type === 'keke'
  const title =
    choice?.delivery_type === 'tanker' && choice.tank_size_gallons !== null
      ? `${describeChoice(choice)}, ${choice.tank_type}`
      : orderQuantityText(order)
  return (
    <CardLink to={orderLink(order)} className={`flex items-center gap-3 p-3 ${className ?? ''}`}>
      <span className={`flex h-16 w-[82px] shrink-0 items-center justify-center rounded-icon ${keke ? 'bg-sky' : 'bg-mint'}`}>
        <Illustration name={orderIllustration(order)} className="w-[70px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-extrabold">{title}</span>
        <span className="text-chip text-mute">{orderWhen(order)}</span>
        <span className="text-chip text-mute">
          {shortReference(order.reference)} · {orderPlaceLabel(order)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <StageChip stage={order.stage} className="px-2 py-[3px]" />
        <span className="font-extrabold">{orderPriceText(order)}</span>
      </span>
    </CardLink>
  )
}

/** Compact recent-order card on the home screen (`c-home`). */
export function RecentOrderCard({ order }: { order: CustomerOrder }) {
  return (
    <CardLink to={orderLink(order)} className="flex items-center gap-3 p-3">
      <span className="flex size-[54px] shrink-0 items-center justify-center rounded-icon bg-sky">
        <Illustration name={orderIllustration(order, 'jerrycan')} className="h-10 w-auto max-w-[46px] object-contain" />
      </span>
      <span className="flex flex-1 flex-col leading-[1.35]">
        <span className="font-extrabold">{orderQuantityText(order)}</span>
        <span className="text-chip text-mute">
          {formatDate(order.created_at)} · {formatTime(order.created_at)} · {orderPlaceLabel(order)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <StageChip stage={order.stage} />
        <span className="font-extrabold">{orderPriceText(order)}</span>
      </span>
    </CardLink>
  )
}
