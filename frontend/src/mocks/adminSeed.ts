/**
 * Admin seed data: the SAMPLE records drawn on the admin screens (`a-*`):
 * refill stations, price list versions, support issues, recent activity and
 * staff. Service areas are the landing page's sample list (landing-v1.md).
 *
 * Demo admin sign-in (mock mode only): phone 0800 000 0100, password
 * DEMO_PASSWORD from seed.ts.
 */
import type {
  ActivityEntry,
  AdminIssue,
  AdminNotification,
  AdminSettings,
  AdminStation,
  AuditEntry,
  PriceList,
  ServiceArea,
  StaffMember,
} from '../domain/admin'
import type { CashMockData } from './adminCashMock'
import { DEFAULT_PRICE_LIST } from './pricing'
import { lagosAt, lagosToday } from './time'

export const DEMO_ADMIN_ID = 'user-admin'
export const ADMIN_NAME = 'Chidimma M.'

/** Admin-only state in the mock database. */
export interface AdminData {
  stations: AdminStation[]
  areas: ServiceArea[]
  /** Price list versions, oldest first; the last one is current. */
  prices: PriceList[]
  issues: AdminIssue[]
  /** Next support issue number (#CP-0NN), shared by customer, rider and admin reports. */
  next_issue_number: number
  audit: AuditEntry[]
  activity: ActivityEntry[]
  notifications: AdminNotification[]
  staff: StaffMember[]
  settings: AdminSettings
  /** Cash records for K3 to K5 (#19); created on first use, so older saved demos have none. */
  cash?: CashMockData
}

function minutesAgo(now: Date, m: number): string {
  return new Date(now.getTime() - m * 60_000).toISOString()
}

/** The design's three versions: v1 first list, v2 Keke fee ₦500, v3 Tanker 750 gal ₦24,000 → ₦25,000. */
function priceVersions(): PriceList[] {
  const v3 = structuredClone(DEFAULT_PRICE_LIST)
  const v2 = structuredClone(v3)
  v2.version = 2
  v2.created_at = '2026-10-01T09:00:00Z'
  v2.note = 'Keke delivery fee set to ₦500'
  v2.tanker[750].water_minor_units.borehole = 2_400_000
  const v1 = structuredClone(v2)
  v1.version = 1
  v1.created_at = '2026-09-01T09:00:00Z'
  v1.note = 'First price list'
  v1.keke.delivery_minor_units = 40_000
  return [v1, v2, v3]
}

