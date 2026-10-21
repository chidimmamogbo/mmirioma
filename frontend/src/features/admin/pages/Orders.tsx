import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { DataTable } from '../../../components/ui/Admin'
import { Avatar } from '../../../components/ui/Avatar'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { RadioRow } from '../../../components/ui/Choice'
import { Chip } from '../../../components/ui/Chip'
import { KeyValue } from '../../../components/ui/Content'
import { Pills } from '../../../components/ui/Controls'
import { TextAreaField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { AdminOrder, AdminOrderFilter } from '../../../domain/admin'
import { describeChoice } from '../../../domain/orders'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatDateTime, formatTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import { formatPhone } from '../../../lib/format/phone'
import * as api from '../adminApi'
import { METHOD_LABEL, revealDetail } from '../adminFormat'
import { AdminFrame, PageHead, PaymentChip, SplitLayout, StatusChip } from '../AdminParts'
import { useAdminMutation, useAdminOrder, useAdminOrders, useEligibleRiders } from '../queries'

const FILTERS: { value: AdminOrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'awaiting_rider', label: 'Awaiting rider' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

/**
 * Orders and rider assignment (`a-orders`). Selecting a row opens the side
 * panel: assign or reassign a rider while the water has not been collected,
 * the order's details, and cancel with a reason. `?ref=` selects an order and
 * `?q=` searches (links from the dashboard and header search).
 */
export function Orders() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<AdminOrderFilter>('all')
  const query = params.get('q') ?? ''
  const list = useAdminOrders(filter, query)
  const orders = list.data?.orders ?? []
  const picked = params.get('ref')
  const created = params.get('created')
  const selected = picked ?? orders.find((o) => o.status === 'awaiting_rider')?.reference ?? orders[0]?.reference ?? null

  function select(reference: string) {
    const next = new URLSearchParams(params)
    next.set('ref', reference)
    setParams(next, { replace: true })
  }

  function open(reference: string) {
    select(reference)
    revealDetail()
  }

  return (
    <AdminFrame
      searchPlaceholder="Search by order number, customer or phone"
      onSearch={(q) => {
        const next = new URLSearchParams(params)
        if (q) next.set('q', q)
        else next.delete('q')
        next.delete('ref')
        setParams(next, { replace: true })
      }}
    >
      <SplitLayout
        sideWidth="lg:w-[380px]"
        main={
          <>
            <PageHead
              title="Orders"
              sub={query ? `Results for “${query}”. Select an order to assign or reassign a rider.` : 'Select an order to assign or reassign a rider.'}
              actions={
                <ButtonLink to="/admin/orders/new" size="sm" block={false}>
                  + Create order for a customer
                </ButtonLink>
              }
            />
            {created && (
              <Notice tone="success">
                Order {created} created and offered to eligible riders. Select it below to assign someone instead.
              </Notice>
            )}
            <Pills
              className="rise-2"
              label="Filter orders"
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({ value: f.value, label: `${f.label}${list.data ? ` (${list.data.counts[f.value]})` : ''}` }))}
            />
            {list.isPending && <LoadingBlock label="Loading orders" />}
            {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
            {list.isSuccess && (
              <Card className="rise-3 overflow-x-auto px-1 py-1.5">
                <DataTable<AdminOrder>
                  caption="Orders"
                  rows={orders}
                  rowKey={(o) => o.reference}
                  selectedKey={selected ?? undefined}
                  empty={query ? 'No orders match your search.' : 'No orders here yet.'}
                  columns={[
                    {
                      header: 'Order',
                      cell: (o) => (
                        <button type="button" onClick={() => open(o.reference)} className="hit-44 cursor-pointer border-0 bg-transparent p-0 font-extrabold text-primary-dark">
                          {o.reference}
                        </button>
                      ),
                    },
                    { header: 'Customer', cell: (o) => o.customer_name },
                    { header: 'Area', cell: (o) => o.area },
                    { header: 'Type', cell: (o) => (o.choice.delivery_type === 'keke' ? 'Keke' : 'Tanker'), className: 'font-bold' },
                    { header: 'Quantity', cell: (o) => o.quantity },
                    { header: 'Payment', cell: (o) => <PaymentChip status={o.payment.status} /> },
                    { header: 'Status', cell: (o) => <StatusChip status={o.status} /> },
                    { header: 'Rider', cell: (o) => o.partner?.code ?? <span className="text-mute">None yet</span> },
                  ]}
                />
              </Card>
            )}
            <p className="m-0 text-caption text-mute">Payment status and delivery status are tracked separately. Sample data.</p>
          </>
        }
        side={selected ? <OrderPanel key={selected} reference={selected} onChange={() => select(selected)} /> : null}
      />
    </AdminFrame>
  )
}

