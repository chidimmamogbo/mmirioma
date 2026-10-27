import { useState } from 'react'
import { MobileShell, ScrollArea } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { ButtonLink } from '../../../components/ui/Button'
import { ScreenHeading } from '../../../components/ui/Content'
import { Pills } from '../../../components/ui/Controls'
import { isActiveStage, type CustomerOrder } from '../../../domain/orders'
import { APP_TIME_ZONE } from '../../../lib/format/datetime'
import { CustomerTabs, CustomerTopBar } from '../components/CustomerChrome'
import { OrderListCard } from '../components/OrderBits'
import { useOrders } from '../queries'

type Filter = 'all' | 'active' | 'delivered' | 'cancelled'

const MATCH: Record<Filter, (o: CustomerOrder) => boolean> = {
  all: () => true,
  active: (o) => isActiveStage(o.stage),
  delivered: (o) => o.stage === 'delivered',
  cancelled: (o) => o.stage === 'cancelled',
}

/** "7 orders since August" from the oldest order. */
function countLine(orders: CustomerOrder[]): string {
  if (orders.length === 0) return 'No orders yet'
  const oldest = orders[orders.length - 1].created_at
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: APP_TIME_ZONE }).format(new Date(oldest))
  return `${orders.length} order${orders.length === 1 ? '' : 's'} since ${monthName}`
}

/** My orders (`c-orders`). */
export function Orders() {
  const orders = useOrders()
  const [filter, setFilter] = useState<Filter>('all')
  const list = (orders.data ?? []).filter(MATCH[filter])
  const anySample = orders.data?.some((o) => o.quote?.is_sample)

  return (
    <MobileShell>
      <CustomerTopBar bell={false} />
      <ScrollArea className="gap-3">
        <ScreenHeading className="rise-1" title="My orders" sub={orders.data ? countLine(orders.data) : ' '} />
        <Pills
          className="rise-2"
          wrap={false}
          label="Filter orders"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'delivered', label: 'Delivered' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        {orders.isPending && <LoadingBlock label="Loading your orders" />}
        {orders.isError && <ErrorBlock error={orders.error} onRetry={() => orders.refetch()} />}
        {orders.isSuccess && list.map((o) => <OrderListCard key={o.reference} order={o} className="rise-3" />)}
        {orders.isSuccess && list.length === 0 && (
          <EmptyBlock
            illustration="keke"
            title={filter === 'all' ? 'No orders yet' : `No ${filter} orders`}
            text={filter === 'all' ? 'When you order water, it shows here.' : 'Try another filter.'}
            action={filter === 'all' ? <ButtonLink to="/order">Order water</ButtonLink> : undefined}
          />
        )}
        {anySample && list.length > 0 && <p className="m-0 text-center text-chip text-mute">Amounts are samples.</p>}
      </ScrollArea>
      <CustomerTabs current="/orders" />
    </MobileShell>
  )
}
