import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { IconBadge, type IconBadgeTone } from './Content'

/** Colour of the small note under a stat value. */
export type StatNoteTone = 'green' | 'amber' | 'red' | 'mute'

const NOTE: Record<StatNoteTone, string> = {
  green: 'text-green',
  amber: 'text-amber',
  red: 'text-red',
  mute: 'text-mute',
}

interface StatCardProps {
  icon: ReactNode
  tone: IconBadgeTone
  value: ReactNode
  label: ReactNode
  note?: ReactNode
  noteTone?: StatNoteTone
  /** Colour for the value itself (the design colours "Awaiting rider" amber). */
  valueClassName?: string
}

/** Admin dashboard stat (`.stat`): 48 px icon badge, big value, label and a note. */
export function StatCard({ icon, tone, value, label, note, noteTone = 'mute', valueClassName }: StatCardProps) {
  return (
    <div className="flex items-center gap-3.5 rounded-stat border border-card-line bg-white p-4 shadow-stat">
      <IconBadge tone={tone} size={48} radius={14}>
        {icon}
      </IconBadge>
      <div>
        <div className={cx('text-[24px] leading-[1.1] font-extrabold tracking-[-0.5px]', valueClassName)}>{value}</div>
        <div className="font-semibold">{label}</div>
        {note && <div className={cx('text-chip font-bold', NOTE[noteTone])}>{note}</div>}
      </div>
    </div>
  )
}

export interface Column<Row> {
  /** Header text. */
  header: string
  /** Cell content for a row. */
  cell: (row: Row) => ReactNode
  /** Extra classes for this column's cells. */
  className?: string
}

interface DataTableProps<Row> {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Accessible table caption (visually hidden). */
  caption: string
  /** Highlights a row (sky background) and marks it `aria-selected`. */
  selectedKey?: string
  /** Shown instead of the body when there are no rows. */
  empty?: ReactNode
}

/**
 * Admin table (`.tbl`): 13 px text, muted bold headers, light row lines. Wrap
 * it in a card with `overflow-x-auto` so it scrolls sideways on small screens.
 */
export function DataTable<Row>({ columns, rows, rowKey, caption, selectedKey, empty }: DataTableProps<Row>) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.header}
              scope="col"
              className="border-b border-line px-3 py-2.5 text-left text-chip font-bold whitespace-nowrap text-mute"
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty ? (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6 text-center text-mute">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const key = rowKey(row)
            const selected = key === selectedKey
            return (
              <tr key={key} aria-selected={selectedKey === undefined ? undefined : selected} className={cx(selected && 'bg-sky')}>
                {columns.map((c) => (
                  <td key={c.header} className={cx('border-b border-row-line px-3 py-[11px] whitespace-nowrap', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

/** Colours of `.mini`; `danger-soft` is the light red "Remove" in c-saved. */
export type MiniTone = 'primary' | 'alt' | 'danger' | 'danger-soft'

/** Small table action (`.mini`, 32 px) with an invisible 44 px hit area. */
export function MiniButton({
  tone = 'primary',
  className,
  children,
  type = 'button',
  ...rest
}: { tone?: MiniTone; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={miniClasses(tone, className)} {...rest}>
      {children}
    </button>
  )
}

/** `.mini` as a router link. */
export function MiniLink({ to, tone = 'primary', className, children }: { to: string; tone?: MiniTone; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={miniClasses(tone, className)}>
      {children}
    </Link>
  )
}

function miniClasses(tone: MiniTone, className?: string) {
  return cx(
    'mo-mini hit-44',
    `mo-mini-${tone}`,
    className,
  )
}
