import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { DataTable } from '../../../components/ui/Admin'
import { Avatar } from '../../../components/ui/Avatar'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { OptionTile } from '../../../components/ui/Choice'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { KeyValue } from '../../../components/ui/Content'
import { Pills } from '../../../components/ui/Controls'
import { TextAreaField, TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { AdminRider } from '../../../domain/admin'
import type { DeliveryType } from '../../../domain/orders'
import { parseGallons } from '../../../domain/tankCapacity'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatNaira } from '../../../lib/format/money'
import { formatPhone } from '../../../lib/format/phone'
import * as api from '../adminApi'
import { revealDetail } from '../adminFormat'
import { AdminFrame, ApprovalChip, OnlineChip, PageHead, SplitLayout } from '../AdminParts'
import { useAdminMutation, useRider, useRiders } from '../queries'

const FILTERS: { value: api.RiderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'keke', label: 'Keke' },
  { value: 'tanker', label: 'Tanker' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'suspended', label: 'Suspended' },
]

/** Riders and drivers (`a-riders`): approve, suspend and reactivate. `?id=` selects one. */
export function Riders() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<api.RiderFilter>('all')
  const query = params.get('q') ?? ''
  const list = useRiders(filter, query)
  const rows = list.data?.riders ?? []
  const selected = params.get('id') ?? rows[0]?.id ?? null

  return (
    <AdminFrame searchPlaceholder="Search riders by name, phone or plate" onSearch={(q) => setParams(q ? { q } : {}, { replace: true })}>
      <SplitLayout
        sideWidth="lg:w-[360px]"
        main={
          <>
            <PageHead
              title="Riders and drivers"
              sub={list.data ? `${list.data.counts.all} riders · ${list.data.online} online now · ${list.data.pending} waiting for approval` : 'Approve, suspend and reactivate partners.'}
              actions={
                <ButtonLink to="/admin/riders/new" size="sm" block={false}>
                  + Add rider
                </ButtonLink>
              }
            />
            <Pills
              className="rise-2"
              label="Filter riders"
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({ value: f.value, label: f.value === 'all' && list.data ? `All (${list.data.counts.all})` : f.label }))}
            />
            {list.isPending && <LoadingBlock label="Loading riders" />}
            {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
            {list.isSuccess && (
              <Card className="rise-3 overflow-x-auto px-1 py-1.5">
                <DataTable<AdminRider>
                  caption="Riders and drivers"
                  rows={rows}
                  rowKey={(r) => r.id}
                  selectedKey={selected ?? undefined}
                  empty="No riders here."
                  columns={[
                    {
                      header: 'Rider',
                      cell: (r) => (
                        <button type="button" onClick={() => {
                            setParams(query ? { q: query, id: r.id } : { id: r.id }, { replace: true })
                            revealDetail()
                          }} className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-ink">
                          <Avatar name={r.name} size={36} />
                          <span>
                            <span className="block font-extrabold">{r.name}</span>
                            <span className="block text-chip text-mute">{r.code}</span>
                          </span>
                        </button>
                      ),
                    },
                    { header: 'Vehicle', cell: (r) => `${r.vehicle.type === 'keke' ? 'Keke' : 'Tanker'} · ${r.vehicle.plate}` },
                    { header: 'Area', cell: (r) => r.service_areas.join(', ') },
                    { header: 'Status', cell: (r) => <OnlineChip online={r.online} /> },
                    { header: 'Approval', cell: (r) => <ApprovalChip status={r.approval} /> },
                    { header: 'Today', cell: (r) => formatNaira(r.today_minor_units) },
                  ]}
                />
              </Card>
            )}
            <p className="m-0 text-caption text-mute">Pay amounts are SAMPLE (decision 16).</p>
          </>
        }
        side={selected ? <RiderPanel key={selected} id={selected} /> : null}
      />
    </AdminFrame>
  )
}

