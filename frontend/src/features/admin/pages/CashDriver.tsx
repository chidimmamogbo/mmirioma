import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { DataTable, MiniButton } from '../../../components/ui/Admin'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { SampleTag } from '../../../components/ui/Chip'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TextAreaField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import * as api from '../adminApi'
import type { AdminCashCollection, Remittance } from '../adminApi'
import { AdminFrame, NairaInput, PageHead, Panel } from '../AdminParts'
import { cashErrorMessage, custodyLabel, fieldError, formatCash, isCashChanged, paymentAtReceipt } from '../cashFormat'
import { useAdminMutation, useDriverCash } from '../queries'

const NOTE_MAX = 500

const backToCash = (
  <Link to="/admin/cash" className="font-bold text-primary no-underline hover:text-primary-dark">
    ← Cash
  </Link>
)

/**
 * Receive cash (K4), docs/design/admin-cash.md (approved G2, 2026-10-26; the
 * main repo's approved K4). The administrator ticks the driver's records,
 * types the cash counted, and confirms. One counted amount per handover
 * (approved decision 3): a difference is saved on the handover as an
 * exception and never changes an order. The server sets each order's
 * payment status and sends the payment SMS (BR-07, FR-041, FR-050).
 */
export function CashDriver() {
  const { driverId = '' } = useParams()
  const cash = useDriverCash(driverId)
  const [result, setResult] = useState<Remittance | null>(null)

  return (
    <AdminFrame searchPlaceholder="Search orders, customers, riders">
      {cash.isPending && <LoadingBlock label="Loading the driver's cash" />}
      {cash.isError && (
        <>
          <PageHead title="Receive cash" back={backToCash} />
          <ErrorBlock error={cash.error} onRetry={() => cash.refetch()} />
          <ButtonLink to="/admin/cash" variant="line">
            Back to Cash
          </ButtonLink>
        </>
      )}
      {cash.isSuccess && (
        <>
          <PageHead
            title={`Receive cash from ${cash.data.driver.name}`}
            back={backToCash}
            actions={api.CASH_IS_SAMPLE ? <SampleTag>SAMPLE DATA</SampleTag> : undefined}
          />
          {result ? (
            <Received remittance={result} />
          ) : cash.data.collections.length === 0 ? (
            <Panel>
              <p className="m-0">{cash.data.driver.name} has no cash to hand over.</p>
              <ButtonLink to="/admin/cash" variant="line">
                Back to Cash
              </ButtonLink>
            </Panel>
          ) : (
            <ReceiveForm driverId={driverId} driverName={cash.data.driver.name} records={cash.data.collections} onReceived={setResult} onChanged={() => cash.refetch()} />
          )}
        </>
      )}
    </AdminFrame>
  )
}

interface ReceiveFormProps {
  driverId: string
  driverName: string
  /** The driver's `collected` and `awaiting_remittance` records. */
  records: AdminCashCollection[]
  onReceived: (remittance: Remittance) => void
  /** The records changed on the server (409): reload them. */
  onChanged: () => void
}

