import { Link } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { DataTable, MiniButton } from '../../../components/ui/Admin'
import { Chip, SampleTag } from '../../../components/ui/Chip'
import { Notice } from '../../../components/ui/Notice'
import type { AdminPartnerEarnings, AdminPayout } from '../../../domain/admin'
import { errorMessage } from '../../../lib/api/errorMessage'
import { formatDateTime } from '../../../lib/format/datetime'
import { formatNaira } from '../../../lib/format/money'
import * as api from '../adminApi'
import { AdminFrame, PageHead, Panel } from '../AdminParts'
import { useAdminMutation, usePayouts } from '../queries'

/**
 * Rider earnings (added). Riders and drivers request payouts in their app;
 * staff send the money outside the app and mark the request sent here, which
 * tells the partner. Wallets and pay are SAMPLES (decision 16).
 */
export function Earnings() {
  const data = usePayouts()
  const send = useAdminMutation((p: { partnerId: string; payoutId: string }) => api.markPayoutPaid(p.partnerId, p.payoutId))
  const requested = data.data?.payouts.filter((p) => p.status === 'requested') ?? []
  return (
    <AdminFrame searchPlaceholder="Search riders by name, phone or plate">
      <PageHead title="Rider earnings" sub="Wallets, payout requests and payouts sent." actions={<SampleTag>SAMPLE PAY</SampleTag>} />
      {data.isPending && <LoadingBlock label="Loading earnings" />}
      {data.isError && <ErrorBlock error={data.error} onRetry={() => data.refetch()} />}
      {send.isError && <Notice tone="error">{errorMessage(send.error)}</Notice>}
      {data.data && (
        <>
          <Panel title={`Payout requests (${requested.length})`} className="rise-2">
            {requested.length === 0 && <p className="m-0 text-mute">No payout requests waiting.</p>}
            {requested.length > 0 && (
              <div className="overflow-x-auto">
                <DataTable<AdminPayout>
                  caption="Payout requests"
                  rows={requested}
                  rowKey={(p) => p.id}
                  columns={[
                    { header: 'Rider', cell: (p) => <span className="font-extrabold">{p.partner_name} · {p.code}</span> },
                    { header: 'Requested', cell: (p) => formatDateTime(p.at) },
                    { header: 'Amount', cell: (p) => formatNaira(p.amount_minor_units) },
                    { header: 'Account', cell: (p) => (p.account_ending ? `Ending ${p.account_ending}` : <span className="text-red">No account</span>) },
                    {
                      header: 'Action',
                      cell: (p) => (
                        <MiniButton disabled={send.isPending} onClick={() => send.mutate({ partnerId: p.partner_id, payoutId: p.id })}>
                          Mark as sent
                        </MiniButton>
                      ),
                    },
                  ]}
                />
              </div>
            )}
            <p className="m-0 text-caption text-mute">Send the money from the bank first, then mark it sent. The rider is told in their app.</p>
          </Panel>
          <Panel title="Wallets" className="rise-3">
            <div className="overflow-x-auto">
              <DataTable<AdminPartnerEarnings>
                caption="Rider wallets"
                rows={data.data.partners}
                rowKey={(p) => p.partner_id}
                columns={[
                  {
                    header: 'Rider',
                    cell: (p) => (
                      <Link to={`/admin/riders?id=${p.partner_id}`} className="font-extrabold text-primary-dark no-underline">
                        {p.name}
                      </Link>
                    ),
                  },
                  { header: 'Code', cell: (p) => p.code },
                  { header: 'Vehicle', cell: (p) => (p.vehicle === 'keke' ? 'Keke' : 'Tanker') },
                  { header: 'Trips done', cell: (p) => p.trips },
                  { header: 'Last 7 days', cell: (p) => formatNaira(p.week_minor_units) },
                  { header: 'Wallet (due)', cell: (p) => <b>{formatNaira(p.wallet_minor_units)}</b> },
                ]}
              />
            </div>
          </Panel>
          <Panel title="Payouts sent" className="rise-4">
            <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
              {data.data.payouts
                .filter((p) => p.status === 'paid')
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
                    <span>
                      <b>{p.partner_name}</b> · {formatDateTime(p.at)}
                    </span>
                    <span className="flex items-center gap-2">
                      {formatNaira(p.amount_minor_units)} <Chip tone="green">Sent</Chip>
                    </span>
                  </li>
                ))}
            </ul>
          </Panel>
        </>
      )}
    </AdminFrame>
  )
}
