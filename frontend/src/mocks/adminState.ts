/**
 * Small helpers over the admin part of the mock state, used by the customer,
 * partner and admin mocks alike (one database). Pure functions on MockState;
 * callers wrap them in `mutate`.
 */
import type { ActivityKind, AdminStation, PapersState, SamplePriceTable } from '../domain/admin'
import type { MockState } from './seed'
import { newId } from './store'

/** The price list in force: the newest version (FR-024). */
export function currentPrices(s: MockState): SamplePriceTable {
  return s.admin.prices[s.admin.prices.length - 1]
}

/**
 * Papers state (FR-012): no papers uploaded is `missing`; no expiry date is
 * valid with `[DATE]` still to fill in; within 14 days of expiry `expiring`.
 */
export function papersState(st: Pick<AdminStation, 'papers'>, now = Date.now()): PapersState {
  if (!st.papers.file_name) return 'missing'
  const until = st.papers.valid_until
  if (!until) return 'valid'
  const end = Date.parse(`${until}T23:59:59+01:00`)
  if (end < now) return 'expired'
  return end - now <= 14 * 86_400_000 ? 'expiring' : 'valid'
}

/** A station partners may collect from: open, with papers not expired (FR-012). */
export function stationUsable(st: AdminStation, now = Date.now()): boolean {
  const papers = papersState(st, now)
  return st.open && papers !== 'expired' && papers !== 'missing'
}

/**
 * The station for a new order to `address`: a usable station in the same
 * area, else the area's serving station, else any usable station. Null when
 * none is open with valid papers, so the order cannot be placed.
 */
export function stationForAddress(s: MockState, address: string, now = Date.now()): AdminStation | null {
  const a = address.toLowerCase()
  const usable = s.admin.stations.filter((st) => stationUsable(st, now))
  const sameArea = usable.find((st) => a.includes(st.area.toLowerCase()))
  if (sameArea) return sameArea
  const area = s.admin.areas.find((x) => x.enabled && a.includes(x.name.toLowerCase()))
  const serving = area && usable.find((st) => st.id === area.station_id)
  return serving ?? usable[0] ?? null
}

export function addActivity(s: MockState, kind: ActivityKind, text: string, reference: string | null = null, at = new Date().toISOString()): void {
  s.admin.activity.unshift({ id: newId('ac'), at, kind, text, reference })
  s.admin.activity.splice(50)
}

/** Record an admin action. `reason` is required for sensitive actions (suspend, resolve, cancel). */
export function addAudit(s: MockState, actor: string, action: string, reason: string | null = null): void {
  s.admin.audit.unshift({ id: newId('au'), at: new Date().toISOString(), actor, action, reason })
}

export function addAdminNotification(s: MockState, title: string, body: string, link: string): void {
  s.admin.notifications.unshift({ id: newId('an'), at: new Date().toISOString(), title, body, read: false, link })
}

/** Next support issue number, shared by every reporter: "#CP-013". */
export function nextIssueNumber(s: MockState): string {
  const n = s.admin.next_issue_number++
  return `#CP-${String(n).padStart(3, '0')}`
}

/** Next free fleet code for a new partner: KK-0NN for Keke, TK-1NN for tankers. */
export function nextFleetCode(s: MockState, vehicle: 'keke' | 'tanker'): string {
  const prefix = vehicle === 'keke' ? 'KK-' : 'TK-'
  const used = Object.values(s.partners)
    .map((p) => p.fleet_code)
    .filter((c) => c.startsWith(prefix))
    .map((c) => Number(c.slice(3)))
  const next = Math.max(vehicle === 'keke' ? 0 : 100, ...used) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}