/** The tick list, the count, the note and "Confirm received". */
function ReceiveForm({ driverId, driverName, records, onReceived, onChanged }: ReceiveFormProps) {
  // Unticked ids; every record starts ticked, and records that arrive after a reload are ticked too.
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [counted, setCounted] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [noteMissing, setNoteMissing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [correcting, setCorrecting] = useState<AdminCashCollection | null>(null)
  const receive = useAdminMutation(api.receiveCash)

  const chosen = records.filter((row) => !unticked.has(row.id))
  const recorded = chosen.reduce((total, row) => total + row.amount_minor_units, 0)
  const difference = counted === null ? 0 : counted - recorded
  const needsNote = counted !== null && difference !== 0

  const toggle = (id: string) =>
    setUnticked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const ask = () => {
    if (needsNote && note.trim() === '') {
      setNoteMissing(true)
      return
    }
    setConfirming(true)
  }

  const confirm = () =>
    receive.mutate(
      { driver_id: driverId, collection_ids: chosen.map((row) => row.id), counted_minor_units: counted ?? 0, note: note.trim() || null },
      {
        onSuccess: onReceived,
        onError: (error) => {
          if (isCashChanged(error)) onChanged()
        },
        onSettled: () => setConfirming(false),
      },
    )

  return (
    <>
      {receive.isError && <Notice tone="error">{cashErrorMessage(receive.error)}</Notice>}
      <Panel title="The driver's records">
        <div className="overflow-x-auto">
          <DataTable<AdminCashCollection>
            caption={`Cash records of ${driverName}`}
            rows={records}
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Order',
                cell: (row) => (
                  <label className="flex cursor-pointer items-center gap-2 font-extrabold">
                    <input type="checkbox" checked={!unticked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Include ${row.order_reference}`} />
                    {row.order_reference}
                  </label>
                ),
              },
              { header: 'Customer', cell: (row) => row.customer.name },
              { header: 'Amount due', cell: (row) => formatCash(row.amount_due_minor_units) },
              {
                header: 'Recorded',
                cell: (row) => (
                  <span>
                    {formatCash(row.amount_minor_units)}
                    {row.original_amount_minor_units !== null && (
                      <span className="block text-caption text-mute">
                        Corrected from {formatCash(row.original_amount_minor_units)} by {row.corrected_by?.name ?? 'staff'}.
                        {row.correction_reason && ` ${row.correction_reason}`}
                      </span>
                    )}
                  </span>
                ),
              },
              { header: 'Status', cell: (row) => custodyLabel(row) },
              { header: "Driver's note", cell: (row) => row.note ?? <span className="text-mute">None</span> },
              {
                header: 'Action',
                cell: (row) => (
                  <MiniButton tone="alt" onClick={() => setCorrecting(row)}>
                    Correct amount
                  </MiniButton>
                ),
              },
            ]}
          />
        </div>
      </Panel>
      <Panel title="Count the cash">
        <p className="m-0">
          Total recorded by the driver: <b>{formatCash(recorded)}</b>
        </p>
        <label className="flex flex-col gap-1 font-semibold">
          Cash counted (₦)
          <NairaInput label="Cash counted" value={counted} onChange={setCounted} />
        </label>
        {fieldError(receive.error, 'counted_minor_units') && <Notice tone="error">{fieldError(receive.error, 'counted_minor_units')}</Notice>}
        {counted !== null && difference === 0 && <Notice tone="success">Counted matches the recorded total.</Notice>}
        {needsNote && (
          <>
            <Notice>
              <b>{difference < 0 ? `${formatCash(-difference)} short` : `${formatCash(difference)} over`}</b>
              <br />
              Saved as an exception for review. The driver's records do not change.
            </Notice>
            <TextAreaField
              label="What happened? (required)"
              value={note}
              maxLength={NOTE_MAX}
              hint={`${note.length}/${NOTE_MAX}`}
              error={noteMissing && note.trim() === '' ? 'Say what happened.' : fieldError(receive.error, 'note')}
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
        <div>
          <Button disabled={counted === null || chosen.length === 0 || receive.isPending} onClick={ask}>
            Confirm received
          </Button>
        </div>
      </Panel>
      <ConfirmDialog
        open={confirming}
        tone="primary"
        title="Confirm received"
        confirmLabel="Confirm received"
        loading={receive.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={confirm}
      >
        You confirm you have received {formatCash(counted ?? 0)} in cash from {driverName}. Each order's payment status changes now, and each customer is sent a
        payment SMS.
      </ConfirmDialog>
      {correcting && <CorrectDialog record={correcting} onClose={() => setCorrecting(null)} onChanged={onChanged} />}
    </>
  )
}

/** "Correct amount" (approved decision 6): before receipt only, with a required reason. */
function CorrectDialog({ record, onClose, onChanged }: { record: AdminCashCollection; onClose: () => void; onChanged: () => void }) {
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const correct = useAdminMutation((input: { amount: number; reason: string }) =>
    api.correctCashCollection(record.id, { amount_minor_units: input.amount, reason: input.reason }),
  )
  const amountError = tried && amount === null ? 'Enter the correct amount.' : tried && amount === record.amount_minor_units ? 'Enter an amount different from the recorded one.' : fieldError(correct.error, 'amount_minor_units')
  const reasonError = tried && reason.trim() === '' ? 'Give the reason for the correction.' : fieldError(correct.error, 'reason')

  const save = () => {
    setTried(true)
    if (amount === null || amount === record.amount_minor_units || reason.trim() === '') return
    correct.mutate(
      { amount, reason: reason.trim() },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isCashChanged(error)) onChanged()
        },
      },
    )
  }

  return (
    <ConfirmDialog open tone="primary" title={`Correct the amount for ${record.order_reference}`} confirmLabel="Save correction" loading={correct.isPending} onCancel={onClose} onConfirm={save}>
      <span className="flex flex-col gap-3 text-left text-ink">
        <span>Recorded by the driver: {formatCash(record.amount_minor_units)}</span>
        <label className="flex flex-col gap-1 font-semibold">
          New amount (₦)
          <NairaInput label="New amount" value={amount} onChange={setAmount} />
        </label>
        {amountError && <span className="text-red">{amountError}</span>}
        <TextAreaField label="Reason (required)" value={reason} maxLength={NOTE_MAX} error={reasonError} onChange={(e) => setReason(e.target.value)} />
        {correct.isError && !fieldError(correct.error, 'amount_minor_units') && !fieldError(correct.error, 'reason') && <span className="text-red">{cashErrorMessage(correct.error)}</span>}
      </span>
    </ConfirmDialog>
  )
}

/** After "Confirm received": each order's payment status and SMS outcome. */
function Received({ remittance }: { remittance: Remittance }) {
  const failed = remittance.orders.filter((order) => order.sms_status === 'failed')
  return (
    <Panel title="Cash received">
      <Notice tone="success">
        Received {formatCash(remittance.counted_minor_units)} from {remittance.driver.name}.
      </Notice>
      {remittance.difference_minor_units !== 0 && (
        <Notice>
          <b>
            {remittance.difference_minor_units < 0 ? `${formatCash(-remittance.difference_minor_units)} short` : `${formatCash(remittance.difference_minor_units)} over`}
          </b>
          <br />
          Saved as an exception for review. The driver's records do not change.
        </Notice>
      )}
      {failed.map((order) => (
        <Notice key={order.reference} tone="error">
          The payment SMS could not be sent for {order.reference}.
          <br />
          Call the customer to tell them. The payment is still recorded.
        </Notice>
      ))}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {remittance.orders.map((order) => (
          <li key={order.reference} className="flex flex-wrap justify-between gap-2 border-b border-card-line pb-2">
            <b>{order.reference}</b>
            <span>{paymentAtReceipt(order)}</span>
          </li>
        ))}
      </ul>
      <div>
        <ButtonLink to="/admin/cash" variant="line">
          Back to Cash
        </ButtonLink>
      </div>
    </Panel>
  )
}