/**
 * Side panel for one order: assign, details, cancel. `onChange` pins the
 * order in the address first, so the panel stays on it after the list
 * changes (otherwise it would jump to the next waiting order).
 */
function OrderPanel({ reference, onChange }: { reference: string; onChange: () => void }) {
  const order = useAdminOrder(reference)
  const o = order.data
  if (order.isPending) return <Card className="p-4"><LoadingBlock lines={3} label="Loading the order" /></Card>
  if (order.isError || !o) return <Card className="p-4"><ErrorBlock error={order.error} onRetry={() => order.refetch()} /></Card>
  const canAssign = o.status === 'awaiting_rider' || o.status === 'assigned' || o.status === 'loading'
  const closed = o.status === 'delivered' || o.status === 'cancelled'
  return (
    <>
      <Card className="rise-2 flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[20px] font-extrabold">{o.status === 'awaiting_rider' ? 'Assign a rider' : canAssign ? 'Reassign the rider' : 'Order details'}</h2>
          <StatusChip status={o.status} />
        </div>
        <div className="flex items-center gap-3 rounded-card bg-[linear-gradient(160deg,#EEF6FF,#DCEBFD)] px-3.5 py-3">
          <Illustration name={o.choice.delivery_type} className="w-24 shrink-0" />
          <div className="min-w-0">
            <div className="font-extrabold">{o.reference}</div>
            <div className="text-caption text-slate">
              {o.choice.delivery_type === 'keke' ? 'Keke' : 'Tanker'} · {describeChoice(o.choice)}
            </div>
            <div className="text-caption text-slate">
              {o.customer_name} · {o.area}
            </div>
          </div>
        </div>
        {o.partner && (
          <KeyValue
            label={o.status === 'assigned' ? 'Assigned to' : 'Rider'}
            value={
              <span>
                {o.partner.name} · {o.partner.code}
                {o.status === 'assigned' && <span className="block text-right text-chip text-mute">Waiting for them to start</span>}
              </span>
            }
          />
        )}
        {canAssign && <AssignRiders order={o} onBefore={onChange} />}
        {o.status === 'on_the_way' && (
          <Notice>The water is on its way with {o.partner?.name ?? 'the rider'}. To change anything now, use Support (for example, confirm the delivery if the code fails).</Notice>
        )}
      </Card>
      <Card className="flex flex-col gap-1 p-4 text-[13.5px]">
        <h3 className="m-0 mb-1 text-[15px] font-extrabold">Details</h3>
        <KeyValue label="Customer" value={`${o.customer_name} · ${formatPhone(o.customer_phone)}`} />
        <KeyValue label="Deliver to" value={o.address} />
        {o.landmark && <KeyValue label="Landmark" value={o.landmark} />}
        <KeyValue label="Station" value={o.station_name || 'Chosen when a rider accepts'} />
        <KeyValue label="Amount" value={o.total_minor_units === null ? 'Quote needed' : `${formatNaira(o.total_minor_units)} (SAMPLE)`} />
        <KeyValue label="Payment" value={<span className="flex items-center justify-end gap-2">{METHOD_LABEL[o.payment.method]} <PaymentChip status={o.payment.status} /></span>} />
        {o.instructions && <KeyValue label="Instructions" value={o.instructions} />}
        {o.tank_note && <KeyValue label="Tank" value={o.tank_note} />}
        <h3 className="m-0 mt-2 mb-1 text-[15px] font-extrabold">Timeline</h3>
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {o.timeline.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <b>{t.label}</b> · {formatTime(t.at)}
              {t.detail && <span className="text-mute"> · {t.detail}</span>}
            </li>
          ))}
        </ol>
        <p className="mt-1 mb-0 text-chip text-mute">Placed {formatDateTime(o.created_at)}</p>
      </Card>
      {!closed && <CancelOrder reference={o.reference} onBefore={onChange} />}
      {o.payment.status === 'awaiting_verification' && (
        <Notice tone="note">
          This customer's transfer is waiting for a check.{' '}
          <Link to="/admin/payments" className="font-bold text-primary no-underline hover:text-primary-dark">
            Go to payments
          </Link>
        </Notice>
      )}
    </>
  )
}

