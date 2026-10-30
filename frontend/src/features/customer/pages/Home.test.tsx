// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { mockRegister } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { OrderDraftProvider } from '../order/OrderDraftProvider'
import { Home } from './Home'

function renderHome() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <OrderDraftProvider>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<Home />} />
          </Routes>
        </MemoryRouter>
      </OrderDraftProvider>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  resetMockDb()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  // A customer who has just signed up: no orders yet.
  await mockRegister({ name: 'Sample Customer', phone: '0800 000 0071', password: 'sample-password-1' })
})

describe('Home (mock mode)', () => {
  it('greets a customer with no orders as "Welcome,", not "Welcome back," (#271)', async () => {
    renderHome()
    expect(await screen.findByText('Sample!')).toBeInTheDocument()
    expect(screen.getByText('Welcome,')).toBeInTheDocument()
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument()
  })
})
