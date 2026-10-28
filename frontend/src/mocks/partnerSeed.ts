/**
 * Seed data for delivery partners, from the design's SAMPLE records: Chinedu
 * Okafor (Keke, `r-*` screens) and Emeka David (Tanker, `t-*` screens).
 *
 * Demo sign-in (mock mode only): phone 0800 000 0101 (Keke) or
 * 0800 000 0102 (Tanker), password DEMO_PASSWORD from seed.ts.
 */
import { choiceLitres } from '../domain/orders'
import type { PartnerData, StoredJob } from './seed'
import type { MockUser } from './seed'
import { lagosToday } from './time'

export const DEMO_RIDER_ID = 'user-chinedu'
export const DEMO_DRIVER_ID = 'user-emeka'
/** More SAMPLE partners from the admin screens (a-riders, a-orders). Not demo sign-ins. */
export const IFEANYI_ID = 'user-ifeanyi'
export const SUNDAY_ID = 'user-sunday'
export const DANIEL_ID = 'user-daniel'

/** An ISO time `m` minutes before `now`, for the seeded holds. */
function minutesAgo(now: Date, m: number): string {
  return new Date(now.getTime() - m * 60_000).toISOString()
}

type JobSeed = Partial<StoredJob> & Pick<StoredJob, 'reference' | 'choice' | 'station' | 'customer' | 'earning_minor_units'>

function job(j: JobSeed): StoredJob {
  return {
    quantity_litres: choiceLitres(j.choice) ?? 0,
    tank_note: null,
    instructions: null,
    stage: 'available',
    assigned_by: null,
    payment_status: 'unpaid',
    code_tries_left: 3,
    code_resend_at: null,
    accepted_at: null,
    collected_at: null,
    delivered_at: null,
    pickup: null,
    partner_id: null,
    declined_by: [],
    mock_code: '135790',
    remaining: null,
    created_at: '',
    ...j,
  }
}

const GRA = { name: 'GRA Refill Station', address: '7 Abakaliki Road, Enugu', area: 'GRA' }
const OGUI = { name: 'Ogui Refill Station', address: 'Ogui Road, Ogui', area: 'Ogui' }
const INDEP = { name: 'Independence Layout Station', address: 'Zik Avenue junction', area: 'Independence Layout' }

function keke(size: 25 | 50, count: number) {
  return { delivery_type: 'keke' as const, can_size_litres: size, can_count: count }
}
function tanker(type: 'ground' | 'overhead', size: 500 | 750 | 1000) {
  return { delivery_type: 'tanker' as const, tank_type: type, tank_size_gallons: size, source: 'borehole' as const }
}

