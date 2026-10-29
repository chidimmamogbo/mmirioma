import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { MiniLink } from '../../../components/ui/Admin'
import { Avatar } from '../../../components/ui/Avatar'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { AdminCustomer } from '../../../domain/admin'
import { errorMessage } from '../../../lib/api/errorMessage'
import { USE_MOCKS } from '../../../lib/api/mode'
import { cx } from '../../../lib/cx'
import { DIRECTORY_EDITS_ENABLED, ORDER_FOR_CUSTOMER_ENABLED, PAYMENTS_PAGE_ENABLED } from '../../../lib/features'
import { formatShortDate } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import { formatPhone } from '../../../lib/format/phone'
import * as api from '../adminApi'
import { DETAIL_PANEL_ID, revealDetail } from '../adminFormat'
import { AdminFrame, PageHead, StatusChip } from '../AdminParts'
import { useAdminMutation, useCustomer, useCustomers } from '../queries'

/** Customers (`a-customers`): list on the left, the selected customer's profile and actions on the right. `?id=` selects one. */
export function Customers() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const list = useCustomers(query)
  const rows = list.data?.customers ?? []
  const selected = params.get('id') ?? rows[0]?.id ?? null

  return (
    <AdminFrame searchPlaceholder="Search customers by name or phone" onSearch={setQuery}>
      <PageHead
        title="Customers"
        sub={list.data ? `${list.data.total} customers · ${list.data.ordered_this_week} ordered ${USE_MOCKS ? 'this week' : 'in the last 7 days'}${query ? ` · results for “${query}”` : ''}` : 'Customer accounts and manual phone checks.'}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="rise-2 flex w-full shrink-0 flex-col gap-1.5 p-2.5 lg:w-[340px]">
          {list.isPending && <LoadingBlock label="Loading customers" />}
          {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
          {list.isSuccess && rows.length === 0 && <p className="m-0 p-3 text-mute">No customers match your search.</p>}
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === selected}
              onClick={() => {
                setParams({ id: c.id }, { replace: true })
                revealDetail()
              }}
              className={cx(
                'flex w-full cursor-pointer items-center gap-3 rounded-icon border-2 border-solid px-2.5 py-2 text-left text-ink',
                c.id === selected ? 'border-primary bg-sky' : 'border-transparent bg-white hover:bg-canvas',
              )}
            >
              <Avatar name={c.name} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{c.name}</span>
                <span className="block text-caption text-mute">
                  {formatPhone(c.phone)} · {c.orders} {c.orders === 1 ? 'order' : 'orders'}
                </span>
              </span>
              <Chip tone={c.phone_verified ? 'green' : 'amber'}>{c.phone_verified ? 'Verified' : 'Unverified'}</Chip>
            </button>
          ))}
        </Card>
        <div id={DETAIL_PANEL_ID} className="rise-3 min-w-0 flex-1 scroll-mt-4">
          {selected && <CustomerDetail key={selected} id={selected} />}
        </div>
      </div>
    </AdminFrame>
  )
}

