// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { SignIn } from './SignIn'

function renderSignIn() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/signin']}>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/home" element={<p>Home screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => resetMockDb())

describe('SignIn (mock mode)', () => {
  it('shows only phone and password, no Google or email (decision 6)', () => {
    renderSignIn()
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('type', 'tel')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument()
  })

  it('validates the phone before sending', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.type(screen.getByLabelText('Phone number'), '123')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Enter a Nigerian mobile number/)).toBeInTheDocument()
  })

  it('keeps the phone and shows one message for wrong details', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.type(screen.getByLabelText('Phone number'), '0803 123 4567')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('That phone number or password is not right.')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone number')).toHaveValue('0803 123 4567')
  })

  it('goes home after signing in', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.type(screen.getByLabelText('Phone number'), '08031234567')
    await user.type(screen.getByLabelText('Password'), DEMO_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Home screen')).toBeInTheDocument()
  })
})
