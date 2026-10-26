import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { SearchIcon } from '../../../components/icons/icons'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { OptionTile, RadioRow } from '../../../components/ui/Choice'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { KeyValue } from '../../../components/ui/Content'
import { Pills } from '../../../components/ui/Controls'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { AdminCustomer } from '../../../domain/admin'
import {
  CAN_SIZES,
  TANK_SIZES,
  canCountsFor,
  fitCanCount,
  WATER_SOURCE_LABEL,
  describeChoice,
  type CanSizeLitres,
  type DeliveryType,
  type PaymentMethod,
  type TankSizeGallons,
  type TankType,
  type WaterChoice,
  type WaterSource,
} from '../../../domain/orders'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatNaira } from '../../../lib/format/money'
import { formatPhone } from '../../../lib/format/phone'
import { cx } from '../../../lib/cx'
import * as api from '../adminApi'
import { METHOD_LABEL } from '../adminFormat'
import { AdminFrame, PageHead, SelectField } from '../AdminParts'
import { useAdminMutation, useAdminQuote, useCustomer, useCustomers } from '../queries'

function Step({ n, title, action, children }: { n: number; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">
          {n}. {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

const LINK_BUTTON = 'hit-44 cursor-pointer border-0 bg-transparent p-0 text-[14px] font-bold text-primary hover:text-primary-dark'

/**
 * Create an order for a customer (`a-create`): same rules and records as an
 * order placed in the customer app (price from the server, open station with
 * valid papers, delivery code). `?customer=` picks the customer, from the
 * Customers page's "Place order for …".
 */
export function CreateOrder() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [customerId, setCustomerId] = useState<string | null>(params.get('customer'))
  const [search, setSearch] = useState('')
  const [newCustomer, setNewCustomer] = useState(false)
  const [type, setType] = useState<DeliveryType>('keke')
  const [can, setCan] = useState<CanSizeLitres>(50)
  const [count, setCount] = useState<number>(12)
  const [tankType, setTankType] = useState<TankType>('ground')
  const [size, setSize] = useState<TankSizeGallons>(750)
  const [source, setSource] = useState<WaterSource>('borehole')
  const [addressId, setAddressId] = useState<string | null>(null)
  const [newAddress, setNewAddress] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('pay_on_delivery')
  const [after, setAfter] = useState<'pool' | 'assign'>('pool')

  const customers = useCustomers(search)
  const customer = useCustomer(customerId)
  const c = customer.data
  const address = c?.addresses.find((a) => a.id === addressId) ?? c?.addresses.find((a) => a.is_default) ?? c?.addresses[0] ?? null
  const choice: WaterChoice = type === 'keke' ? { delivery_type: 'keke', can_size_litres: can, can_count: count } : { delivery_type: 'tanker', tank_type: tankType, tank_size_gallons: size, source }
  const quote = useAdminQuote(choice, address?.address ?? null)
  const q = quote.data?.status === 'quote_available' ? quote.data : null

  const create = useAdminMutation(() => api.createOrderForCustomer({ customer_id: c!.id, choice, address_id: address!.id, payment_method: method, assign_to: null }))

  // "Leave it" goes back to the order list with a confirmation; "Assign a
  // rider now" opens the new order's panel with its eligible riders.
  function submit() {
    create.mutate(undefined, {
      onSuccess: (o) => navigate(after === 'assign' ? `/admin/orders?ref=${o.reference}` : `/admin/orders?created=${o.reference}`, { replace: true }),
    })
  }

  return (
    <AdminFrame searchPlaceholder="Search orders, customers, riders" onSearch={(v) => v && navigate(`/admin/orders?q=${encodeURIComponent(v)}`)}>
      <PageHead
        back={
          <Link to="/admin/orders" className="mb-1 inline-flex min-h-11 items-center gap-1 text-[14px] font-bold text-primary no-underline hover:text-primary-dark">
            ← Orders
          </Link>
        }
        title="Create order for a customer"
        sub="Same rules and records as orders placed in the customer app."
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="rise-2 flex min-w-0 flex-1 flex-col gap-3.5">
          <Step
            n={1}
            title="Customer"
            action={
              <button type="button" className={LINK_BUTTON} onClick={() => setNewCustomer((v) => !v)}>
                {newCustomer ? 'Cancel' : '+ New customer'}
              </button>
            }
          >
            {newCustomer ? (
              <NewCustomerForm
                onCreated={(created) => {
                  setCustomerId(created.id)
                  setNewCustomer(false)
                }}
              />
            ) : (
              <>
                <label className="flex h-12 items-center gap-2.5 rounded-input bg-field px-3.5 text-mute">
                  <SearchIcon size={18} strokeWidth={2.2} roundJoin={false} />
                  <span className="sr-only">Find a customer by phone or name</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Phone number or name"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-offset-4"
                  />
                </label>
                {customers.isError && <ErrorBlock error={customers.error} onRetry={() => customers.refetch()} />}
                <div role="radiogroup" aria-label="Customers" className="flex flex-col gap-2">
                  {(search ? customers.data?.customers ?? [] : c ? [c] : (customers.data?.customers ?? []).slice(0, 3)).slice(0, 5).map((x) => (
                    <RadioRow
                      key={x.id}
                      checked={x.id === customerId}
                      onSelect={() => {
                        setCustomerId(x.id)
                        setAddressId(null)
                        setSearch('')
                      }}
                    >
                      <Avatar name={x.name} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold">{x.name}</span>
                        <span className="block text-caption text-mute">
                          {formatPhone(x.phone)} · {x.orders} {x.orders === 1 ? 'order' : 'orders'} · {x.phone_verified ? 'phone verified' : 'phone not verified'}
                        </span>
                      </span>
                      {x.id === customerId && <Chip tone="green">Selected</Chip>}
                    </RadioRow>
                  ))}
                  {search && customers.isSuccess && customers.data.customers.length === 0 && <p className="m-0 text-mute">No customer with that phone or name. Add them with “+ New customer”.</p>}
                </div>
                {c && !c.phone_verified && (
                  <Notice>
                    <b>Phone not verified yet.</b> Call the customer to confirm the number (FR-003).{' '}
                    <Link to={`/admin/customers?id=${c.id}`} className="font-bold text-primary no-underline hover:text-primary-dark">
                      Open customer
                    </Link>
                  </Notice>
                )}
              </>
            )}
          </Step>

          <Step n={2} title="Delivery type">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['keke', 'tanker'] as const).map((t) => (
                <OptionTile key={t} selected={type === t} onSelect={() => setType(t)} className="flex-row items-center justify-start gap-3 px-3.5 py-3 text-left">
                  <Illustration name={t} className="w-28 shrink-0" />
                  <span>
                    <span className="block text-[17px] font-extrabold">{t === 'keke' ? 'Keke' : 'Tanker'}</span>
                    <span className="block text-caption text-mute">{t === 'keke' ? '25 L or 50 L cans' : '500 to 1,000 gallons'}</span>
                  </span>
                </OptionTile>
              ))}
            </div>
          </Step>

          <Step n={3} title="Order details">
            {type === 'keke' ? (
              <div className="flex flex-wrap gap-6">
                <ChoiceGroup
                  label="Jerrycan size"
                  value={String(can)}
                  options={CAN_SIZES.map((v) => ({ value: String(v), label: `${v} L` }))}
                  onChange={(v) => {
                    const next = Number(v) as CanSizeLitres
                    setCan(next)
                    setCount((c) => fitCanCount(next, c))
                  }}
                />
                <ChoiceGroup label="Quantity (cans)" value={String(count)} options={canCountsFor(can).map((v) => ({ value: String(v), label: String(v) }))} onChange={(v) => setCount(Number(v))} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-6">
                <ChoiceGroup label="Tank type" value={tankType} options={[{ value: 'ground', label: 'Ground' }, { value: 'overhead', label: 'Overhead' }]} onChange={(v) => setTankType(v as TankType)} />
                <ChoiceGroup label="Tank size" value={String(size)} options={TANK_SIZES.map((v) => ({ value: String(v), label: `${v.toLocaleString('en-NG')} gal` }))} onChange={(v) => setSize(Number(v) as TankSizeGallons)} />
                <ChoiceGroup
                  label="Water source"
                  value={source}
                  options={(['borehole', 'ninth_mile'] as const).map((v) => ({ value: v, label: WATER_SOURCE_LABEL[v] }))}
                  onChange={(v) => setSource(v as WaterSource)}
                />
                <p className="m-0 w-full text-caption text-mute">A custom tanker size needs a quote first: the customer requests it in the app, and support prices it.</p>
              </div>
            )}
          </Step>

          <Step n={4} title="Delivery address">
            {!c && <p className="m-0 text-mute">Choose a customer first.</p>}
            {c && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {c.addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={address?.id === a.id}
                    onClick={() => setAddressId(a.id)}
                    className={cx(
                      'cursor-pointer rounded-icon border-2 border-solid px-3.5 py-3 text-left text-ink',
                      address?.id === a.id ? 'border-primary bg-sky' : 'border-line bg-white',
                    )}
                  >
                    <span className="block font-extrabold">
                      {a.label} {a.is_default && <span className="ml-1 text-chip font-bold text-primary">Default</span>}
                    </span>
                    <span className="block text-caption text-slate">{a.address}</span>
                  </button>
                ))}
                {!newAddress && (
                  <button
                    type="button"
                    onClick={() => setNewAddress(true)}
                    className="min-h-16 cursor-pointer rounded-icon border-2 border-dashed border-input-line bg-white font-bold text-primary"
                  >
                    + New address
                  </button>
                )}
              </div>
            )}
            {c && newAddress && (
              <NewAddressForm
                customer={c}
                onDone={(id) => {
                  if (id) setAddressId(id)
                  setNewAddress(false)
                }}
              />
            )}
          </Step>
        </div>

        <aside className="rise-3 flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:w-[360px]">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[20px] font-extrabold">Summary</h2>
              <SampleTag>SAMPLE PRICES</SampleTag>
            </div>
            <div className="flex justify-center rounded-card bg-[#F4F7FB] py-3">
              <Illustration name={type} className="animate-drive w-44" />
            </div>
            <div className="text-[14px]">
              <KeyValue label="Customer" value={c?.name ?? 'Not chosen'} />
              <KeyValue label="Order" value={describeChoice(choice)} />
              {type === 'tanker' && <KeyValue label="Water" value={WATER_SOURCE_LABEL[source]} />}
              <KeyValue label="Deliver to" value={address ? `${address.label}, ${address.address}` : 'Not chosen'} />
            </div>
            <SelectField label="Payment" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </SelectField>
            <div className="h-px bg-line" />
            {quote.isError && <ErrorBlock error={quote.error} onRetry={() => quote.refetch()} />}
            {quote.data?.status === 'manual_quote_required' && <Notice>{quote.data.reason}</Notice>}
            {q && (
              <div className="text-[14px]">
                <KeyValue label={q.water.label} value={formatNaira(q.water.amount_minor_units)} />
                {q.delivery && <KeyValue label={q.delivery.label} value={formatNaira(q.delivery.amount_minor_units)} />}
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-extrabold">Total</span>
                  <span className="text-[26px] font-extrabold text-primary-dark">{formatNaira(q.total_minor_units)}</span>
                </div>
              </div>
            )}
            {quote.isPending && <LoadingBlock lines={1} label="Pricing" />}
            <h3 className="m-0 text-[15px] font-extrabold">After creating</h3>
            <div role="radiogroup" aria-label="After creating" className="flex flex-col gap-2">
              <RadioRow checked={after === 'pool'} onSelect={() => setAfter('pool')}>
                <span>
                  <span className="block font-extrabold">Leave it for eligible riders</span>
                  <span className="block text-caption text-mute">Shows in their Available orders</span>
                </span>
              </RadioRow>
              <RadioRow checked={after === 'assign'} onSelect={() => setAfter('assign')}>
                <span>
                  <span className="block font-extrabold">Assign a rider now</span>
                  <span className="block text-caption text-mute">Pick from eligible riders next</span>
                </span>
              </RadioRow>
            </div>
            {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
            <Button disabled={!c || !address || !q} loading={create.isPending} onClick={submit}>
              Create order
            </Button>
            {(!c || !address) && <p className="m-0 text-center text-caption text-mute">{!c ? 'Choose a customer to continue.' : 'Add a delivery address to continue.'}</p>}
          </Card>
        </aside>
      </div>
    </AdminFrame>
  )
}

