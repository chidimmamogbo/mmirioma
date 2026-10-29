import { describe, expect, it, vi } from 'vitest'
import reportSample from '../../../../../docs/api/examples/admin-report.json'
import type { ReportRange } from '../../../domain/admin'
import type { AdminReportRead } from '../../../lib/api/adminReports'
import { createApiClient } from '../../../lib/api/client'
import { NO_ZONE_LABEL, getReport, reportFromRead } from './reports'

const READ = reportSample as unknown as AdminReportRead
const envelope = (code: string, details: unknown = null) => ({ error: { code, message: 'No', details } })

function clientAnswering(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  return { fetchMock, client: createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock }) }
}

describe('reportFromRead', () => {
  it('converts the contract as the mapping table says', () => {
    const report = reportFromRead(READ)
    expect(report.range).toBe('7d')
    expect(report.orders).toBe(61)
    expect(report.delivered).toBe(48)
    expect(report.cancelled).toBe(4)
    expect(report.by_type).toEqual({ keke: 40, tanker: 19 })
    expect(report.is_sample).toBe(true)
    // by_source -> by_station, loads from pickups.
    expect(report.by_station).toEqual([
      { name: 'Sample Borehole A', loads: 30 },
      { name: 'Sample Borehole B', loads: 18 },
    ])
  })

  it('takes revenue from the cash collected, as integer kobo', () => {
    const report = reportFromRead(READ)
    expect(report.revenue_minor_units).toBe(28_650_000)
    expect(Number.isInteger(report.revenue_minor_units)).toBe(true)
  })

  it('labels the zone-less row and keeps the zone rows adding up to the delivered total', () => {
    const report = reportFromRead(READ)
    expect(report.by_area.map((a) => a.area)).toEqual(['Sample Zone Independence Layout', NO_ZONE_LABEL])
    expect(report.by_area.reduce((sum, a) => sum + a.orders, 0)).toBe(report.orders)
    expect(report.by_area.reduce((sum, a) => sum + a.delivered, 0)).toBe(report.delivered)
  })

  it('has no earnings for a rider: the field is absent, not zero', () => {
    const [rider] = reportFromRead(READ).by_rider
    expect(rider).toEqual({ name: 'Sample Driver One', code: 'ENU-123-KK', trips: 17 })
    expect('earned_minor_units' in rider).toBe(false)
  })

  it('counts no cancelled orders when by_status has none, and keeps a driver with no plate', () => {
    const read: AdminReportRead = { ...READ, orders: { total: 1, by_status: {} }, by_driver: [{ driver_id: 'd', name: 'No Plate', plate: null, delivered: 1 }] }
    const report = reportFromRead(read)
    expect(report.cancelled).toBe(0)
    expect(report.by_rider[0].code).toBeNull()
  })
})

describe('getReport', () => {
  it.each<ReportRange>(['today', '7d', '30d'])('sends range=%s and converts the answer', async (range) => {
    const { fetchMock, client } = clientAnswering({ ...reportSample, range })
    const report = await getReport(range, client)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('range')).toBe(range)
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe('/api/v1/admin/reports')
    expect(report.range).toBe(range)
  })

  it('sends no simulated parameter: real orders only (BR-09)', async () => {
    const { fetchMock, client } = clientAnswering(reportSample)
    await getReport('7d', client)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.has('simulated')).toBe(false)
  })

  it('passes a 422 validation_error for a missing range through', async () => {
    const { client } = clientAnswering(envelope('validation_error', [{ loc: ['query', 'range'], msg: 'Field required', type: 'missing' }]), 422)
    await expect(getReport(undefined as unknown as ReportRange, client)).rejects.toMatchObject({ status: 422, code: 'validation_error' })
  })

  it('passes 403 forbidden through', async () => {
    const { client } = clientAnswering(envelope('forbidden'), 403)
    await expect(getReport('7d', client)).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('reports a response the contract does not allow as invalid_response', async () => {
    const { client } = clientAnswering({ ...reportSample, cash: { collected_minor_units: 1.5, reconciled_minor_units: 0 } })
    await expect(getReport('7d', client)).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
