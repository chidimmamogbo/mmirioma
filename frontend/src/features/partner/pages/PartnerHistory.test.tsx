// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import type { PartnerJob } from '../../../domain/partner'
import { mockLogin } from '../../../mocks/authMock'
import { read, resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import * as partnerApi from '../partnerApi'
import { PARTNER_APPS, PartnerAppContext } from '../partnerContext'
import { PartnerHistory } from './PartnerShared'

// Pages render slowly on a busy machine or CI runner; the default 1 second wait is not enough.
const WAIT = 10_000
const BASE = '/partner/rider'

function renderHistory() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <PartnerAppContext.Provider value={PARTNER_APPS.keke}>
        <MemoryRouter initialEntries={[`${BASE}/history`]}>
          <Routes>
            <Route path={`${BASE}/history`} element={<PartnerHistory />} />
          </Routes>
        </MemoryRouter>
      </PartnerAppContext.Provider>
    </QueryClientProvider>,
  )
}

/** A job delivered just now, with the given amount (`null` as the real API sends it: partner pay is out of the MVP). */
function deliveredJob(earning: number | null): PartnerJob {
  const job = read().jobs[0]
  return { ...job, stage: 'delivered', earning_minor_units: earning, delivered_at: new Date().toISOString() } as PartnerJob
}

beforeEach(async () => {
  resetMockDb()
  await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
})
afterEach(() => vi.restoreAllMocks())

describe('the order history\'s "Earned" tile', () => {
  it('is left out when there are no trips in the period, not shown as ₦0', async () => {
    vi.spyOn(partnerApi, 'listHistory').mockResolvedValue([])
    renderHistory()
    expect(await screen.findByText('No trips in this period', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Earned')).not.toBeInTheDocument()
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument()
  })

  it('is left out when the jobs carry no amount, as with the real API', async () => {
    vi.spyOn(partnerApi, 'listHistory').mockResolvedValue([deliveredJob(null)])
    renderHistory()
    expect(await screen.findByText('Delivered', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Earned')).not.toBeInTheDocument()
    expect(screen.queryByText('Sample amounts.')).not.toBeInTheDocument()
  })

  it('still shows with its sample label when the jobs carry amounts, as in the mock demo', async () => {
    vi.spyOn(partnerApi, 'listHistory').mockResolvedValue([deliveredJob(150_000)])
    renderHistory()
    // Wait for the job: before the history loads the list is empty, and the tile must not show then either.
    expect(await screen.findByText('Sample amounts.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Earned')).toBeInTheDocument()
  })
})
