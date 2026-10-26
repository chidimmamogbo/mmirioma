import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BanknoteIcon } from '../../../components/icons/icons'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { DataTable, MiniButton, MiniLink, StatCard } from '../../../components/ui/Admin'
import { Button } from '../../../components/ui/Button'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Notice } from '../../../components/ui/Notice'
import { formatDateTime } from '../../../lib/format/datetime'
import * as api from '../adminApi'
import type { AdminCashCollection, CashDriverRow } from '../adminApi'
import { AdminFrame, PageHead, Panel } from '../AdminParts'
import { cashErrorMessage, cashFigures, formatCash, formatCashDay, isCalendarDate, isCashChanged, lagosDate, paymentAtReceipt, shiftDate } from '../cashFormat'
import { useAdminMutation, useCashDay } from '../queries'

/**
 * Cash page (K3) with Reconcile (K5), docs/design/admin-cash.md (approved
 * G2, 2026-10-26; the main repo's approved K3 and K5). One Lagos day from
 * `?date=` (default today): the day's figures, the cash each driver holds,
 * and the received cash waiting to be reconciled. Receiving cash is K4
 * (`CashDriver`). Nothing here sets a payment status (payments.md, decision 2).
 */
export function Cash() {
  const [params, setParams] = useSearchParams()
  const today = lagosDate()
  const asked = params.get('date')
  // A future or malformed date in the address falls back to today.
  const date = isCalendarDate(asked) && asked <= today ? asked : today
  const day = useCashDay(date)
  const goTo = (next: string) => setParams(next === today ? {} : { date: next })

  return (
    <AdminFrame searchPlaceholder="Search orders, customers, riders">
      <PageHead
        title="Cash"
        sub={formatCashDay(date)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {api.CASH_IS_SAMPLE && <SampleTag>SAMPLE DATA</SampleTag>}
            <MiniButton tone="alt" onClick={() => goTo(shiftDate(date, -1))}>
              Previous day
            </MiniButton>
            <MiniButton tone="alt" disabled={date >= today} onClick={() => goTo(shiftDate(date, 1))}>
              Next day
            </MiniButton>
          </div>
        }
      />
      {day.isPending && <LoadingBlock label="Loading the cash page" />}
      {day.isError && (
        <>
          <Notice tone="error">Could not load the cash page.</Notice>
          <ErrorBlock error={day.error} onRetry={() => day.refetch()} />
        </>
      )}
      {day.isSuccess && (
        <>
          <div className="rise-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cashFigures(day.data.totals).map((figure) => (
              <StatCard key={figure.label} icon={<BanknoteIcon />} tone="teal" value={figure.value} label={figure.label} />
            ))}
          </div>
          <Panel title="Drivers" className="rise-3">
            <DataTable<CashDriverRow>
              caption="Cash with drivers"
              rows={day.data.drivers}
              rowKey={(row) => row.driver.id}
              empty="No cash with drivers on this day."
              columns={[
                {
                  header: 'Driver',
                  cell: (row) => (
                    <span>
                      <b>{row.driver.name}</b>
                      {row.driver.vehicle && <span className="block text-caption text-mute">{row.driver.vehicle}</span>}
                    </span>
                  ),
                },
                { header: 'With the driver', cell: (row) => formatCash(row.held_minor_units) },
                { header: 'Ready to hand over', cell: (row) => formatCash(row.ready_minor_units) },
                {
                  header: 'Hand over by',
                  cell: (row) => (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {row.remittance_due_at ? formatDateTime(row.remittance_due_at) : 'None'}
                      {row.overdue && <Chip tone="red">Overdue</Chip>}
                    </span>
                  ),
                },
                { header: 'Last received', cell: (row) => (row.last_received_at ? formatDateTime(row.last_received_at) : 'None') },
                {
                  header: 'Action',
                  cell: (row) =>
                    row.held_minor_units > 0 ? <MiniLink to={`/admin/cash/drivers/${row.driver.id}`}>Receive cash</MiniLink> : <span className="text-mute">None</span>,
                },
              ]}
            />
          </Panel>
          <ReconcilePanel rows={day.data.awaiting_reconciliation} onChanged={() => day.refetch()} />
        </>
      )}
    </AdminFrame>
  )
}

/**
 * K5: received cash waiting to be reconciled, any day, oldest first. The
 * administrator ticks records (or uses a row's Reconcile) and confirms; the
 * payment status set at receipt stays as it is.
 */
function ReconcilePanel({ rows, onChanged }: { rows: AdminCashCollection[]; onChanged: () => void }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  // The records the confirm dialog is about: one row's, or the ticked ones.
  const [pending, setPending] = useState<string[] | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const reconcile = useAdminMutation((ids: string[]) => api.reconcileCash({ collection_ids: ids, note: null }))
  const tickedIds = rows.filter((row) => ticked.has(row.id)).map((row) => row.id)

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirm = () => {
    if (!pending) return
    reconcile.mutate(pending, {
      onSuccess: (records) => {
        setDone(records.length)
        setTicked(new Set())
      },
      onError: (error) => {
        if (isCashChanged(error)) onChanged()
      },
      onSettled: () => setPending(null),
    })
  }

  return (
    <Panel
      title="Received, not reconciled"
      className="rise-4"
      action={
        <Button size="sm" disabled={tickedIds.length === 0 || reconcile.isPending} onClick={() => setPending(tickedIds)}>
          Reconcile selected
        </Button>
      }
    >
      {done !== null && <Notice tone="success">Reconciled {done} {done === 1 ? 'record' : 'records'}.</Notice>}
      {reconcile.isError && <Notice tone="error">{cashErrorMessage(reconcile.error)}</Notice>}
      <div className="overflow-x-auto">
        <DataTable<AdminCashCollection>
          caption="Received cash waiting to be reconciled"
          rows={rows}
          rowKey={(row) => row.id}
          empty="Nothing waiting to be reconciled."
          columns={[
            {
              header: 'Order',
              cell: (row) => (
                <label className="flex cursor-pointer items-center gap-2 font-extrabold">
                  <input type="checkbox" checked={ticked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.order_reference}`} />
                  {row.order_reference}
                </label>
              ),
            },
            { header: 'Customer', cell: (row) => row.customer.name },
            { header: 'Amount due', cell: (row) => formatCash(row.amount_due_minor_units) },
            { header: 'Recorded', cell: (row) => formatCash(row.amount_minor_units) },
            {
              header: 'Received',
              cell: (row) => (row.remitted_at ? `${row.received_by?.name ?? 'Staff'}, ${formatDateTime(row.remitted_at)}` : 'None'),
            },
            { header: 'Payment', cell: (row) => paymentAtReceipt(row) },
            {
              header: 'Action',
              cell: (row) => (
                <MiniButton disabled={reconcile.isPending} onClick={() => setPending([row.id])}>
                  Reconcile
                </MiniButton>
              ),
            },
          ]}
        />
      </div>
      <ConfirmDialog
        open={pending !== null}
        tone="primary"
        title={`Reconcile ${pending?.length ?? 0} ${pending?.length === 1 ? 'record' : 'records'}?`}
        confirmLabel="Reconcile"
        loading={reconcile.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        Payment statuses stay as they are. Differences stay recorded on the orders.
      </ConfirmDialog>
    </Panel>
  )
}