export function seedPartners(now = new Date(), password: string): { users: MockUser[]; partners: Record<string, PartnerData>; jobs: StoredJob[] } {
  const users: MockUser[] = [
    { id: DEMO_RIDER_ID, name: 'Chinedu Okafor', phone: '+2348000000101', role: 'driver', phone_verified: true, password },
    { id: DEMO_DRIVER_ID, name: 'Emeka David', phone: '+2348000000102', role: 'driver', phone_verified: true, password },
    { id: IFEANYI_ID, name: 'Ifeanyi James', phone: '+2348000000103', role: 'driver', phone_verified: true, password },
    { id: SUNDAY_ID, name: 'Sunday Bello', phone: '+2348000000104', role: 'driver', phone_verified: true, password },
    { id: DANIEL_ID, name: 'Daniel Nnadi', phone: '+2348000000105', role: 'driver', phone_verified: true, password },
  ]

  const jobs: StoredJob[] = [
    // Chinedu's active delivery, linked to the customer order of the same reference.
    job({
      reference: 'MO-7KQ2M9XH4T',
      choice: keke(25, 24),
      station: { ...GRA, distance_km: 3.4, minutes: 8 },
      customer: { name: '12 Lakeview Street, GRA', address: '12 Lakeview Street, GRA, Enugu', area: 'GRA', landmark: 'Beside Parkview Hotel', distance_km: 7.8, minutes: 17, contact_name: 'Adaeze Nwosu', phone: '+2348031234567' },
      instructions: 'Call 5 minutes before you arrive. Tank is behind the house.',
      earning_minor_units: 250_000,
      stage: 'collected',
      partner_id: DEMO_RIDER_ID,
      accepted_at: lagosToday(11, 2, now),
      collected_at: lagosToday(11, 20, now),
      pickup: { loaded: true, receipt: true, photo_url: null, gallons_loaded: null },
      code_resend_at: new Date(now.getTime() + 105_000).toISOString(),
      mock_code: null,
      remaining: { distance_km: 0.8, minutes: 3 },
    }),
    // Assigned to Chinedu by admin, not accepted yet (r-assigned).
    job({
      reference: 'MO-3HT8WQ2KZP',
      choice: keke(50, 12),
      station: { ...GRA, distance_km: 2.1, minutes: 6 },
      customer: { name: '8 Zion Close, Independence Layout', address: '8 Zion Close, Independence Layout', area: 'Independence Layout', landmark: null, distance_km: 5.2, minutes: 12, contact_name: 'Ifeoma Eze', phone: '+2348065550192' },
      earning_minor_units: 300_000,
      stage: 'assigned',
      assigned_by: 'Chidimma M.',
      partner_id: DEMO_RIDER_ID,
    }),
    // Keke pool (r-available): no countdown, first partner to accept gets it.
    job({ reference: 'MO-6RTA2KXP9B', choice: keke(25, 24), station: { ...GRA, distance_km: 3.4, minutes: 8 }, customer: { name: '3 Ridge Road, GRA', address: '3 Ridge Road, GRA, Enugu', area: 'GRA', distance_km: 7.8, minutes: 17, contact_name: 'Uche Obi', phone: '+2348000000201' }, earning_minor_units: 250_000, instructions: 'Gate code at the security post.' }),
    job({ reference: 'MO-8WQ3NB7RTE', choice: keke(50, 12), station: { ...GRA, distance_km: 2.1, minutes: 6 }, customer: { name: '14 Owerri Road, Independence Layout', address: '14 Owerri Road, Independence Layout', area: 'Independence Layout', distance_km: 5.2, minutes: 12, contact_name: 'Nkem Ude', phone: '+2348000000202' }, earning_minor_units: 300_000 }),
    job({ reference: 'MO-2HX9TQ4MZA', choice: keke(25, 30), station: { ...OGUI, distance_km: 1.6, minutes: 6 }, customer: { name: '22 Market Lane, Ogui', address: '22 Market Lane, Ogui', area: 'Ogui', distance_km: 4.0, minutes: 9, contact_name: 'Ada Eze', phone: '+2348000000203' }, earning_minor_units: 280_000 }),
    job({ reference: 'MO-5JV8RK2PWD', choice: keke(25, 12), station: { ...OGUI, distance_km: 2.0, minutes: 7 }, customer: { name: '9 Station Road, Ogui', address: '9 Station Road, Ogui', area: 'Ogui', distance_km: 3.1, minutes: 8, contact_name: 'Obi Nnaji', phone: '+2348000000204' }, earning_minor_units: 250_000 }),
    job({ reference: 'MO-7MP4ZQ8XCN', choice: keke(50, 24), station: { ...GRA, distance_km: 2.6, minutes: 7 }, customer: { name: '5 Park Avenue, GRA', address: '5 Park Avenue, GRA, Enugu', area: 'GRA', distance_km: 2.9, minutes: 8, contact_name: 'Kene Ani', phone: '+2348000000205' }, earning_minor_units: 300_000 }),
    job({ reference: 'MO-9DKW3TR6YH', choice: keke(25, 60), station: { ...INDEP, distance_km: 1.2, minutes: 5 }, customer: { name: '11 Chime Close, Independence Layout', address: '11 Chime Close, Independence Layout', area: 'Independence Layout', distance_km: 2.4, minutes: 7, contact_name: 'Chioma Udo', phone: '+2348000000206' }, earning_minor_units: 250_000 }),
    // Tanker pool (t-available).
    job({ reference: 'MO-5KL3ZT8QWE', choice: tanker('overhead', 750), tank_note: 'Overhead tank on a 3 m stand. Use the pump hose. Do not climb if it is unsafe; report it instead.', station: { name: 'Ogui Station', address: 'Ogui Road', area: 'Ogui', distance_km: 2.8, minutes: 9 }, customer: { name: '27 Chime Avenue, New Haven', address: '27 Chime Avenue, New Haven', area: 'New Haven', distance_km: 6.1, minutes: 22, contact_name: 'Chukwudi Ilonze', phone: '+2348092227710' }, instructions: 'Overhead tank on a 3 m stand. Bring the pump hose. Gate opens at 8 AM.', earning_minor_units: 800_000 }),
    job({ reference: 'MO-8ZRW2KTM5C', choice: tanker('ground', 1000), station: { name: 'GRA Station', address: '7 Abakaliki Road, GRA', area: 'GRA', distance_km: 1.9, minutes: 7 }, customer: { name: '6 Ekulu Road, Trans-Ekulu', address: '6 Ekulu Road, Trans-Ekulu', area: 'Trans-Ekulu', distance_km: 4.4, minutes: 14, contact_name: 'Obinna Agu', phone: '+2348000000207' }, earning_minor_units: 950_000 }),
    job({ reference: 'MO-6TPA3VX8LQ', choice: tanker('ground', 500), station: { name: 'Independence Station', address: 'Zik Avenue junction', area: 'Independence Layout', distance_km: 1.2, minutes: 5 }, customer: { name: '19 Bisala Road, Independence Layout', address: '19 Bisala Road, Independence Layout', area: 'Independence Layout', distance_km: 2.6, minutes: 8, contact_name: 'Ngozi Okeke', phone: '+2348000000208' }, earning_minor_units: 650_000 }),
    job({ reference: 'MO-3TKZ8R2WQN', choice: tanker('overhead', 1000), tank_note: 'Overhead tank on the roof. Pump needed.', station: { name: 'GRA Station', address: '7 Abakaliki Road, GRA', area: 'GRA', distance_km: 2.2, minutes: 8 }, customer: { name: '2 Hospital Road, GRA', address: '2 Hospital Road, GRA, Enugu', area: 'GRA', distance_km: 3.0, minutes: 10, contact_name: 'Emeka Ike', phone: '+2348000000209' }, earning_minor_units: 950_000 }),
    // History (delivered or cancelled).
    job({ reference: 'MO-1QW8ZR5KTD', choice: keke(50, 12), station: { ...INDEP, distance_km: 2.1, minutes: 6 }, customer: { name: 'Independence Layout', address: '4 Bisala Road, Independence Layout', area: 'Independence Layout', distance_km: 5.2, minutes: 12, contact_name: 'Chidi Ofor', phone: '+2348000000210' }, earning_minor_units: 300_000, stage: 'delivered', partner_id: DEMO_RIDER_ID, payment_status: 'paid', delivered_at: lagosToday(9, 15, now) }),
    job({ reference: 'MO-9PXD4R7MNE', choice: keke(25, 30), station: { ...OGUI, distance_km: 1.6, minutes: 6 }, customer: { name: 'Ogui', address: '22 Market Lane, Ogui', area: 'Ogui', distance_km: 4.0, minutes: 9, contact_name: 'Blessing Udo', phone: '+2348149093321' }, earning_minor_units: 200_000, stage: 'delivered', partner_id: DEMO_RIDER_ID, payment_status: 'paid', delivered_at: lagosToday(17, 20, now, 1) }),
    job({ reference: 'MO-4WQ8NB2RYE', choice: keke(50, 24), station: { ...GRA, distance_km: 3.0, minutes: 8 }, customer: { name: 'Abakpa', address: '7 Nike Road, Abakpa', area: 'Abakpa', distance_km: 6.0, minutes: 15, contact_name: 'Kelechi Obi', phone: '+2347024408812' }, earning_minor_units: 0, stage: 'cancelled', partner_id: DEMO_RIDER_ID, delivered_at: lagosToday(15, 40, now, 3) }),
    job({ reference: 'MO-2BQ7TV9HXA', choice: keke(25, 12), station: { ...GRA, distance_km: 3.4, minutes: 8 }, customer: { name: 'GRA', address: '12 Lakeview Street, GRA, Enugu', area: 'GRA', distance_km: 7.8, minutes: 17, contact_name: 'Adaeze Nwosu', phone: '+2348031234567' }, earning_minor_units: 280_000, stage: 'delivered', partner_id: DEMO_RIDER_ID, payment_status: 'paid', delivered_at: lagosToday(13, 5, now, 3) }),
    job({ reference: 'MO-6TPB4WX9LR', choice: tanker('ground', 500), station: { name: 'Independence Station', address: 'Zik Avenue junction', area: 'Independence Layout', distance_km: 1.2, minutes: 5 }, customer: { name: 'Independence Layout', address: '3 Bisala Road, Independence Layout', area: 'Independence Layout', distance_km: 2.6, minutes: 8, contact_name: 'Amaka Eze', phone: '+2348000000211' }, earning_minor_units: 650_000, stage: 'delivered', partner_id: DEMO_DRIVER_ID, payment_status: 'paid', delivered_at: lagosToday(7, 40, now) }),
    job({ reference: 'MO-8ZRX3KTM6D', choice: tanker('ground', 1000), station: { name: 'GRA Station', address: '7 Abakaliki Road, GRA', area: 'GRA', distance_km: 1.9, minutes: 7 }, customer: { name: 'Trans-Ekulu', address: '6 Ekulu Road, Trans-Ekulu', area: 'Trans-Ekulu', distance_km: 4.4, minutes: 14, contact_name: 'Obinna Agu', phone: '+2348000000207' }, earning_minor_units: 950_000, stage: 'delivered', partner_id: DEMO_DRIVER_ID, payment_status: 'paid', delivered_at: lagosToday(16, 10, now, 1) }),
    // Held jobs, one of each kind (admin hold review, R0): the job stops and waits for a dispatcher.
    // Their riders have no other live job, so the demo's rider flows are not blocked.
    job({
      reference: 'MO-6PRF2KQ7XD',
      choice: keke(25, 24),
      station: { ...GRA, distance_km: 2.9, minutes: 7 },
      customer: { name: '15 Hilltop Close, GRA', address: '15 Hilltop Close, GRA, Enugu', area: 'GRA', landmark: 'Gate with a blue door', distance_km: 4.1, minutes: 10, contact_name: 'Ngozi Eze', phone: '+2348000000301' },
      earning_minor_units: 250_000,
      stage: 'collected',
      partner_id: IFEANYI_ID,
      accepted_at: minutesAgo(now, 70),
      collected_at: minutesAgo(now, 45),
      hold: { id: 'hold-proof-1', kind: 'proof_review', since: minutesAgo(now, 12), category: 'alternative_proof', driver_note: "Customer's phone is off. The gateman signed." },
    }),
    job({
      reference: 'MO-3SRC8WT5NB',
      choice: keke(50, 12),
      station: { ...OGUI, distance_km: 1.8, minutes: 6 },
      customer: { name: '4 Nsukka Lane, Ogui', address: '4 Nsukka Lane, Ogui, Enugu', area: 'Ogui', landmark: null, distance_km: 3.2, minutes: 9, contact_name: 'Adaeze Nwosu', phone: '+2348000000302' },
      earning_minor_units: 300_000,
      stage: 'collected',
      partner_id: SUNDAY_ID,
      accepted_at: minutesAgo(now, 100),
      collected_at: minutesAgo(now, 75),
      // The driver used another source than the assigned one: it is not in the source records, so Continue is not possible.
      hold: { id: 'hold-source-1', kind: 'source_review', since: minutesAgo(now, 60), category: 'source_mismatch', driver_note: 'The assigned source was closed, so I used the borehole near the market.' },
    }),
    job({
      reference: 'MO-8SRC5LV3QE',
      choice: keke(25, 24),
      station: { ...GRA, distance_km: 2.4, minutes: 7 },
      customer: { name: '9 Obiagu Road, GRA', address: '9 Obiagu Road, GRA, Enugu', area: 'GRA', landmark: 'Next to the pharmacy', distance_km: 3.9, minutes: 10, contact_name: 'Obinna Agu', phone: '+2348000000304' },
      earning_minor_units: 250_000,
      stage: 'collected',
      partner_id: SUNDAY_ID,
      accepted_at: minutesAgo(now, 55),
      collected_at: minutesAgo(now, 35),
      // The assigned source, with a safety concern flagged: the source can be used, so Continue is possible.
      hold: { id: 'hold-source-2', kind: 'source_review', since: minutesAgo(now, 30), category: 'pickup_safety_concern', driver_note: 'The pump area was flooded and the attendant was not there.' },
    }),
    job({
      reference: 'MO-9UNS4VH2ZC',
      choice: keke(25, 30),
      station: { ...INDEP, distance_km: 2.2, minutes: 7 },
      customer: { name: '31 Zik Avenue, Independence Layout', address: '31 Zik Avenue, Independence Layout, Enugu', area: 'Independence Layout', landmark: 'Opposite the market', distance_km: 3.7, minutes: 11, contact_name: 'Kelechi Obi', phone: '+2348000000303' },
      earning_minor_units: 250_000,
      stage: 'accepted',
      partner_id: DANIEL_ID,
      accepted_at: minutesAgo(now, 40),
      hold: { id: 'hold-unsafe-1', kind: 'unsafe_stop', since: minutesAgo(now, 25), category: 'unsafe_access', driver_note: 'The road is blocked by a crowd. I cannot reach the house safely.' },
    }),
  ]

  // Placed-at times for the admin lists: a while before the job moved on, or a few minutes ago for open orders.
  jobs.forEach((j, i) => {
    const from = j.accepted_at ?? j.delivered_at
    j.created_at = from ? new Date(Date.parse(from) - 25 * 60_000).toISOString() : new Date(now.getTime() - (i + 1) * 7 * 60_000).toISOString()
  })

  const partners: Record<string, PartnerData> = {
    [DEMO_RIDER_ID]: {
      fleet_code: 'KK-014',
      rating: 4.8,
      profile: {
        approval: 'approved',
        online: true,
        partner_since: '2026-08-01',
        vehicle: { type: 'keke', plate: 'ENU 482 KK', description: 'Blue tricycle', tank_gallons: null, safe_load_litres: null, can_pour_into: 'Drums, ground tanks' },
        service_areas: ['GRA', 'Ogui'],
        documents: [
          { id: 'd1', name: "Rider's licence", status: 'valid', note: 'Checked 14 Aug 2026', can_upload: false },
          { id: 'd2', name: 'Vehicle papers', status: 'expiring', note: 'Expires 31 Oct 2026', can_upload: true },
          { id: 'd3', name: 'Clean handling training', status: 'done', note: 'Completed 16 Aug 2026', can_upload: false },
        ],
        preferences: { new_order_alerts: true, sms_updates: true },
        payout_account_ending: '2214',
      },
      wallet_minor_units: 4_520_000,
      week: [600_000, 900_000, 450_000, 300_000, 800_000, 1_000_000, 1_250_000],
      today_minor_units: 1_250_000,
      deliveries_today: 5,
      earnings: [
        { reference: 'MO-1QW8ZR5KTD', at: lagosToday(9, 15, now), amount_minor_units: 300_000, status: 'completed', label: '50 L × 12 (600 L · 150 gal)' },
        { reference: 'MO-9PXD4R7MNE', at: lagosToday(17, 20, now, 1), amount_minor_units: 200_000, status: 'completed', label: '25 L × 30 (750 L · 187.5 gal)' },
        { reference: 'MO-2BQ7TV9HXA', at: lagosToday(13, 5, now, 1), amount_minor_units: 280_000, status: 'completed', label: '25 L × 12 (300 L · 75 gal)' },
      ],
      payouts: [{ id: 'po1', at: lagosToday(18, 0, now, 1), amount_minor_units: 4_520_000, status: 'paid' }],
      notifications: [
        { id: 'rn1', kind: 'assigned', title: 'Admin assigned you an order', body: 'MO-3HT8 · 50 L × 12 cans (600 L · 150 gal) · Independence Layout', at: new Date(now.getTime() - 2 * 60_000).toISOString(), read: false, reference: 'MO-3HT8WQ2KZP' },
        { id: 'rn2', kind: 'new_orders', title: '3 new orders near you', body: 'GRA and Ogui. No timer, accept when ready.', at: new Date(now.getTime() - 15 * 60_000).toISOString(), read: false, reference: null },
        { id: 'rn3', kind: 'payout', title: 'Payout sent', body: '₦45,200 sent to your bank account ending 2214.', at: lagosToday(18, 5, now, 1), read: false, reference: null },
        { id: 'rn4', kind: 'station_closed', title: 'Station closed', body: 'New Haven Station is closed today. Use GRA or Ogui.', at: lagosToday(8, 0, now, 1), read: true, reference: null },
        { id: 'rn5', kind: 'papers_due', title: 'Vehicle papers due soon', body: 'Upload your renewed road papers before 31 Oct.', at: lagosToday(9, 0, now, 3), read: true, reference: null },
      ],
      issues: [],
    },
    [DEMO_DRIVER_ID]: {
      fleet_code: 'TK-102',
      rating: 4.7,
      profile: {
        approval: 'approved',
        online: true,
        partner_since: '2026-08-10',
        vehicle: { type: 'tanker', plate: 'ENU 115 XA', description: '1,000 gal (4,000 L) tank', tank_gallons: 1000, safe_load_litres: null, can_pour_into: 'Ground and overhead tanks (pump)' },
        service_areas: ['Ogui', 'New Haven'],
        documents: [
          { id: 'd1', name: "Driver's licence", status: 'valid', note: 'Checked 12 Aug 2026', can_upload: false },
          { id: 'd2', name: 'Tanker papers', status: 'valid', note: 'Valid until [DATE]', can_upload: true },
          { id: 'd3', name: 'Clean handling training', status: 'done', note: 'Completed 15 Aug 2026', can_upload: false },
        ],
        preferences: { new_order_alerts: true, sms_updates: true },
        payout_account_ending: '0931',
      },
      wallet_minor_units: 8_850_000,
      week: [800_000, 1_450_000, 950_000, 0, 1_600_000, 1_600_000, 2_400_000],
      today_minor_units: 2_400_000,
      deliveries_today: 3,
      earnings: [
        { reference: 'MO-6TPB4WX9LR', at: lagosToday(7, 40, now), amount_minor_units: 650_000, status: 'completed', label: '500 gal · 2,000 L' },
        { reference: 'MO-8ZRX3KTM6D', at: lagosToday(16, 10, now, 1), amount_minor_units: 950_000, status: 'completed', label: '1,000 gal · 4,000 L' },
      ],
      payouts: [{ id: 'po2', at: lagosToday(18, 0, now, 3), amount_minor_units: 5_000_000, status: 'paid' }],
      notifications: [
        { id: 'tn1', kind: 'new_orders', title: '4 tanker orders near you', body: 'Ogui, GRA and Independence Layout.', at: new Date(now.getTime() - 10 * 60_000).toISOString(), read: false, reference: null },
        { id: 'tn2', kind: 'payout', title: 'Payout sent', body: '₦50,000 sent to your bank account ending 0931.', at: lagosToday(18, 5, now, 3), read: true, reference: null },
      ],
      issues: [],
    },
    [IFEANYI_ID]: simplePartner({
      fleet_code: 'KK-021',
      rating: 4.6,
      approval: 'approved',
      online: true,
      since: '2026-08-20',
      vehicle: { type: 'keke', plate: 'ENU 207 KK', description: 'Blue tricycle', tank_gallons: null, safe_load_litres: null, can_pour_into: 'Drums, ground tanks' },
      areas: ['Independence Layout'],
      today: 800_000,
      wallet: 1_900_000,
      papers: 'valid',
    }),
    [SUNDAY_ID]: simplePartner({
      fleet_code: 'TK-107',
      rating: null,
      approval: 'pending',
      online: false,
      since: lagosToday(9, 0, now).slice(0, 10),
      vehicle: { type: 'tanker', plate: 'ENU 330 XB', description: '4,000 gal (16,000 L) tank', tank_gallons: 4000, safe_load_litres: null, can_pour_into: 'Ground and overhead tanks (pump)' },
      areas: ['Trans-Ekulu'],
      today: 0,
      wallet: 0,
      papers: 'missing',
    }),
    [DANIEL_ID]: simplePartner({
      fleet_code: 'KK-030',
      rating: 4.9,
      approval: 'suspended',
      online: false,
      since: '2026-08-05',
      vehicle: { type: 'keke', plate: 'ENU 519 KK', description: 'Blue tricycle', tank_gallons: null, safe_load_litres: null, can_pour_into: 'Drums' },
      areas: ['Abakpa'],
      today: 0,
      wallet: 1_200_000,
      papers: 'expiring',
    }),
  }

  return { users, partners, jobs }
}