function ChoiceGroup({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-2 text-[14px] font-bold">{label}</div>
      <Pills label={label} value={value} onChange={onChange} options={options} />
    </div>
  )
}

function NewCustomerForm({ onCreated }: { onCreated: (c: AdminCustomer) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const create = useAdminMutation(() => api.createCustomer({ name, phone }))
  const fieldError = (field: string) =>
    create.error instanceof ApiError && Array.isArray(create.error.details)
      ? (create.error.details as { loc: string[]; msg: string }[]).find((d) => d.loc.includes(field))?.msg
      : undefined
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate(undefined, { onSuccess: onCreated })
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ngozi Okeke" error={fieldError('name')} />
      <TextField label="Phone number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" error={fieldError('phone')} />
      {create.isError && !fieldError('name') && !fieldError('phone') && <Notice tone="error" className="sm:col-span-2">{errorMessage(create.error)}</Notice>}
      <p className="m-0 text-caption text-mute sm:col-span-2">The phone starts unverified. The customer sets a password later with “Forgot password” in the app.</p>
      <Button type="submit" size="sm" block={false} className="px-5" loading={create.isPending}>
        Add customer
      </Button>
    </form>
  )
}

function NewAddressForm({ customer, onDone }: { customer: AdminCustomer; onDone: (id: string | null) => void }) {
  const [label, setLabel] = useState('Home')
  const [address, setAddress] = useState('')
  const [landmark, setLandmark] = useState('')
  const add = useAdminMutation(() => api.addCustomerAddress(customer.id, { label, address, landmark: landmark || null }))
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate(undefined, { onSuccess: (c) => onDone(c.addresses[c.addresses.length - 1]?.id ?? null) })
      }}
      className="grid gap-3 sm:grid-cols-3"
    >
      <TextField label="Name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home, Shop…" />
      <TextField label="Street and area" className="sm:col-span-2" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 8 Zion Close, Independence Layout" />
      <TextField label="Landmark" optional className="sm:col-span-3" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Opposite the filling station" />
      {add.isError && <Notice tone="error" className="sm:col-span-3">{errorMessage(add.error)}</Notice>}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" size="sm" block={false} className="px-5" loading={add.isPending}>
          Save address
        </Button>
        <Button variant="line" size="sm" block={false} className="px-5" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
