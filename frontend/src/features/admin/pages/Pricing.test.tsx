// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { routes } from '../../../app/router'
import { ApiError } from '../../../lib/api/client'
import * as adminMock from '../../../mocks/adminMock'
import { mockLogin } from '../../../mocks/authMock'
import { mutate, resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'

// Whole-app renders load lazy page chunks, which can take seconds on a busy runner.
const WAIT = 10_000
const SLOW = 20_000

async function openPricing() {
  await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/pricing'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

beforeEach(() => resetMockDb())
afterEach(() => vi.restoreAllMocks())

describe('Pricing page, reading (P0, #173 part 1)', () => {
  it('shows the current version, its rules with names, and no Money tabs', async () => {
    await openPricing()
    expect(await screen.findByRole('heading', { name: 'Pricing' }, { timeout: WAIT })).toBeInTheDocument()
    expect(await screen.findByText('Version 3', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How a price is made' })).toBeInTheDocument()
    // The rule for GRA's utility water, by name; the others are for every area.
    expect(screen.getAllByText('GRA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Utility Water').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Every area').length).toBeGreaterThan(0)
    expect(screen.getByText('2,000 L and up')).toBeInTheDocument()
    // Pricing stands alone (decision 9).
    expect(screen.queryByRole('link', { name: 'Payouts and payments' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Loyalty points' })).not.toBeInTheDocument()
    // The old flat-price controls are gone (FR-022).
    expect(screen.queryByText(/Ninth Mile/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rider pay/i)).not.toBeInTheDocument()
  }, SLOW)

  it('keeps the road-distance rates, labelled as saved and not used yet', async () => {
    await openPricing()
    expect(await screen.findByText('Road-distance rates (saved, not used yet)', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getAllByText(/Base delivery fee ₦2,000 · Distance rate ₦150 per km · Second trip ₦1,500/).length).toBeGreaterThan(0)
  }, SLOW)

  it('tells the history in words, with the reason and who saved it', async () => {
    await openPricing()
    expect(await screen.findByText('Rule added: GRA, Utility Water, 600 to 1,999 L', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Handling, every area, 600 to 1,999 L: ₦400 → ₦500')).toBeInTheDocument()
    expect(screen.getByText('Diesel price rise')).toBeInTheDocument()
    expect(screen.getByText('First price list')).toBeInTheDocument()
    expect(screen.getAllByText(/Chidimma M\./).length).toBeGreaterThan(0)
  }, SLOW)

  it('says there is no price list yet, when none is saved', async () => {
    mutate((s) => {
      s.admin.price_versions = []
    })
    await openPricing()
    expect(await screen.findByText('No price list yet', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText(/Version \d/)).not.toBeInTheDocument()
  }, SLOW)

  it('says the prices could not be loaded, and loads them on Try again', async () => {
    const user = userEvent.setup()
    const failing = vi.spyOn(adminMock, 'getCurrentPriceList').mockRejectedValue(new ApiError({ kind: 'network', status: null, code: 'network_error', message: 'Offline' }))
    await openPricing()
    expect(await screen.findByText("We couldn't load the prices.", {}, { timeout: WAIT })).toBeInTheDocument()
    failing.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Version 3', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText("We couldn't load the prices.")).not.toBeInTheDocument()
  }, SLOW)
})