function RiderPanel({ id }: { id: string }) {
  const rider = useRider(id)
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState(false)
  const change = useAdminMutation((action: api.ApprovalAction) => api.setRiderApproval(id, action, reason))
  const r = rider.data
  if (rider.isPending) return <Card className="p-4"><LoadingBlock label="Loading the rider" /></Card>
  if (rider.isError || !r) return <Card className="p-4"><ErrorBlock error={rider.error} onRetry={() => rider.refetch()} /></Card>
  const action: api.ApprovalAction = r.approval === 'pending' ? 'approve' : r.approval === 'approved' ? 'suspend' : 'reactivate'
  return (
    <Card className="rise-2 flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={r.name} size={60} fontSize={20} />
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-extrabold">{r.name}</div>
          <div className="text-mute">{formatPhone(r.phone)}</div>
        </div>
        <ApprovalChip status={r.approval} />
      </div>
      <div className="flex flex-col items-center gap-1 rounded-card bg-[linear-gradient(160deg,#EEF6FF,#DCEBFD)] py-3">
        <Illustration name={r.vehicle.type} className="w-40" />
        <div className="font-extrabold">
          {r.vehicle.type === 'keke' ? 'Keke' : 'Tanker'} · {r.vehicle.plate}
          {r.vehicle.tank_gallons && ` · ${r.vehicle.tank_gallons.toLocaleString('en-NG')} gal`}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Mini value={r.trips} label="Trips" />
        <Mini value={r.rating ?? 'New'} label="Rating" />
        <Mini value={formatNaira(r.payout_due_minor_units)} label="Payout due" />
      </div>
      <div className="text-[14px]">
        <KeyValue label="Documents" value={r.documents_note} />
        <KeyValue label="Active orders" value={r.active_orders} />
        <KeyValue label="Reported issues" value={r.reported_issues} />
        <KeyValue label="Works in" value={r.service_areas.join(', ') || 'Not set'} />
      </div>
      {action !== 'approve' && (
        <TextAreaField
          label={`Reason to ${action} (saved in the audit log)`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={action === 'suspend' ? 'e.g. Papers expired; two missed deliveries' : 'e.g. New papers checked'}
        />
      )}
      {change.isError && <Notice tone="error">{errorMessage(change.error)}</Notice>}
      {change.isSuccess && <Notice tone="success">Saved. The rider sees the change in their app.</Notice>}
      <Button variant={action === 'suspend' ? 'line-danger' : 'primary'} loading={change.isPending} onClick={() => setAsking(true)}>
        {action === 'approve' ? 'Approve rider' : action === 'suspend' ? 'Suspend rider' : 'Reactivate rider'}
      </Button>
      <ConfirmDialog
        open={asking}
        tone={action === 'suspend' ? 'danger' : 'primary'}
        title={action === 'approve' ? `Approve ${r.name}?` : action === 'suspend' ? `Suspend ${r.name}?` : `Reactivate ${r.name}?`}
        confirmLabel={action === 'approve' ? 'Approve' : action === 'suspend' ? 'Suspend' : 'Reactivate'}
        loading={change.isPending}
        onCancel={() => setAsking(false)}
        onConfirm={() => change.mutate(action, { onSettled: () => setAsking(false) })}
      >
        {action === 'approve'
          ? 'They can go online and accept orders straight away.'
          : action === 'suspend'
            ? 'They go offline and get no new orders. Orders assigned but not started go back to the pool.'
            : 'They can go online and accept orders again.'}
      </ConfirmDialog>
      <p className="m-0 text-caption text-mute">
        {action === 'approve'
          ? 'Check the licence and vehicle papers first. Approved riders can go online and accept orders.'
          : action === 'suspend'
            ? 'Suspended riders go offline and get no new orders; orders assigned but not started go back to the pool. Every change is saved in the audit log.'
            : 'Reactivated riders can go online again. Every change is saved in the audit log.'}
      </p>
    </Card>
  )
}

function Mini({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-input bg-[#F4F7FB] px-2 py-2.5">
      <div className="text-[17px] font-extrabold">{value}</div>
      <div className="text-chip text-mute">{label}</div>
    </div>
  )
}

/** Add a rider or driver from the office (`/admin/riders/new`). Built from the partner sign-up; the account starts pending. */
export function NewRider() {
  const navigate = useNavigate()
  const [vehicle, setVehicle] = useState<DeliveryType>('keke')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [plate, setPlate] = useState('')
  const [area, setArea] = useState('')
  const [gallons, setGallons] = useState('')
  const add = useAdminMutation(() =>
    api.addRider({ name, phone, vehicle_type: vehicle, plate, service_area: area, tank_gallons: vehicle === 'tanker' ? parseGallons(gallons) : null }),
  )
  const err = (field: string) =>
    add.error instanceof ApiError && Array.isArray(add.error.details) ? (add.error.details as { loc: string[]; msg: string }[]).find((d) => d.loc.includes(field))?.msg : undefined
  const fieldLevel = add.error instanceof ApiError && add.error.code === 'validation_error'

  return (
    <AdminFrame searchPlaceholder="Search riders by name, phone or plate" onSearch={(q) => navigate(q ? `/admin/riders?q=${encodeURIComponent(q)}` : '/admin/riders')}>
      <PageHead title="Add a rider or driver" sub="They start waiting for approval; check their papers, then approve them on the Riders page." />
      <Card className="rise-2 flex max-w-[720px] flex-col gap-4 p-5">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(undefined, { onSuccess: (r) => navigate(`/admin/riders?id=${r.id}`, { replace: true }) })
          }}
        >
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[14px] font-bold">Vehicle</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['keke', 'tanker'] as const).map((t) => (
                <OptionTile key={t} selected={vehicle === t} onSelect={() => setVehicle(t)} className="pt-4 pb-3">
                  <Illustration name={t} className="h-14 w-auto" />
                  <span className="text-[15px] font-extrabold">{t === 'keke' ? 'Keke' : 'Tanker'}</span>
                </OptionTile>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ifeanyi James" error={err('name')} />
            <TextField label="Phone number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" error={err('phone')} />
            <TextField label="Plate number" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder={vehicle === 'keke' ? 'ENU 482 KK' : 'ENU 115 XA'} error={err('plate')} />
            <TextField label="Area they work in" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. GRA" error={err('service_area')} />
            {vehicle === 'tanker' && (
              <TextField
                label="How many gallons does the tanker carry?"
                inputMode="numeric"
                value={gallons}
                onChange={(e) => setGallons(e.target.value)}
                placeholder="e.g. 4,000"
                hint="Most tankers carry about 4,000 gallons."
                error={err('tank_gallons')}
              />
            )}
          </div>
          {add.isError && !fieldLevel && <Notice tone="error">{errorMessage(add.error)}</Notice>}
          <p className="m-0 text-caption text-mute">They sign in at the partner app with this phone number and set a password with “Forgot password”.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" block={false} className="px-5" loading={add.isPending}>
              Add rider
            </Button>
            <ButtonLink to="/admin/riders" variant="line" size="sm" block={false} className="px-5">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </Card>
    </AdminFrame>
  )
}