function CustomerDetail({ id }: { id: string }) {
  const customer = useCustomer(id)
  const verify = useAdminMutation(() => api.verifyCustomerPhone(id))
  const [adjusting, setAdjusting] = useState(false)
  const c = customer.data
  if (customer.isPending) return <Card className="p-4"><LoadingBlock label="Loading the customer" /></Card>
  if (customer.isError || !c) return <Card className="p-4"><ErrorBlock error={customer.error} onRetry={() => customer.refetch()} /></Card>
  const first = c.name.split(' ')[0]
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={c.name} size={76} fontSize={24} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[24px] font-extrabold">{c.name}</h2>
          <div className="text-mute">
            {formatPhone(c.phone)}{USE_MOCKS && ` · ${c.email ?? 'no email'}`} · since {new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(c.customer_since))}
          </div>
        </div>
        {ORDER_FOR_CUSTOMER_ENABLED && (
          <ButtonLink to={`/admin/orders/new?customer=${c.id}`} size="sm" block={false} className="px-5">
            Place order for {first}
          </ButtonLink>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact label="Orders" value={c.orders} />
        <Fact label="Total paid" value={`${formatNaira(c.total_paid_minor_units)}`} note={USE_MOCKS ? 'SAMPLE' : undefined} />
        {/* The backend has no points or complaints per customer: absent, so hidden, never shown as zero. */}
        {c.points !== undefined && <Fact label="Points" value={c.points} gold />}
        {c.complaints !== undefined && <Fact label="Complaints" value={c.complaints} />}
      </div>
      {!c.phone_verified && (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-[#FFF7E2] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-extrabold">Phone not verified yet</div>
            <div className="text-[14px] text-[#5A4310]">Call the customer to confirm the number before confirming orders (FR-003).</div>
          </div>
          {DIRECTORY_EDITS_ENABLED && (
            <Button size="sm" block={false} className="bg-green-solid px-4 hover:bg-green" loading={verify.isPending} onClick={() => verify.mutate(undefined)}>
              Mark phone verified
            </Button>
          )}
        </div>
      )}
      {verify.isError && <Notice tone="error">{errorMessage(verify.error)}</Notice>}
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="m-0 mb-2 text-[16px] font-extrabold">Saved addresses</h3>
          {c.addresses.length === 0 && <p className="m-0 text-mute">No saved addresses yet.</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {c.addresses.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
                <Chip tone={a.is_default ? 'blue' : 'gray'}>{a.is_default ? 'Default' : 'Saved'}</Chip>
                <span>
                  <b>{a.label}</b> · {a.address}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="m-0 mb-2 text-[16px] font-extrabold">Recent orders</h3>
          {c.recent_orders.length === 0 && <p className="m-0 text-mute">No orders yet.</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {c.recent_orders.map((o) => (
              <li key={o.reference} className="flex items-center justify-between gap-2 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
                <span>
                  <b>
                    {/* An order with no delivery type (created before #21) shows no Keke or Tanker word. */}
                    {[o.quantity, o.delivery_type === 'keke' ? 'Keke' : o.delivery_type === 'tanker' ? 'Tanker' : null].filter(Boolean).join(' ')}
                  </b>
                  <span className="block text-caption text-mute">
                    {o.reference} · {formatShortDate(o.created_at)}
                  </span>
                </span>
                <StatusChip status={o.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {DIRECTORY_EDITS_ENABLED && (
          <button type="button" onClick={() => setAdjusting((v) => !v)} className="mo-mini mo-mini-alt hit-44 h-10 px-4 text-[14px]">
            Adjust points
          </button>
        )}
        <MiniLink to={`/admin/support?q=${encodeURIComponent(c.name)}`} tone="alt" className="h-10 px-4 text-[14px]">
          Support history
        </MiniLink>
        {PAYMENTS_PAGE_ENABLED && (
          <MiniLink to={`/admin/payments?customer=${c.id}`} tone="alt" className="h-10 px-4 text-[14px]">
            Payment records
          </MiniLink>
        )}
      </div>
      {adjusting && <AdjustPoints customer={c} onDone={() => setAdjusting(false)} />}
    </Card>
  )
}

function Fact({ label, value, note, gold = false }: { label: string; value: string | number; note?: string; gold?: boolean }) {
  return (
    <div className={cx('rounded-stat px-4 py-3', gold ? 'bg-gold-tint' : 'bg-[#F4F7FB]')}>
      <div className={cx('text-[13px]', gold ? 'text-gold-ink' : 'text-mute')}>
        {label} {note && <span className="text-[10px] font-extrabold tracking-[0.4px]">{note}</span>}
      </div>
      <div className={cx('text-[24px] font-extrabold', gold && 'text-gold-ink')}>{value}</div>
    </div>
  )
}

/** Add or remove points with a reason (audit log). Negative numbers remove points. */
function AdjustPoints({ customer, onDone }: { customer: AdminCustomer; onDone: () => void }) {
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const adjust = useAdminMutation(() => api.adjustPoints(customer.id, Number(points), reason))
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        adjust.mutate(undefined, { onSuccess: onDone })
      }}
      className="grid gap-3 rounded-card bg-[#F4F7FB] p-4 sm:grid-cols-[160px_1fr]"
    >
      <TextField label="Points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, ''))} placeholder="e.g. 50 or -20" />
      <TextField label="Reason (saved in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Late delivery on MO-2BQ7" />
      {adjust.isError && <Notice tone="error" className="sm:col-span-2">{errorMessage(adjust.error)}</Notice>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" block={false} className="px-5" loading={adjust.isPending}>
          Save points
        </Button>
        <Button variant="line" size="sm" block={false} className="px-5" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="m-0 text-caption text-mute sm:col-span-2">
        Balance now {customer.points} points. Points are SAMPLE rewards (decision 16).
      </p>
    </form>
  )
}
