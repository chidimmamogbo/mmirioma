import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircleIcon, ClockIcon, DropletIcon, LockIcon, PhoneIcon } from '../../../components/icons/icons'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { IconBadge, type IconBadgeTone } from '../../../components/ui/Content'
import { Pills } from '../../../components/ui/Controls'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { RESOLUTION_LABEL, type AdminIssue, type IssueType, type ResolutionAction } from '../../../domain/admin'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatDateTime, formatTime } from '../../../lib/format/datetime'
import * as api from '../adminApi'
import { timeAgo } from '../adminFormat'
import { AdminFrame, PageHead } from '../AdminParts'
import { useAdminMutation, useAdminOrder, useIssuePeople, useIssues } from '../queries'

const ISSUE_ICON: Record<IssueType, { tone: IconBadgeTone; icon: ReactNode }> = {
  code_not_working: { tone: 'red', icon: <LockIcon size={20} /> },
  late: { tone: 'gold', icon: <ClockIcon size={20} /> },
  customer_unreachable: { tone: 'blue', icon: <PhoneIcon size={20} /> },
  wrong_quantity: { tone: 'violet', icon: <DropletIcon size={20} /> },
  quality_concern: { tone: 'violet', icon: <DropletIcon size={20} /> },
  unsafe_access: { tone: 'red', icon: <AlertCircleIcon size={20} /> },
  station_problem: { tone: 'teal', icon: <AlertCircleIcon size={20} /> },
  other: { tone: 'blue', icon: <AlertCircleIcon size={20} /> },
}

/** Which resolutions make sense for an issue (a code that fails points to confirming without it). */
function actionsFor(issue: AdminIssue): ResolutionAction[] {
  const all: ResolutionAction[] = ['confirm_without_code', 'reassign', 'goodwill_points', 'cancel_order', 'call_and_close']
  return issue.reference ? all : ['goodwill_points', 'call_and_close']
}

/**
 * Support and delivery problems (`a-support`). One resolution per issue, with
 * a reason that is saved in the audit log; the reporter's ticket closes.
 * `?q=` searches (from Customers → Support history).
 */
export function Support() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const issues = useIssues(query)
  const list = issues.data ?? []
  const selectedId = params.get('id') ?? list[0]?.id ?? null
  const selected = list.find((i) => i.id === selectedId) ?? null
  const open = list.filter((i) => i.status === 'open')

  return (
    <AdminFrame searchPlaceholder="Search issues or order numbers" onSearch={(q) => setParams(q ? { q } : {}, { replace: true })}>
      <PageHead
        title="Support and delivery problems"
        sub={`${open.length} open · ${open.filter((i) => i.urgent).length} urgent. Sensitive actions are permission-checked and logged.${query ? ` Results for “${query}”.` : ''}`}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="rise-2 flex w-full shrink-0 flex-col gap-2.5 lg:w-[380px]">
          {issues.isPending && <LoadingBlock label="Loading issues" />}
          {issues.isError && <ErrorBlock error={issues.error} onRetry={() => issues.refetch()} />}
          {issues.isSuccess && list.length === 0 && <Card className="p-4 text-mute">No issues{query ? ' match your search' : ''}.</Card>}
          {list.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-pressed={i.id === selectedId}
              onClick={() => setParams(query ? { q: query, id: i.id } : { id: i.id }, { replace: true })}
              className={cx('flex w-full cursor-pointer items-center gap-3 rounded-card border-2 border-solid bg-white p-3.5 text-left text-ink shadow-stat', i.id === selectedId ? 'border-primary' : 'border-transparent')}
            >
              <IconBadge tone={ISSUE_ICON[i.type].tone} size={46} radius={14}>
                {ISSUE_ICON[i.type].icon}
              </IconBadge>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">{i.title}</span>
                <span className="block text-caption text-mute">
                  {i.reference?.slice(0, 7) ?? 'No order'} · {i.reported_by === 'customer' ? 'Customer' : i.reported_by === 'rider' ? 'Rider' : 'Driver'} · {timeAgo(i.at)}
                </span>
              </span>
              <Chip tone={i.status === 'resolved' ? 'green' : i.urgent ? 'red' : 'amber'}>{i.status === 'resolved' ? 'Resolved' : i.urgent ? 'Urgent' : 'Open'}</Chip>
            </button>
          ))}
        </div>
        <div className="rise-3 min-w-0 flex-1">{selected && <IssueDetail key={selected.id} issue={selected} />}</div>
      </div>
    </AdminFrame>
  )
}

