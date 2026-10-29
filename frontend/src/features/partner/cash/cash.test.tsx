// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { routes } from '../../../app/router'
import { mockLogin } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { handOverCash, recordCash } from '../../../mocks/partnerCashMock'
import { verifyCode } from '../../../mocks/partnerMock'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { formatCash } from './logic'

// Whole-app renders load lazy page chunks; give them room on a busy machine.
const WAIT = 10_000
const SLOW = 30_000
/** A seeded job of the demo rider, waiting for the customer's code. */
const REF = 'MO-7KQ2M9XH4T'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

/** Sign in as the demo rider and deliver the seeded job; returns its amount due. */
async function delivered(): Promise<number> {
  await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
  const job = await verifyCode(REF, '482791')
  return job.cash!.amount_due_minor_units
}

beforeEach(() => resetMockDb())

describe('K1 Cash card and Record cash (#20)', () => {
  it('records the amount due from the Done screen and shows the recorded card', async () => {
    const user = userEvent.setup()
    const due = await delivered()
    renderAt(`/partner/rider/jobs/${REF}/done`)
    expect(await screen.findByText('Count the cash with the customer before you record it.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Amount due')).toBeInTheDocument()
    expect(screen.getByText(formatCash(due))).toBeInTheDocument()
    expect(screen.queryByText(/Awaiting check/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Record cash' }))
    const field = await screen.findByLabelText('Cash received', {}, { timeout: WAIT })
    await user.type(field, String(due / 100))
    expect(screen.getByText('Matches the amount due.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record cash' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(new RegExp(`You received ${formatCash(due).replace(/[.$]/g, '\\$&')} in cash for ${REF}`))).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Record cash' }))

    expect(await screen.findByText(`Cash recorded for ${REF}.`, {}, { timeout: WAIT })).toBeInTheDocument()
    expect(await screen.findByText('Cash recorded', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Collected by rider')).toBeInTheDocument()
    expect(screen.getByText(/^Hand over by /)).toBeInTheDocument()
  }, SLOW)

  it('asks what happened when the cash is less than due, before anything is sent', async () => {
    const user = userEvent.setup()
    const due = await delivered()
    renderAt(`/partner/rider/jobs/${REF}/cash`)
    await user.type(await screen.findByLabelText('Cash received', {}, { timeout: WAIT }), String(due / 100 - 1500))
    expect(screen.getByText('Less than the amount due.')).toBeInTheDocument()
    expect(screen.getByText('₦1,500.00 will show as outstanding.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record cash' }))
    expect(screen.getByText('Tell us what happened.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  }, SLOW)

  it('says the cash is already recorded when another phone recorded a different amount', async () => {
    const user = userEvent.setup()
    const due = await delivered()
    renderAt(`/partner/rider/jobs/${REF}/cash`)
    const field = await screen.findByLabelText('Cash received', {}, { timeout: WAIT })
    await recordCash(REF, { amount_minor_units: 0, note: 'Customer paid nothing.' })
    await user.type(field, String(due / 100))
    await user.click(screen.getByRole('button', { name: 'Record cash' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Record cash' }))
    expect(await screen.findByText('Cash already recorded', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('₦0.00 was recorded for this order. Contact the office if that is wrong.')).toBeInTheDocument()
  }, SLOW)
})

describe('K2 My cash and Hand over cash (#20)', () => {
  it('lists the cash on hand and hands over the ticked records', async () => {
    const user = userEvent.setup()
    const due = await delivered()
    await recordCash(REF, { amount_minor_units: due, note: null })
    renderAt('/partner/rider/cash')
    expect(await screen.findByText('To hand over', { selector: 'div' }, { timeout: WAIT })).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'To hand over' })
    expect(within(list).getByText(REF)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Hand over cash' }))
    const tick = await screen.findByRole('checkbox', { name: new RegExp(REF) }, { timeout: WAIT })
    expect(tick).toBeChecked()
    expect(screen.getByText('Still your responsibility')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ready to hand over' }))

    expect(await screen.findByText('Marked ready to hand over.', {}, { timeout: WAIT })).toBeInTheDocument()
    const after = await screen.findByRole('region', { name: 'To hand over' }, { timeout: WAIT })
    expect(within(after).getAllByText('Ready to hand over').length).toBeGreaterThan(0)
  }, SLOW)

  it('turns Ready to hand over off with nothing ticked', async () => {
    const user = userEvent.setup()
    const due = await delivered()
    await recordCash(REF, { amount_minor_units: due, note: null })
    renderAt('/partner/rider/cash/handover')
    for (const box of await screen.findAllByRole('checkbox', {}, { timeout: WAIT })) await user.click(box)
    expect(screen.getByRole('button', { name: 'Ready to hand over' })).toBeDisabled()
    expect(screen.getByText('₦0.00')).toBeInTheDocument()
  }, SLOW)

  it('says some cash changed when a record moved meanwhile, and reloads the list', async () => {
    const user = userEvent.setup()
    const due = await delivered()
    const row = await recordCash(REF, { amount_minor_units: due, note: null })
    renderAt('/partner/rider/cash/handover')
    await screen.findByRole('checkbox', { name: new RegExp(REF) }, { timeout: WAIT })
    await handOverCash([row.id]) // from another phone
    await user.click(screen.getByRole('button', { name: 'Ready to hand over' }))
    expect(await screen.findByText('Some cash changed', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: new RegExp(REF) })).not.toBeInTheDocument()
  }, SLOW)

  it('shows the home card while cash is on hand, with a link to My cash', async () => {
    await delivered()
    renderAt('/partner/rider')
    expect(await screen.findByText('Cash to hand over', {}, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)
})