function AssignRiders({ order, onBefore }: { order: AdminOrder; onBefore: () => void }) {
  const riders = useEligibleRiders(order.reference, true)
  const assign = useAdminMutation((partnerId: string) => api.assignOrder(order.reference, partnerId))
  const [pick, setPick] = useState<string | null>(null)
  const list = riders.data ?? []
  const chosen = list.find((r) => r.id === (pick ?? list[0]?.id))
  const kind = order.choice.delivery_type === 'keke' ? 'Keke riders' : 'tanker drivers'

  if (assign.isSuccess && !assign.isPending) {
    return <Notice tone="success">Assigned. {chosen?.name.split(' ')[0] ?? 'The rider'} gets the order on their dashboard and must start it or decline with a reason.</Notice>
  }
  return (
    <>
      <h3 className="m-0 text-[14px] font-extrabold">Eligible {kind}</h3>
      {riders.isPending && <LoadingBlock lines={2} label="Finding riders" />}
      {riders.isError && <ErrorBlock error={riders.error} onRetry={() => riders.refetch()} />}
      {riders.isSuccess && list.length === 0 && (
        <Notice>No approved {kind} can take this order right now (vehicle, tank size or an earlier decline). It stays in the pool.</Notice>
      )}
      <div role="radiogroup" aria-label={`Eligible ${kind}`} className="flex flex-col gap-2">
        {list.map((r) => (
          <RadioRow key={r.id} checked={chosen?.id === r.id} onSelect={() => setPick(r.id)}>
            <Avatar name={r.name} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{r.name}</span>
              <span className="block text-caption text-mute">
                {r.vehicle === 'keke' ? 'Keke' : 'Tanker'}
                {r.rating !== null && ` · ★ ${r.rating}`} · {r.active_orders} active {r.active_orders === 1 ? 'order' : 'orders'}
              </span>
              {r.works_in_area && <span className="block text-chip font-bold text-green">Works in {order.area}</span>}
            </span>
            <Chip tone={r.online ? 'green' : 'gray'}>{r.online ? 'Online' : 'Offline'}</Chip>
          </RadioRow>
        ))}
      </div>
      {assign.isError && <Notice tone="error">{errorMessage(assign.error)}</Notice>}
      {chosen && (
        <Button
          loading={assign.isPending}
          onClick={() => {
            onBefore()
            assign.mutate(chosen.id)
          }}
        >
          Assign {chosen.name.split(' ')[0]}
        </Button>
      )}
      <p className="m-0 text-caption text-mute">Assigning removes the order from other riders' lists. The action is saved in the audit log.</p>
    </>
  )
}

function CancelOrder({ reference, onBefore }: { reference: string; onBefore: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useAdminMutation(() => api.cancelOrder(reference, reason))
  if (!open) {
    return (
      <Button variant="line-danger" size="sm" onClick={() => setOpen(true)}>
        Cancel this order
      </Button>
    )
  }
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <h3 className="m-0 text-[15px] font-extrabold">Cancel {reference.slice(0, 7)}</h3>
      <p className="m-0 text-caption text-mute">The rider and the customer are told. A paid order becomes a refund to pay as points.</p>
      <TextAreaField label="Reason (saved in the audit log)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer asked to cancel by phone" />
      {cancel.isError && <Notice tone="error">{errorMessage(cancel.error)}</Notice>}
      <div className="flex gap-2">
        <Button variant="danger" size="sm" block={false} className="px-4" loading={cancel.isPending} onClick={() => {
            onBefore()
            cancel.mutate(undefined)
          }}>
          Cancel order
        </Button>
        <Button variant="line" size="sm" block={false} className="px-4" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </Card>
  )
}

