// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { PARTNER_PAY_ENABLED } from '../../../lib/features'
import { mockLogin } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { PARTNER_APPS, PartnerAppContext } from '../partnerContext'
import { DriverHome } from './DriverHome'
import { PartnerMenu } from './PartnerAccount'
import { RiderHome } from './RiderHome'

beforeEach(() => resetMockDb())

function renderAt(path: string, vehicle: 'keke' | 'tanker', page: ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <PartnerAppContext.Provider value={PARTNER_APPS[vehicle]}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path} element={page} />
          </Routes>
        </MemoryRouter>
      </PartnerAppContext.Provider>
    </QueryClientProvider>,
  )
}

// The page renders slowly on a busy machine or CI runner; the default 1 second wait is not enough.
const WAIT = 10_000

// Partner pay is out of the MVP, hidden rather than deleted (#157); flipping PARTNER_PAY_ENABLED brings it back.
describe('partner home without partner pay (#157)', () => {
  it('keeps partner pay switched off for the pilot', () => {
    expect(PARTNER_PAY_ENABLED).toBe(false)
  })

  it('shows the rider real counts, no earnings and no tile left at "…"', async () => {
    await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
    renderAt('/partner/rider', 'keke', <RiderHome />)
    expect(await screen.findByText(/^\d+ trips?$/, {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText("Today's earnings")).not.toBeInTheDocument()
    expect(screen.queryByText('Wallet')).not.toBeInTheDocument()
    expect(screen.queryByText('…')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Earnings/ })).not.toBeInTheDocument()
  })

  it('shows the driver trips today and active delivery, no money tiles', async () => {
    await mockLogin({ phone: '0800 000 0102', password: DEMO_PASSWORD })
    renderAt('/partner/driver', 'tanker', <DriverHome />)
    expect(await screen.findByText('Trips today', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Active delivery')).toBeInTheDocument()
    expect(screen.queryByText('Wallet')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('…')).not.toBeInTheDocument())
  })

  it('offers no earnings in the driver menu', async () => {
    await mockLogin({ phone: '0800 000 0102', password: DEMO_PASSWORD })
    renderAt('/partner/driver/menu', 'tanker', <PartnerMenu />)
    expect(await screen.findByText('Trip history', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Earnings and payouts')).not.toBeInTheDocument()
  })
})
