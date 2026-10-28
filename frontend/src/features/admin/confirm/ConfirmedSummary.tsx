import { AlertCircleIcon } from '../../../components/icons/icons'
import { Card } from '../../../components/ui/Card'
import { KeyValue } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import { formatDateTime, formatTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import { AGREEMENT_LABEL, REASON_LABEL, confirmationHistory, formatWindow } from './logic'
import { PriceChip } from './ConfirmOrder'
import { useConfirmDetail, useConfirmHistory } from './queries'

/**
 * Q4 and Q5: what was confirmed, with the SMS and source warnings, and the
 * confirmation history. Shows only once the order has a confirmed price
 * (real-API mode); renders nothing before or in mock mode.
 */
export function ConfirmedSummary({ reference }: { reference: string }) {
  const detail = useConfirmDetail(reference)
  const d = detail.data
  const confirmed = Boolean(d?.price)
  const history = useConfirmHistory(reference, confirmed)
  if (!d?.price) return null
  const p = d.price
  const kind = p.manual ? 'manual' : 'server'
  const lines = history.data ? confirmationHistory(d.created_at, history.data, formatWindow, formatNaira) : []
  return (
    <Card className="rise-2 flex flex-col gap-1.5 p-4 text-sub">
      <h3 className="m-0 mb-1 text-[16px] font-extrabold">Confirmed</h3>
      <KeyValue label="Water category" value={d.water_category?.label ?? p.water_category_label} />
      {d.source && (
        <KeyValue
          label="Source"
          value={`${d.source.name} · ${d.source.approximate_location}${d.source.report_reference ? ` · ${d.source.report_reference}` : ''}`}
        />
      )}
      {d.delivery_window && <KeyValue label="Window" value={formatWindow(d.delivery_window.start_at, d.delivery_window.end_at)} />}
      <KeyValue
        label="Price"
        value={
          <span className="flex items-center justify-end gap-2">
            <PriceChip kind={kind} /> {formatNaira(p.total_minor_units)}
          </span>
        }
      />
      <KeyValue label="Payment" value="Pay on delivery: cash after unloading" />
      <KeyValue label="Confirmed by" value={`${p.entered_by?.name ?? 'Staff'} · ${formatDateTime(p.entered_at)}`} />
      <KeyValue label="Customer agreed" value={`${AGREEMENT_LABEL[p.customer_agreement.method]} · ${formatDateTime(p.customer_agreement.agreed_at)}`} />
      {d.confirmation_sms?.status === 'not_accepted' && (
        <Notice className="mt-1.5">
          <b className="block">The confirmation SMS could not be sent.</b>
          Call the customer to tell them. The order is still confirmed.
        </Notice>
      )}
      {d.source && d.source.reasons.length > 0 && (
        <Notice className="mt-1.5">
          <b className="block">
            {d.source.name} can no longer be used for {d.water_category?.label ?? p.water_category_label}.
          </b>
          {d.source.reasons.map((r) => (
            <span key={r} className="flex items-center gap-1.5">
              <AlertCircleIcon size={14} /> {REASON_LABEL[r]}
            </span>
          ))}
          This order was confirmed with it. Check with the technical lead before a driver collects from it.
        </Notice>
      )}
      {lines.length > 0 && (
        <>
          <h4 className="m-0 mt-2 text-[14px] font-extrabold">History</h4>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {lines.map((l) => (
              <li key={`${l.label}-${l.at}`} className="flex gap-2">
                <span aria-hidden="true" className={l.label === 'Confirmed' ? 'mt-1.5 size-2 shrink-0 rounded-full bg-green' : 'mt-1.5 size-2 shrink-0 rounded-full bg-radio-line'} />
                <span>
                  <b>{l.label}</b> · {formatTime(l.at)}
                  {l.by && ` · ${l.by}`}
                  {l.detail && <span className="block text-slate">{l.detail}</span>}
                  {l.note && <span className="block text-mute">{l.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  )
}