function IssueDetail({ issue }: { issue: AdminIssue }) {
  const order = useAdminOrder(issue.reference)
  const people = useIssuePeople(issue.id)
  const actions = actionsFor(issue)
  const [action, setAction] = useState<ResolutionAction>(actions[0])
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState('50')
  const resolve = useAdminMutation(() => api.resolveIssue(issue.id, action, reason, action === 'goodwill_points' ? Number(points) : undefined))

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-mute">
            {issue.number}
            {issue.reference && ` · ${issue.reference.slice(0, 7)}`}
          </div>
          <h2 className="m-0 text-[22px] font-extrabold">{issue.title}</h2>
        </div>
        <Chip tone={issue.status === 'resolved' ? 'green' : issue.urgent ? 'red' : 'amber'}>{issue.status === 'resolved' ? 'Resolved' : issue.urgent ? 'Urgent' : 'Open'}</Chip>
      </div>
      <blockquote className="m-0 rounded-input bg-[#F4F7FB] px-4 py-3">“{issue.message}”</blockquote>
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="m-0 mb-2 text-[16px] font-extrabold">Order timeline</h3>
          {!issue.reference && <p className="m-0 text-mute">Not about an order.</p>}
          {order.isPending && issue.reference && <LoadingBlock lines={2} label="Loading the order" />}
          {order.isError && <ErrorBlock error={order.error} onRetry={() => order.refetch()} />}
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
            {order.data?.timeline.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <b>{t.label}</b> · {formatTime(t.at)}
              </li>
            ))}
            {issue.type === 'code_not_working' && issue.status === 'open' && (
              <li className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full bg-red-solid" aria-hidden="true" />
                <b>Code failed</b> · {formatTime(issue.at)}
              </li>
            )}
          </ol>
        </section>
        <section>
          <h3 className="m-0 mb-2 text-[16px] font-extrabold">People</h3>
          {people.isError && <ErrorBlock error={people.error} onRetry={() => people.refetch()} />}
          {people.data?.length === 0 && <p className="m-0 text-mute">{issue.reporter_name} ({issue.reported_by})</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {people.data?.map((p) => (
              <li key={p.phone} className="flex items-center gap-3 border-0 border-b border-solid border-row-line py-2.5 last:border-b-0">
                <Avatar name={p.name} size={40} />
                <span className="flex-1">
                  <span className="block font-bold">{p.name}</span>
                  <span className="block text-caption text-mute">{p.role}</span>
                </span>
                <a href={`tel:${p.phone}`} className="mo-mini mo-mini-alt hit-44 no-underline">
                  Call
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {issue.status === 'resolved' && issue.resolution ? (
        <Notice tone="success">
          <b>{RESOLUTION_LABEL[issue.resolution.action]}</b>
          {issue.resolution.points ? ` (${issue.resolution.points} points)` : ''} by {issue.resolution.by}, {formatDateTime(issue.resolution.at)}. Reason: {issue.resolution.reason}
        </Notice>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            resolve.mutate(undefined)
          }}
        >
          <h3 className="m-0 text-[16px] font-extrabold">Resolution</h3>
          <Pills label="Resolution" value={action} onChange={setAction} options={actions.map((a) => ({ value: a, label: RESOLUTION_LABEL[a] }))} />
          {action === 'goodwill_points' && (
            <TextField label="Points to add" inputMode="numeric" className="max-w-[200px]" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ''))} />
          )}
          {action === 'confirm_without_code' && <p className="m-0 text-caption text-mute">Use only after you have spoken to both people and the customer confirms the water was poured in full.</p>}
          {action === 'reassign' && <p className="m-0 text-caption text-mute">The order goes back to the pool; assign another rider on the Orders page.</p>}
          <TextField label="Reason (saved in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called customer, confirmed 600 L received in tank." />
          {resolve.isError && <Notice tone="error">{errorMessage(resolve.error)}</Notice>}
          <Button type="submit" block={false} className="self-start px-7" loading={resolve.isPending}>
            Apply and resolve
          </Button>
        </form>
      )}
    </Card>
  )
}