export function seedAdmin(now = new Date()): AdminData {
  const stations: AdminStation[] = [
    {
      id: 'st-gra',
      name: 'GRA Station',
      address: '7 Abakaliki Road, GRA',
      area: 'GRA',
      open: true,
      hours: '6 AM to 8 PM',
      products: 'Keke cans, tanker',
      capacity: null,
      papers: { verified_on: '2026-10-01', valid_until: null, file_name: 'gra-water-source-2026.pdf' },
      loading_now: 3,
      today: 22,
      loading_log: [
        { at: lagosToday(11, 20, now), reference: 'MO-7KQ2M9XH4T', partner: 'Chinedu Okafor', quantity: '25 L × 24 (600 L · 150 gal)' },
        { at: lagosToday(9, 5, now), reference: 'MO-1QW8ZR5KTD', partner: 'Chinedu Okafor', quantity: '50 L × 12 (600 L · 150 gal)' },
      ],
    },
    {
      id: 'st-ogui',
      name: 'Ogui Station',
      address: 'Ogui Road, Ogui',
      area: 'Ogui',
      open: true,
      hours: '6 AM to 8 PM',
      products: 'Keke cans, tanker',
      capacity: null,
      papers: { verified_on: '2026-09-20', valid_until: null, file_name: 'ogui-water-source-2026.pdf' },
      loading_now: 2,
      today: 15,
      loading_log: [],
    },
    {
      id: 'st-indep',
      name: 'Independence Layout',
      address: 'Zik Avenue junction',
      area: 'Independence Layout',
      open: true,
      hours: '7 AM to 7 PM',
      products: 'Keke cans, tanker',
      capacity: null,
      papers: { verified_on: '2026-09-28', valid_until: null, file_name: 'independence-water-source-2026.pdf' },
      loading_now: 4,
      today: 19,
      loading_log: [{ at: lagosToday(7, 15, now), reference: 'MO-6TPB4WX9LR', partner: 'Emeka David', quantity: '500 gal · 2,000 L' }],
    },
    {
      id: 'st-ekulu',
      name: 'Trans-Ekulu Station',
      address: 'Ekulu Road',
      area: 'Trans-Ekulu',
      open: true,
      hours: '7 AM to 6 PM',
      products: 'Tanker',
      capacity: null,
      // Expires in 9 days, as drawn.
      papers: { verified_on: '2026-04-20', valid_until: new Date(now.getTime() + 9 * 86_400_000).toISOString().slice(0, 10), file_name: 'ekulu-water-source-2026.pdf' },
      loading_now: 1,
      today: 6,
      loading_log: [],
    },
    {
      id: 'st-newhaven',
      name: 'New Haven Station',
      address: 'Chime Avenue, New Haven',
      area: 'New Haven',
      open: false,
      hours: '6 AM to 8 PM',
      products: 'Keke cans',
      capacity: null,
      papers: { verified_on: '2026-09-15', valid_until: null, file_name: 'newhaven-water-source-2026.pdf' },
      loading_now: 0,
      today: 0,
      loading_log: [],
    },
  ]

  const area = (id: string, name: string, station_id: string, distance_km: number): ServiceArea => ({
    id,
    name,
    enabled: true,
    station_id,
    distance_km,
    fixed_fee_minor_units: null,
  })
  const areas: ServiceArea[] = [
    area('ar-gra', 'GRA', 'st-gra', 2.5),
    area('ar-ogui', 'Ogui', 'st-ogui', 2.0),
    area('ar-indep', 'Independence Layout', 'st-indep', 3.0),
    area('ar-ekulu', 'Trans-Ekulu', 'st-ekulu', 3.5),
    area('ar-abakpa', 'Abakpa', 'st-ekulu', 6.0),
    area('ar-newhaven', 'New Haven', 'st-newhaven', 2.5),
    area('ar-thinkers', 'Thinkers Corner', 'st-gra', 5.5),
    area('ar-anyika', 'Anyika', 'st-indep', 7.0),
    area('ar-emene', 'Emene', 'st-ekulu', 9.0),
    area('ar-uwani', 'Uwani', 'st-ogui', 3.0),
  ]

  const issues: AdminIssue[] = [
    {
      id: 'is-12',
      number: '#CP-012',
      type: 'code_not_working',
      title: 'Delivery code not working',
      message: 'Water is poured but the code keeps failing. Customer is with me.',
      reference: 'MO-7KQ2M9XH4T',
      reported_by: 'rider',
      reporter_name: 'Chinedu Okafor',
      at: minutesAgo(now, 4),
      urgent: true,
      status: 'open',
      resolution: null,
    },
    {
      id: 'is-11',
      number: '#CP-011',
      type: 'late',
      title: 'Delivery was late',
      message: 'The water came almost an hour after the time I was given.',
      reference: 'MO-2BQ7TV9HXA',
      reported_by: 'customer',
      reporter_name: 'Adaeze Nwosu',
      at: minutesAgo(now, 18),
      urgent: false,
      status: 'open',
      resolution: null,
    },
    {
      id: 'is-10',
      number: '#CP-010',
      type: 'customer_unreachable',
      title: 'Customer not reachable',
      message: 'I called twice and nobody picked up. The gate is locked.',
      reference: 'MO-8ZRW2KTM5C',
      reported_by: 'driver',
      reporter_name: 'Emeka David',
      at: minutesAgo(now, 60),
      urgent: false,
      status: 'open',
      resolution: null,
    },
    {
      id: 'is-08',
      number: '#CP-008',
      type: 'wrong_quantity',
      title: 'Wrong quantity',
      message: 'I think the tank was not filled to 750 gallons.',
      reference: 'MO-5KL2ZT8QWD',
      reported_by: 'customer',
      reporter_name: 'Adaeze Nwosu',
      at: lagosToday(15, 0, now, 1),
      urgent: false,
      status: 'resolved',
      resolution: { action: 'goodwill_points', reason: 'Driver confirmed 750 gal on the meter photo; goodwill points for the wait.', by: ADMIN_NAME, at: lagosToday(16, 0, now, 1), points: 50 },
    },
  ]

  const activity: ActivityEntry[] = [
    { id: 'ac1', at: minutesAgo(now, 2), kind: 'accepted', text: 'MO-7KQ2 accepted by Chinedu Okafor', reference: 'MO-7KQ2M9XH4T' },
    { id: 'ac2', at: minutesAgo(now, 5), kind: 'new_order', text: 'New order MO-3HT8 from a customer', reference: 'MO-3HT8WQ2KZP' },
    { id: 'ac3', at: minutesAgo(now, 8), kind: 'online', text: 'Tanker driver Emeka David went online', reference: null },
    { id: 'ac4', at: minutesAgo(now, 12), kind: 'delivered', text: 'MO-1QW8 delivered, code verified', reference: 'MO-1QW8ZR5KTD' },
    { id: 'ac5', at: minutesAgo(now, 18), kind: 'complaint', text: 'Complaint: delivery delay on MO-2BQ7', reference: 'MO-2BQ7TV9HXA' },
  ]

  const notifications: AdminNotification[] = [
    { id: 'an1', at: minutesAgo(now, 4), title: 'Urgent: delivery code not working', body: 'Chinedu Okafor reported MO-7KQ2. Customer is with the rider.', read: false, link: '/admin/support' },
    { id: 'an2', at: minutesAgo(now, 5), title: 'New order waiting for a rider', body: 'MO-3HT8 · 50 L × 12 cans (600 L · 150 gal) · Independence Layout.', read: false, link: '/admin/orders' },
    { id: 'an3', at: minutesAgo(now, 40), title: 'Driver waiting for approval', body: 'Sunday Bello (Tanker, ENU 330 XB) uploaded his papers.', read: false, link: '/admin/riders' },
    { id: 'an4', at: lagosToday(8, 0, now), title: 'Station papers expire soon', body: 'Trans-Ekulu Station papers expire in 9 days.', read: true, link: '/admin/stations' },
    { id: 'an5', at: lagosToday(9, 30, now), title: 'Payment to verify', body: 'Obinna Agu sent a bank transfer for MO-8ZRW.', read: true, link: '/admin/payments' },
  ]

  const audit: AuditEntry[] = [
    { id: 'au1', at: minutesAgo(now, 5), actor: ADMIN_NAME, action: 'Assigned MO-3HT8 to Chinedu Okafor', reason: null },
    { id: 'au2', at: lagosToday(16, 0, now, 1), actor: ADMIN_NAME, action: 'Resolved #CP-008 (Add goodwill points, 50)', reason: 'Driver confirmed 750 gal on the meter photo; goodwill points for the wait.' },
    { id: 'au3', at: lagosAt('2026-10-10', 10, 0), actor: ADMIN_NAME, action: 'Saved price list v3', reason: 'Tanker 750 gal ₦24,000 → ₦25,000' },
    { id: 'au4', at: lagosAt('2026-10-08', 12, 30), actor: ADMIN_NAME, action: 'Suspended Daniel Nnadi', reason: 'Two missed deliveries reported by customers; papers out of date.' },
  ]

  const staff: StaffMember[] = [
    { id: DEMO_ADMIN_ID, name: ADMIN_NAME, role: 'Super admin', phone: '+2348000000100', last_active: minutesAgo(now, 1) },
    { id: 'staff-ngozi', name: 'Ngozi A.', role: 'Dispatcher', phone: '+2348000000110', last_active: minutesAgo(now, 25) },
    { id: 'staff-tobe', name: 'Tobe E.', role: 'Support', phone: '+2348000000111', last_active: lagosToday(18, 40, now, 1) },
  ]

  return {
    stations,
    areas,
    prices: priceVersions(),
    issues,
    next_issue_number: 13,
    audit,
    activity,
    notifications,
    staff,
    settings: { support_phone: null, support_whatsapp: null, support_hours: null, code_time_limit: null, safe_load: { keke: null, tanker: null } },
  }
}
