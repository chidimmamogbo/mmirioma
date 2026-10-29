// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../../app/queryClient'
import { mockLogin } from '../../../../mocks/authMock'
import { read, resetMockDb } from '../../../../mocks/db'
import { DEMO_PASSWORD } from '../../../../mocks/seed'
import { OrderDraftProvider } from '../../order/OrderDraftProvider'
import { Delivered } from './Delivered'

// Renders slowly on a busy machine or CI runner; give the lookups room.
const WAIT = 10_000
const REF = 'MO-7KQ2M9XH4T'

function renderRating() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/orders/${REF}/delivered`]}>
        <Routes>
          <Route path="/orders/:reference/delivered" element={<OrderDraftProvider><Delivered /></OrderDraftProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const saved = () =>
  Object.values(read().customers)
    .flatMap((c) => c.orders)
    .find((o) => o.reference === REF)!.feedback

const STARS_HINT = 'Choose the stars too, so we can save your answer.'
const ANSWER_HINT = 'Answer this question too, so we can save your rating.'

beforeEach(async () => {
  resetMockDb()
  await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
  const order = Object.values(read().customers).flatMap((c) => c.orders).find((o) => o.reference === REF)!
  order.stage = 'delivered'
  order.feedback = null
})

describe('the rating screen saves only what the customer answered (#256)', () => {
  it('draws no answer as chosen before one is tapped', async () => {
    renderRating()
    const yes = await screen.findByRole('radio', { name: 'Yes, no lifting' }, { timeout: WAIT })
    expect(yes).toHaveAttribute('aria-checked', 'false')
    const help = screen.getByRole('radio', { name: 'I had to help' })
    expect(help).toHaveAttribute('aria-checked', 'false')
    // Neither button is drawn in the primary (chosen) style.
    expect(yes.className).not.toContain('mo-btn-primary')
    expect(help.className).not.toContain('mo-btn-primary')
    await userEvent.click(yes)
    expect(yes.className).toContain('mo-btn-primary')
    expect(help.className).not.toContain('mo-btn-primary')
  })

  it('saves nothing and records no answer when only the stars are tapped', async () => {
    const user = userEvent.setup()
    renderRating()
    await user.click(await screen.findByRole('radio', { name: '4 stars' }, { timeout: WAIT }))
    expect(await screen.findByText(ANSWER_HINT)).toBeInTheDocument()
    expect(screen.queryByText('Thank you. Your feedback is saved.')).not.toBeInTheDocument()
    expect(saved()).toBeNull()
  })

  it('saves nothing when only the answer is tapped, and says to choose the stars', async () => {
    const user = userEvent.setup()
    renderRating()
    await user.click(await screen.findByRole('radio', { name: 'I had to help' }, { timeout: WAIT }))
    expect(await screen.findByText(STARS_HINT)).toBeInTheDocument()
    expect(saved()).toBeNull()
  })

  it.each([
    ['stars first', ['4 stars', 'Yes, no lifting'], { rating: 4, poured_by_partner: true }],
    ['answer first', ['I had to help', '2 stars'], { rating: 2, poured_by_partner: false }],
  ] as const)('saves both once each is chosen (%s), and a reload shows them', async (_name, taps, expected) => {
    const user = userEvent.setup()
    const first = renderRating()
    for (const name of taps) await user.click(await screen.findByRole('radio', { name }, { timeout: WAIT }))
    expect(await screen.findByText('Thank you. Your feedback is saved.')).toBeInTheDocument()
    expect(saved()).toEqual(expected)
    expect(screen.queryByText(ANSWER_HINT)).not.toBeInTheDocument()
    expect(screen.queryByText(STARS_HINT)).not.toBeInTheDocument()

    first.unmount()
    renderRating()
    const stars = `${expected.rating} star${expected.rating > 1 ? 's' : ''}`
    await waitFor(() => expect(screen.getByRole('radio', { name: stars })).toHaveAttribute('aria-checked', 'true'), { timeout: WAIT })
    const chosen = expected.poured_by_partner ? 'Yes, no lifting' : 'I had to help'
    expect(screen.getByRole('radio', { name: chosen })).toHaveAttribute('aria-checked', 'true')
  })
})
