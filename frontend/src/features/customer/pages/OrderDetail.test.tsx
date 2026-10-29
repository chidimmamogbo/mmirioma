// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { mockLogin } from '../../../mocks/authMock'
import { read, resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { OrderDraftProvider } from '../order/OrderDraftProvider'
import { OrderDetail } from './OrderDetail'

// Renders slowly on a busy machine or CI runner; give the lookups room.
const WAIT = 10_000

function renderOrder(reference: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/orders/${reference}`]}>
        <Routes>
          <Route path="/orders/:reference" element={<OrderDraftProvider><OrderDetail /></OrderDraftProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const orderOf = (reference: string) =>
  Object.values(read().customers)
    .flatMap((c) => c.orders)
    .find((o) => o.reference === reference)!

beforeEach(async () => {
  resetMockDb()
  await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
})

describe('the delivery window on the order detail (#188)', () => {
  it('shows the agreed window in Lagos time with what it is, for an open order', async () => {
    orderOf('MO-7KQ2M9XH4T').delivery_window = { start_at: '2026-10-27T09:00:00Z', end_at: '2026-10-27T11:00:00Z' }
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('Delivery window', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText(/Tue, 27 Oct 2026/)).toBeInTheDocument()
    expect(screen.getByText(/10:00 AM – 12:00 PM/)).toBeInTheDocument()
    expect(screen.getByText('The time agreed with the dispatcher. Not a live arrival time.')).toBeInTheDocument()
  })

  it('shows both days when the window crosses midnight', async () => {
    orderOf('MO-7KQ2M9XH4T').delivery_window = { start_at: '2026-10-27T22:00:00Z', end_at: '2026-10-28T00:00:00Z' }
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText(/27 Oct, 11:00 PM – 28 Oct, 1:00 AM/, {}, { timeout: WAIT })).toBeInTheDocument()
  })

  it('shows no row and no placeholder when there is no window', async () => {
    orderOf('MO-7KQ2M9XH4T').delivery_window = null
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('Deliver to', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Delivery window')).not.toBeInTheDocument()
    expect(screen.queryByText(/agreed with the dispatcher/)).not.toBeInTheDocument()
  })

  it.each(['delivered', 'cancelled', 'failed'] as const)('hides the window once the order is %s', async (stage) => {
    const order = orderOf('MO-7KQ2M9XH4T')
    order.stage = stage
    order.delivery_window = { start_at: '2026-10-27T09:00:00Z', end_at: '2026-10-27T11:00:00Z' }
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('Deliver to', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Delivery window')).not.toBeInTheDocument()
  })

  it('shows the seeded demo order with a window', async () => {
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('Delivery window', {}, { timeout: WAIT })).toBeInTheDocument()
  })
})

describe('the rating card on the order detail (#249)', () => {
  it('asks a delivered, unrated order for a rating and links to the rating screen', async () => {
    const order = orderOf('MO-7KQ2M9XH4T')
    order.stage = 'delivered'
    order.feedback = null
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('How did we do?', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Tell us how the delivery went.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rate this delivery' })).toHaveAttribute('href', '/orders/MO-7KQ2M9XH4T/delivered')
    expect(screen.queryByText('Your rating')).not.toBeInTheDocument()
  })

  it('shows the saved stars and a way to change them for a rated order', async () => {
    const order = orderOf('MO-7KQ2M9XH4T')
    order.stage = 'delivered'
    order.feedback = { rating: 4, poured_by_partner: true }
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('Your rating', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Rated 4 out of 5' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change your rating' })).toHaveAttribute('href', '/orders/MO-7KQ2M9XH4T/delivered')
    expect(screen.queryByRole('link', { name: 'Rate this delivery' })).not.toBeInTheDocument()
  })

  it.each(['request_received', 'awaiting_confirmation', 'waiting_rider', 'rider_assigned', 'picked_up', 'on_the_way', 'cancelled', 'failed', 'under_review'] as const)('shows no card while the order is %s', async (stage) => {
    orderOf('MO-7KQ2M9XH4T').stage = stage
    renderOrder('MO-7KQ2M9XH4T')
    expect(await screen.findByText('Deliver to', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('How did we do?')).not.toBeInTheDocument()
    expect(screen.queryByText('Your rating')).not.toBeInTheDocument()
  })
})
