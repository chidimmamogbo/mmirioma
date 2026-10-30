// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../../app/queryClient'
import { mockLogin, mockRegister } from '../../../../mocks/authMock'
import { resetMockDb } from '../../../../mocks/db'
import { DEMO_PASSWORD } from '../../../../mocks/seed'
import { newDraft, saveDraft } from '../../order/draft'
import { OrderDraftProvider } from '../../order/OrderDraftProvider'
import { DeliveryDetails } from './DeliveryDetails'

// Renders slowly on a busy machine or CI runner; give the lookups room.
const WAIT = 10_000

function renderDetails() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/order/details']}>
        <Routes>
          <Route path="/order/details" element={<OrderDraftProvider><DeliveryDetails /></OrderDraftProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** A draft left by another account: it points at an address this account does not have. */
function leaveForeignDraft() {
  saveDraft({ ...newDraft(), address_id: 'addr-of-someone-else' })
}

beforeEach(() => {
  resetMockDb()
  sessionStorage.clear()
})

describe('a draft address id the account does not own is not trusted (#272)', () => {
  it('shows the address field for an account with no saved addresses', async () => {
    await mockRegister({ name: 'New Customer', phone: '08051112233', password: DEMO_PASSWORD })
    leaveForeignDraft()
    renderDetails()
    expect(await screen.findByRole('textbox', { name: 'Delivery address' }, { timeout: WAIT })).toBeInTheDocument()
  })

  it('selects the account\'s own default address when it has saved ones', async () => {
    await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
    leaveForeignDraft()
    renderDetails()
    const select = await screen.findByRole('combobox', { name: 'Delivery address' }, { timeout: WAIT })
    expect(select).toHaveValue('addr-home')
  })
})
