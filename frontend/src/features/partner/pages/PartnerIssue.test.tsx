// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { mockLogin } from '../../../mocks/authMock'
import { read, resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { PARTNER_APPS, PartnerAppContext } from '../partnerContext'
import { PartnerIssue } from './PartnerShared'

// The page renders slowly on a busy machine or CI runner; the default 1 second wait is not enough.
const WAIT = 10_000
// Chinedu's active delivery in the seed: loaded, on the way to the customer.
const REF = 'MO-7KQ2M9XH4T'

function renderReport() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <PartnerAppContext.Provider value={PARTNER_APPS.keke}>
        <MemoryRouter initialEntries={[`/partner/rider/issue?ref=${REF}`]}>
          <Routes>
            <Route path="/partner/rider/issue" element={<PartnerIssue />} />
          </Routes>
        </MemoryRouter>
      </PartnerAppContext.Provider>
    </QueryClientProvider>,
  )
}

const job = () => read().jobs.find((j) => j.reference === REF)!

beforeEach(async () => {
  resetMockDb()
  await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
})

/** The card names the step the job is at, and Back returns to that step's screen (#257). */
describe('the problem report names the trip step (#257)', () => {
  const ARRIVED_AT = '2026-10-29T09:42:00Z'

  it.each([
    ['going to the station', 'refill', () => { job().stage = 'accepted' }],
    ['on the way to customer', 'customer', () => {}],
    // The arrived screen (U2) is not built yet: Back goes to the customer step until it is.
    ['arrived at the customer', 'customer', () => { Object.assign(job(), { arrived_at: ARRIVED_AT, contact_attempts: [], unreachable_allowed_at: '2026-10-29T09:52:00Z' }) }],
    ['unloading', 'code', () => { Object.assign(job(), { arrived_at: ARRIVED_AT, mock_unloading_started: true }) }],
  ] as const)('says "%s" and goes back to the %s step', async (line, screenName, setUp) => {
    setUp()
    renderReport()
    expect(await screen.findByText(new RegExp(`· ${line}$`), {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', `/partner/rider/jobs/${REF}/${screenName}`)
    // Only the current step's phrase shows.
    for (const other of ['going to the station', 'on the way to customer', 'arrived at the customer', 'unloading'].filter((p) => p !== line)) {
      expect(screen.queryByText(new RegExp(`· ${other}$`))).not.toBeInTheDocument()
    }
  })
})