/** A partner with only the fields the admin screens show (no earnings history). */
function simplePartner(p: {
  fleet_code: string
  rating: number | null
  approval: PartnerData['profile']['approval']
  online: boolean
  since: string
  vehicle: PartnerData['profile']['vehicle']
  areas: string[]
  today: number
  wallet: number
  papers: 'valid' | 'expiring' | 'missing'
}): PartnerData {
  const vehiclePapers = p.vehicle.type === 'keke' ? 'Vehicle papers' : 'Tanker papers'
  return {
    fleet_code: p.fleet_code,
    rating: p.rating,
    profile: {
      approval: p.approval,
      online: p.online,
      partner_since: p.since,
      vehicle: p.vehicle,
      service_areas: p.areas,
      documents: [
        { id: 'd1', name: p.vehicle.type === 'keke' ? "Rider's licence" : "Driver's licence", status: p.papers === 'missing' ? 'checking' : 'valid', note: p.papers === 'missing' ? 'Uploaded, waiting for review' : 'Checked', can_upload: false },
        { id: 'd2', name: vehiclePapers, status: p.papers === 'missing' ? 'checking' : p.papers, note: p.papers === 'expiring' ? 'Expired 10 Oct 2026' : p.papers === 'missing' ? 'Uploaded, waiting for review' : 'Valid until [DATE]', can_upload: true },
      ],
      preferences: { new_order_alerts: true, sms_updates: true },
      payout_account_ending: p.wallet > 0 ? '5530' : null,
    },
    wallet_minor_units: p.wallet,
    week: [0, 0, 0, 0, 0, 0, p.today],
    today_minor_units: p.today,
    deliveries_today: p.today > 0 ? 3 : 0,
    earnings: [],
    payouts: [],
    notifications: [],
    issues: [],
  }
}
