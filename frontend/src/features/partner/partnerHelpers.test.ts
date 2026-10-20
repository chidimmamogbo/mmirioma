import { describe, expect, it } from 'vitest'
import type { PartnerJob } from '../../domain/partner'
import { greeting } from './greeting'
import { tankerTripLine } from './jobHelpers'
import { jobStepPath, PARTNER_APPS } from './partnerContext'

function job(over: Partial<PartnerJob>): PartnerJob {
  return {
    reference: 'MO-5KL3ZT8QWE',
    choice: { delivery_type: 'tanker', tank_type: 'overhead', tank_size_gallons: 750, source: 'borehole' },
    tank_note: null,
    station: { name: 'Ogui Station', address: 'Ogui Road', area: 'Ogui', distance_km: 2.8, minutes: 9 },
    customer: { name: 'x', address: 'x', area: 'New Haven', distance_km: 6.1, minutes: 22, contact_name: 'x', phone: 'x' },
    instructions: null,
    earning_minor_units: 800_000,
    stage: 'available',
    assigned_by: null,
    payment_status: 'unpaid',
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
