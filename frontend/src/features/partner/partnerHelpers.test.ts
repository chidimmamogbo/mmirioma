import { describe, expect, it } from 'vitest'
import type { PartnerJob } from '../../domain/partner'
import { greeting } from './greeting'
import { jobDeliveryType, jobQuantity, kmSuffix, minutesSuffix, tankerTripLine, totalLitres, tripMinutes } from './jobHelpers'
import { jobStepPath, PARTNER_APPS } from './partnerContext'

function job(over: Partial<PartnerJob>): PartnerJob {
  return {
    reference: 'MO-5KL3ZT8QWE',
    quantity_litres: 3000,
    choice: { delivery_type: 'tanker', tank_type: 'overhead', tank_size_gallons: 750, source: 'borehole' },
    tank_note: null,
    station: { name: 'Ogui Station', address: 'Ogui Road', area: 'Ogui', distance_km: 2.8, minutes: 9 },
    customer: { name: 'x', address: 'x', area: 'New Haven', distance_km: 6.1, minutes: 22, contact_name: 'x', phone: 'x' },
    instructions: null,
    earning_minor_units: 800_000,
    stage: 'available',
    assigned_by: null,
    code_tries_left: 3,
    code_resend_at: null,
    accepted_at: null,
    collected_at: null,
    delivered_at: null,
    pickup: null,
    remaining: null,
    ...over,
  }
}

describe('tanker helpers', () => {
  it('says a pump is needed only for overhead tanks', () => {
    expect(tankerTripLine(job({}))).toBe('About 31 min · pump needed')
    expect(tankerTripLine(job({ choice: { delivery_type: 'tanker', tank_type: 'ground', tank_size_gallons: 750, source: 'borehole' } }))).toBe('About 31 min')
  })

  it('sends tanker jobs to the /partner/driver screens for their stage', () => {
    const base = PARTNER_APPS.tanker.base
    expect(base).toBe('/partner/driver')
    expect(jobStepPath(base, job({ stage: 'accepted' }))).toBe('/partner/driver/jobs/MO-5KL3ZT8QWE/refill')
    expect(jobStepPath(base, job({ stage: 'collected' }))).toBe('/partner/driver/jobs/MO-5KL3ZT8QWE/customer')
    expect(jobStepPath(base, job({ stage: 'assigned' }))).toBe('/partner/driver/assigned/MO-5KL3ZT8QWE')
  })

  it('greets by the time in Lagos (UTC+1)', () => {
    expect(greeting(new Date('2026-10-16T10:30:00Z'))).toBe('Good morning')
    expect(greeting(new Date('2026-10-16T11:30:00Z'))).toBe('Good afternoon')
    expect(greeting(new Date('2026-10-16T16:30:00Z'))).toBe('Good evening')
  })
})

describe('totalLitres', () => {
  it('adds Keke and Tanker trips in litres, never mixing litres with gallons', () => {
    // Regression: the earnings card added Keke litres to tanker gallons (600 + 750 = 1,350).
    const keke = job({ quantity_litres: 600, choice: { delivery_type: 'keke', can_size_litres: 25, can_count: 24 } })
    const tanker = job({})
    expect(totalLitres([keke, tanker])).toBe(600 + 3000)
  })

  it('counts the ordered litres, also before the cans or tank are known (#21)', () => {
    expect(totalLitres([job({ choice: null, quantity_litres: 1200 })])).toBe(1200)
  })
})

describe('jobs the backend sends without choice, distance or pay (#12)', () => {
  const bare = job({
    choice: null,
    quantity_litres: 2000,
    earning_minor_units: null,
    station: { name: 'Ogui Station', address: 'Ogui Road', area: 'Ogui', distance_km: null, minutes: null },
    customer: { name: 'x', address: 'x', area: 'New Haven', distance_km: null, minutes: null, contact_name: 'x', phone: 'x' },
  })

  it('shows the ordered litres in litres and gallons', () => {
    expect(jobQuantity(bare)).toBe('2,000 litres (500 gallons)')
    expect(jobQuantity(bare, 'short')).toBe('2,000 L · 500 gal')
  })

  it('takes Keke or tanker from the app when the choice is unknown', () => {
    expect(jobDeliveryType(bare, 'keke')).toBe('keke')
    expect(jobDeliveryType(job({}), 'keke')).toBe('tanker')
  })

  it('leaves out unknown trip times and distances instead of guessing (no OSRM)', () => {
    expect(tripMinutes(bare)).toBeNull()
    expect(tankerTripLine(bare)).toBe('')
    expect(kmSuffix(null)).toBe('')
    expect(minutesSuffix(null)).toBe('')
    expect(kmSuffix(2.1)).toBe(' · 2.1 km')
    expect(minutesSuffix(6)).toBe(' · 6 min')
  })

  it('still says a pump is needed when only the tank type is known', () => {
    const overhead = job({ station: bare.station, customer: bare.customer })
    expect(tankerTripLine(overhead)).toBe('Pump needed')
  })
})
