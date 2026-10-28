// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { routes } from '../../../app/router'
import { mockLogin } from '../../../mocks/authMock'
import { mutate, resetMockDb } from '../../../mocks/db'
import { createPriceList, getCurrentPriceList } from '../../../mocks/priceListMock'
import { DEMO_ADMIN_PHONE, DEMO_PASSWORD } from '../../../mocks/seed'
import { draftRules } from './logic'

// Whole-app renders load lazy page chunks; give them room on a busy machine.
const WAIT = 10_000
const SLOW = 30_000

function renderPricing() {
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/pricing'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

beforeEach(async () => {
  resetMockDb()
  await mockLogin({ phone: DEMO_ADMIN_PHONE, password: DEMO_PASSWORD })
})

// The Pricing screen (#173) in mock mode, against admin-pricing.md's states.
describe('Pricing screen', () => {
  it('shows the current rules and history, and saves an edited rule as the next version', async () => {
    const user = userEvent.setup()
    renderPricing()
    expect(await screen.findByRole('heading', { name: 'Rules in version 2' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('How a price is made')).toBeInTheDocument()
    expect(screen.getByText('Handling, every area: ₦400 → ₦500')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Loyalty points' })).not.toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save as version 3' })
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Edit rule 1' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit rule 1' })
    const handling = within(sheet).getByLabelText('Handling per order (₦)')
    await user.clear(handling)
    await user.type(handling, '600')
    await user.click(within(sheet).getByRole('button', { name: 'Update rule' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Reason/), 'Diesel price rise')
    await user.click(screen.getByRole('button', { name: 'Save as version 3' }))
    expect(await screen.findByText('Saved as version 3.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Rules in version 3' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Handling, every area: ₦500 → ₦600')).toBeInTheDocument()
  }, SLOW)

  it('refuses a rule under 600 litres in the sheet, before anything is sent', async () => {
    const user = userEvent.setup()
    renderPricing()
    await user.click(await screen.findByRole('button', { name: '+ Add a rule' }, { timeout: WAIT }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a rule' })
    const from = within(sheet).getByLabelText('From (litres)')
    await user.clear(from)
    await user.type(from, '500')
    await user.click(within(sheet).getByRole('button', { name: 'Add rule' }))
    expect(within(sheet).getByText('Start at 600 litres or more.')).toBeInTheDocument()
    expect(within(sheet).getByText(/^Check \d fields?\.$/)).toBeInTheDocument()
  }, SLOW)

  it('names overlapping rules and saves nothing', async () => {
    const user = userEvent.setup()
    renderPricing()
    await user.click(await screen.findByRole('button', { name: '+ Add a rule' }, { timeout: WAIT }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a rule' })
    await user.type(within(sheet).getByLabelText('Handling per order (₦)'), '500')
    await user.type(within(sheet).getByLabelText('Percentage (%)'), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Add rule' }))
    await user.click(screen.getByRole('button', { name: 'Save as version 3' }))
    expect(await screen.findByText('Two rules cover the same orders.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText(/Rule 3 overlaps rule 1/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rules in version 2' })).toBeInTheDocument()
  }, SLOW)

  it('says prices changed meanwhile, and loads the newer version', async () => {
    const user = userEvent.setup()
    renderPricing()
    await user.click(await screen.findByRole('button', { name: 'Remove rule 2' }, { timeout: WAIT }))
    // Someone else saves version 3 while this page is open.
    const latest = await getCurrentPriceList()
    await createPriceList({ base_version: latest.version, reason: 'Elsewhere', rules: draftRules(latest).map((r) => ({ ...r, handling_minor_units: r.handling_minor_units + 10_000 })) })
    await user.click(screen.getByRole('button', { name: 'Save as version 3' }))
    expect(await screen.findByText('Prices changed since you opened this page.', {}, { timeout: WAIT })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load version 3' }))
    expect(await screen.findByRole('heading', { name: 'Rules in version 3' }, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)

  it('shows "No price list yet" when none has been saved', async () => {
    mutate((s) => {
      s.admin.price_lists = []
    })
    renderPricing()
    expect(await screen.findByRole('heading', { name: 'No price list yet' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add the first rule' })).toBeInTheDocument()
  }, SLOW)
})
