import { useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StationDoorIcon } from '../../../components/icons/icons'
import { ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { Button } from '../../../components/ui/Button'
import { CARD, Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { IconBadge, KeyValue } from '../../../components/ui/Content'
import { Toggle } from '../../../components/ui/Controls'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { AdminStationView, StationInput } from '../../../domain/admin'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { cx } from '../../../lib/cx'
import { formatCalendarDate, formatDateTime } from '../../../lib/format/datetime'
import * as api from '../adminApi'
import { PAPERS_LABEL, PAPERS_TONE, daysUntil } from '../adminFormat'
import { AdminFrame, PageHead, SplitLayout } from '../AdminParts'
import { useAdminMutation, useStations } from '../queries'

function papersChip(st: AdminStationView) {
  if (st.papers_state === 'expiring' && st.papers.valid_until) return <Chip tone="amber">Expires in {daysUntil(st.papers.valid_until)} days</Chip>
  return <Chip tone={PAPERS_TONE[st.papers_state]}>{PAPERS_LABEL[st.papers_state]}</Chip>
}

/**
 * Refill stations (`a-stations`): riders only collect from open stations with
 * valid water-source papers (FR-012). `?id=` selects a station; "Add station"
 * opens the form in the side panel.
 */
export function Stations() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const list = useStations(query)
  const rows = list.data ?? []
  const mode = params.get('id') === 'new' ? 'new' : 'view'
  const selected = mode === 'new' ? null : (rows.find((s) => s.id === params.get('id')) ?? rows[0] ?? null)

  return (
    <AdminFrame searchPlaceholder="Search stations" onSearch={setQuery}>
      <SplitLayout
        sideWidth="lg:w-[380px]"
        main={
          <>
            <PageHead
              title="Refill stations"
              sub="Riders only collect from open stations with valid water-source papers."
              actions={
                <Button size="sm" block={false} onClick={() => setParams({ id: 'new' }, { replace: true })}>
                  + Add station
                </Button>
              }
            />
            {list.isPending && <LoadingBlock label="Loading stations" />}
            {list.isError && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
            {list.isSuccess && rows.length === 0 && <p className="m-0 text-mute">No stations match your search.</p>}
            <div className="rise-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
              {rows.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={selected?.id === st.id}
                  onClick={() => setParams({ id: st.id }, { replace: true })}
                  className={cx(
                    'flex cursor-pointer flex-col items-start gap-1.5 rounded-card border-2 border-solid bg-white p-4 text-left text-ink shadow-stat',
                    selected?.id === st.id ? 'border-primary' : 'border-transparent',
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <IconBadge tone="teal" size={42} radius={12}>
                      <StationDoorIcon size={22} />
                    </IconBadge>
                    <Chip tone={st.open ? 'green' : 'red'}>{st.open ? 'Open' : 'Closed'}</Chip>
                  </span>
                  <span className="mt-1 text-[17px] font-extrabold">{st.name}</span>
                  <span className="text-[13px] text-mute">{st.address}</span>
                  <span className="text-[14px]">
                    <b>{st.loading_now}</b> loading now <b className="ml-3">{st.today}</b> today
                  </span>
                  {papersChip(st)}
                </button>
              ))}
            </div>
            <p className="m-0 text-caption text-mute">Loading counts are SAMPLE numbers.</p>
          </>
        }
        side={mode === 'new' ? <StationForm key="new" station={null} onDone={(id) => setParams(id ? { id } : {}, { replace: true })} /> : selected ? <StationPanel key={selected.id} st={selected} /> : null}
      />
    </AdminFrame>
  )
}

function StationPanel({ st }: { st: AdminStationView }) {
  const [tab, setTab] = useState<'info' | 'edit' | 'papers' | 'log'>('info')
  const toggle = useAdminMutation((open: boolean) => api.setStationOpen(st.id, open))
  return (
    <Card className="rise-2 flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[20px] font-extrabold">{st.name}</h2>
        <Toggle label={st.open ? `Close ${st.name}` : `Open ${st.name}`} tone="green" checked={st.open} disabled={toggle.isPending} onChange={(v) => toggle.mutate(v)} />
      </div>
      {toggle.isError && <Notice tone="error">{errorMessage(toggle.error)}</Notice>}
      {toggle.isSuccess && !st.open && <Notice>Closed. Partners were told to use another station.</Notice>}
      <div className="relative h-[150px] overflow-hidden rounded-stat bg-[#E9EEF2]" aria-hidden="true">
        <div className="absolute top-0 left-0 h-[42%] w-[42%] bg-[#E3E9EE]" />
        <div className="absolute right-0 bottom-0 h-[52%] w-[54%] bg-[#E3E9EE]" />
        <div className="absolute top-[8%] right-[6%] h-[30%] w-[30%] rounded-[10px] bg-[#D3EDD8]" />
        <div className="absolute top-[42%] left-0 h-2 w-full bg-white" />
        <div className="absolute top-0 left-[42%] h-full w-2 bg-white" />
        <div className="absolute top-[60%] left-[-10%] h-3 w-[130%] origin-left -rotate-[16deg] bg-[#FBE7A1]" />
        <span className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[12px] bg-[#0E7C8F] text-white shadow-[0_4px_10px_rgba(10,37,64,.3)]">
          <StationDoorIcon size={22} />
        </span>
      </div>
      <div className="text-[14px]">
        <KeyValue label="Address" value={st.address} />
        <KeyValue label="Opening hours" value={st.hours} />
        <KeyValue label="Products" value={st.products || 'Not set'} />
        <KeyValue label="Daily capacity" value={st.capacity ?? '[CAPACITY]'} />
      </div>
      <div className={cx('rounded-card px-4 py-3 text-[14px]', st.papers_state === 'valid' ? 'bg-green-bg' : st.papers_state === 'expiring' ? 'bg-[#FFF7E2]' : 'bg-red-bg')}>
        <div className="font-extrabold">Water source papers</div>
        {st.papers.file_name ? (
          <div>
            {st.papers.verified_on ? `Verified on ${formatCalendarDate(st.papers.verified_on)}. ` : ''}
            Valid until {st.papers.valid_until ? formatCalendarDate(st.papers.valid_until) : '[DATE]'}.
            {st.papers_state === 'expired' && ' Expired: this station cannot be used until new papers are uploaded.'}
          </div>
        ) : (
          <div>No papers uploaded. The station cannot be opened until they are.</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['edit', 'Edit station'],
            ['papers', 'Upload papers'],
            ['log', 'Loading log'],
          ] as const
        ).map(([key, text]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(tab === key ? 'info' : key)} className={cx('mo-mini hit-44 h-10 px-4 text-[14px]', tab === key ? 'mo-mini-primary' : 'mo-mini-alt')}>
            {text}
          </button>
        ))}
      </div>
      {tab === 'edit' && <StationForm station={st} onDone={() => setTab('info')} />}
      {tab === 'papers' && <PapersForm st={st} onDone={() => setTab('info')} />}
      {tab === 'log' && (
        <div className="text-[13.5px]">
          {st.loading_log.length === 0 && <p className="m-0 text-mute">No loads recorded yet today.</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {st.loading_log.map((l) => (
              <li key={`${l.reference}-${l.at}`} className="border-0 border-b border-solid border-row-line py-2 last:border-b-0">
                <b>{l.reference.slice(0, 7)}</b> · {l.quantity} · {l.partner}
                <span className="block text-chip text-mute">{formatDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function StationForm({ station, onDone }: { station: AdminStationView | null; onDone: (id: string | null) => void }) {
  const [v, setV] = useState<StationInput>({
    name: station?.name ?? '',
    address: station?.address ?? '',
    area: station?.area ?? '',
    hours: station?.hours ?? '6 AM to 8 PM',
    products: station?.products ?? 'Keke cans, tanker',
    capacity: station?.capacity ?? '',
  })
  const save = useAdminMutation(() => api.saveStation(station?.id ?? null, v))
  const err = (f: string) => (save.error instanceof ApiError && Array.isArray(save.error.details) ? (save.error.details as { loc: string[]; msg: string }[]).find((d) => d.loc.includes(f))?.msg : undefined)
  const set = (k: keyof StationInput) => (e: ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  // Inside the station panel when editing; its own card when adding.
  return (
    <div className={cx('flex flex-col gap-3', !station && cx(CARD, 'rise-2 p-4'))}>
      {!station && <h2 className="m-0 text-[20px] font-extrabold">Add a station</h2>}
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(undefined, { onSuccess: (st) => onDone(st.id) })
        }}
      >
        <TextField label="Name" value={v.name} onChange={set('name')} placeholder="e.g. Abakpa Station" error={err('name')} />
        <TextField label="Address" value={v.address} onChange={set('address')} placeholder="e.g. 3 Nike Road, Abakpa" error={err('address')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Area" value={v.area} onChange={set('area')} placeholder="e.g. Abakpa" error={err('area')} />
          <TextField label="Opening hours" value={v.hours} onChange={set('hours')} error={err('hours')} />
        </div>
        <TextField label="Products" value={v.products} onChange={set('products')} />
        <TextField label="Daily capacity" optional value={v.capacity ?? ''} onChange={set('capacity')} placeholder="Shows [CAPACITY] until set" />
        {save.isError && !err('name') && !err('address') && !err('area') && !err('hours') && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        {!station && <p className="m-0 text-caption text-mute">A new station starts closed. Upload its water-source papers, then open it.</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" block={false} className="px-5" loading={save.isPending}>
            {station ? 'Save changes' : 'Add station'}
          </Button>
          <Button variant="line" size="sm" block={false} className="px-5" onClick={() => onDone(station?.id ?? null)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Record new papers: a file (the mock keeps only its name) and the expiry date. */
function PapersForm({ st, onDone }: { st: AdminStationView; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [until, setUntil] = useState('')
  const upload = useAdminMutation(() => api.uploadStationPapers(st.id, file!.name, until || null))
  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-card bg-[#F4F7FB] p-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (file) upload.mutate(undefined, { onSuccess: onDone })
      }}
    >
      <label className="flex flex-col gap-1.5 text-[14px] font-bold">
        Papers (PDF or photo)
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[14px] font-normal" />
      </label>
      <TextField label="Valid until" optional type="date" value={until} onChange={(e) => setUntil(e.target.value)} hint="Leave empty if the papers show no date ([DATE])." />
      {upload.isError && <Notice tone="error">{errorMessage(upload.error)}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" block={false} className="px-5" disabled={!file} loading={upload.isPending}>
          Save papers
        </Button>
        <Button variant="line" size="sm" block={false} className="px-5" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
