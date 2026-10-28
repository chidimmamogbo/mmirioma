// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/providers'
import { routes } from '../../app/router'
import { decideProof } from '../../mocks/adminMock'
import { mockLogin } from '../../mocks/authMock'
import { read, resetMockDb } from '../../mocks/db'
import { DEMO_PASSWORD } from '../../mocks/seed'
import { notReadyToAssign, timeAgo } from './adminFormat'

// Whole-app renders load lazy page chunks, which can take seconds on a busy
// machine or CI runner; give them room instead of Vitest's 5 s default.
const WAIT = 10_000
const SLOW = 20_000

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

beforeEach(() => resetMockDb())

describe('admin pages', () => {
  it('send signed-out visitors to staff sign-in', async () => {
    const router = renderAt('/admin/orders')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'), { timeout: WAIT })
    expect(await screen.findByRole('heading', { name: 'Staff sign in' }, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)

  it('show the dashboard to staff, with every sidebar section', async () => {
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin')
    expect((await screen.findAllByText('Awaiting rider', {}, { timeout: WAIT })).length).toBeGreaterThan(0)
    expect(screen.getByText('Riders online')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Service areas/ }).length).toBeGreaterThan(0)
  }, SLOW)

  it('assign a rider from the orders panel', async () => {
    const user = userEvent.setup()
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/orders?ref=MO-6RTA2KXP9B')
    const button = await screen.findByRole('button', { name: /^Assign / }, { timeout: WAIT })
    await user.click(button)
    expect(await screen.findByText(/Assigned\./, {}, { timeout: WAIT })).toBeInTheDocument()
    expect(read().jobs.find((j) => j.reference === 'MO-6RTA2KXP9B')!.stage).toBe('assigned')
  }, SLOW)

  it('shows a held order with the "On hold" chip, its kind and age, and a banner on the panel with no assign panel (#166, R0)', async () => {
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/orders?ref=MO-6PRF2KQ7XD')
    const banner = await screen.findByRole('group', { name: 'Order on hold' }, { timeout: WAIT })
    expect(within(banner).getByText('On hold: Proof review')).toBeInTheDocument()
    expect(within(banner).getByText(/Driver: Ifeanyi James/)).toBeInTheDocument()
    expect(within(banner).getByText(/12 min ago/)).toBeInTheDocument()
    // The held order keeps its status, in its row with the chip and "kind · age".
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('MO-6PRF2KQ7XD'))!
    expect(within(row).getByText('On hold')).toBeInTheDocument()
    expect(within(row).getByText(/Proof review · 12 min ago/)).toBeInTheDocument()
    // Nothing to assign while the job waits for a decision, and the history shows how it opened.
    expect(screen.queryByRole('button', { name: /^Assign / })).toBeNull()
    expect(screen.queryByText(/^Eligible /)).toBeNull()
    expect(screen.getByText('Hold opened: Proof review')).toBeInTheDocument()
    expect(screen.getByText(/Alternative proof · "Customer's phone is off\. The gateman signed\."/)).toBeInTheDocument()
  }, SLOW)

  async function openProofSheet() {
    const user = userEvent.setup()
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/orders?ref=MO-6PRF2KQ7XD')
    await user.click(await screen.findByRole('button', { name: 'Review' }, { timeout: WAIT }))
    const sheet = await screen.findByRole('dialog', {}, { timeout: WAIT })
    await within(sheet).findByText('Alternative proof', {}, { timeout: WAIT })
    return { user, sheet }
  }

  it('opens the review sheet from the banner with the proof evidence, and never shows the code (#166, R1)', async () => {
    const { sheet } = await openProofSheet()
    expect(within(sheet).getByRole('heading', { name: 'Proof review' })).toBeInTheDocument()
    expect(within(sheet).getByText(/Order MO-6PRF2KQ7XD · Unloading · Driver: Ifeanyi James/)).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /^Call / })).toHaveAttribute('href', 'tel:+2348000000301')
    expect(within(sheet).getByText('600 L')).toBeInTheDocument()
    expect(within(sheet).getByText('Customer cannot receive the code')).toBeInTheDocument()
    expect(within(sheet).getByText(/SMS accepted · 3 of 5 attempts used · Expired/)).toBeInTheDocument()
    expect(within(sheet).getByText('The code itself is never shown.')).toBeInTheDocument()
    expect(within(sheet).getByText('No location shared')).toBeInTheDocument()
    expect(within(sheet).getByText("Customer's phone is off. The gateman signed.")).toBeInTheDocument()
    expect(within(sheet).getByText('No other reports.')).toBeInTheDocument()
  }, SLOW)

  it('approves the proof: asks first, says payment is not changed, and the order becomes Delivered', async () => {
    const { user, sheet } = await openProofSheet()
    await user.type(within(sheet).getByLabelText(/^Your note/), 'Customer confirmed by phone that 1,000 litres were delivered.')
    await user.click(within(sheet).getByRole('button', { name: 'Approve proof' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delivered with 600 L. Payment is not changed by this decision.')
    await user.click(within(dialog).getByRole('button', { name: 'Approve proof' }))
    expect(await screen.findByText('Proof approved. The order is now Delivered.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(read().jobs.find((j) => j.reference === 'MO-6PRF2KQ7XD')!.stage).toBe('delivered')
    // No banner any more; the decided card says who decided and why.
    expect(screen.queryByRole('group', { name: 'Order on hold' })).toBeNull()
    expect(screen.getAllByText(/Customer confirmed by phone that 1,000 litres were delivered\./).length).toBeGreaterThan(0)
  }, SLOW)

  it('rejects the proof with a reason, and the order stays where it was', async () => {
    const { user, sheet } = await openProofSheet()
    await user.click(within(sheet).getByLabelText('Reject this proof'))
    await user.type(within(sheet).getByLabelText(/^Your note/), 'The person who answered is not the customer.')
    await user.click(within(sheet).getByRole('button', { name: 'Reject proof' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('the order stays Unloading')
    await user.click(within(dialog).getByRole('button', { name: 'Reject proof' }))
    expect(await screen.findByText('Proof rejected. The driver can send a new code.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(read().jobs.find((j) => j.reference === 'MO-6PRF2KQ7XD')!.stage).toBe('collected')
    expect(screen.queryByRole('group', { name: 'Order on hold' })).toBeNull()
  }, SLOW)

  it('asks for a note before anything is sent', async () => {
    const { user, sheet } = await openProofSheet()
    await user.click(within(sheet).getByRole('button', { name: 'Approve proof' }))
    expect(await within(sheet).findByText('Write a note (up to 500 characters).')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(read().jobs.find((j) => j.reference === 'MO-6PRF2KQ7XD')!.hold).not.toBeNull()
  }, SLOW)

  it('says "This order has changed." with Refresh when the hold was decided meanwhile, and keeps what was typed', async () => {
    const { user, sheet } = await openProofSheet()
    await decideProof('MO-6PRF2KQ7XD', { hold_id: 'hold-proof-1', decision: 'reject', note: 'Another dispatcher got there first.' })
    await user.type(within(sheet).getByLabelText(/^Your note/), 'Customer confirmed by phone.')
    await user.click(within(sheet).getByRole('button', { name: 'Approve proof' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Approve proof' }))
    expect(await within(sheet).findByText('This order has changed.')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(within(sheet).getByLabelText(/^Your note/)).toHaveValue('Customer confirmed by phone.')
  }, SLOW)

  it('offers Review only for a proof review so far; a source review or unsafe stop shows its banner without it', async () => {
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/orders?ref=MO-3SRC8WT5NB')
    const banner = await screen.findByRole('group', { name: 'Order on hold' }, { timeout: WAIT })
    expect(within(banner).getByText('On hold: Source review')).toBeInTheDocument()
    expect(within(banner).queryByRole('button', { name: 'Review' })).toBeNull()
  }, SLOW)

  it('names the assigned rider after the eligible list refreshes without them (#143)', async () => {
    const user = userEvent.setup()
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/orders?ref=MO-6RTA2KXP9B')
    const radios = await screen.findAllByRole('radio', {}, { timeout: WAIT })
    // Pick the second rider, so the refreshed list's first rider is someone else.
    expect(radios.length).toBeGreaterThan(1)
    await user.click(radios[1])
    const button = screen.getByRole('button', { name: /^Assign / })
    const first = button.textContent!.replace(/^Assign /, '').trim()
    await user.click(button)
    expect(await screen.findByText(new RegExp(`^Assigned\\. ${first} gets the order`), {}, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)
})

describe('admin cash (K3 to K5, #19)', () => {
  it('lists the day, then receives a driver\u2019s cash with the counted total', async () => {
    const user = userEvent.setup()
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/cash')
    expect(await screen.findByRole('heading', { name: 'Cash' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Cash$/ }).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Overdue', {}, { timeout: WAIT })).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Part paid · ₦2,000.00 outstanding').length).toBeGreaterThan(0)

    const receiveLinks = screen.getAllByRole('link', { name: 'Receive cash' })
    await user.click(receiveLinks[receiveLinks.length - 1])
    expect(await screen.findByRole('heading', { name: 'Receive cash from Chinedu Okafor' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('₦11,500.00')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Cash counted' }), '11500')
    expect(screen.getByText('Counted matches the recorded total.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm received' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('You confirm you have received ₦11,500.00 in cash from Chinedu Okafor.')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm received' }))
    expect(await screen.findByText('Received ₦11,500.00 from Chinedu Okafor.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Part paid · ₦900.00 outstanding')).toBeInTheDocument()
  }, SLOW)

  it('asks for a note when the counted cash differs', async () => {
    const user = userEvent.setup()
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/cash/drivers/user-chinedu')
    await user.type(await screen.findByRole('textbox', { name: 'Cash counted' }, { timeout: WAIT }), '11000')
    expect(screen.getByText('₦500.00 short')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm received' }))
    expect(await screen.findByText('Say what happened.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  }, SLOW)
})

describe('notReadyToAssign (#144)', () => {
  it('lets only a confirmed order be assigned; a prepaid order awaiting payment is not ready', () => {
    expect(notReadyToAssign({ status: 'awaiting_rider', backend_status: 'confirmed' })).toBe(false)
    expect(notReadyToAssign({ status: 'awaiting_rider', backend_status: 'awaiting_payment' })).toBe(true)
  })

  it('treats a mock order, which sends no backend status, as assignable', () => {
    expect(notReadyToAssign({ status: 'awaiting_rider' })).toBe(false)
  })

  it('leaves orders that are already past this step alone', () => {
    expect(notReadyToAssign({ status: 'assigned', backend_status: 'accepted' })).toBe(false)
    expect(notReadyToAssign({ status: 'awaiting_confirmation', backend_status: 'quote_requested' })).toBe(false)
  })
})

describe('timeAgo', () => {
  it('reads like the design', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    expect(timeAgo('2026-10-20T11:56:00Z', now)).toBe('4 min ago')
    expect(timeAgo('2026-10-20T11:00:00Z', now)).toBe('1 h ago')
    expect(timeAgo('2026-10-19T09:00:00Z', now)).toBe('Yesterday')
  })
})
