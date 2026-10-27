// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { mockRegister } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { AccountSettings, Profile } from './Profile'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<AccountSettings />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  resetMockDb()
  await mockRegister({ name: 'Sample Customer', phone: '0800 000 0081', password: 'sample-password-1' })
})

describe('Account settings, separate from My profile (#57)', () => {
  it('holds the sign-in, privacy and account actions', async () => {
    renderAt('/settings')
    expect(await screen.findByRole('link', { name: /Change password/ })).toHaveAttribute('href', '/profile/password')
    expect(screen.getByRole('link', { name: /Change phone number/ })).toHaveAttribute('href', '/profile/phone')
    expect(screen.getByRole('link', { name: /Privacy notice/ })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /Delete my account/ })).toHaveAttribute('href', '/profile/delete')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('My profile shows the phone and links to Account settings, without the settings rows', async () => {
    renderAt('/profile')
    expect(await screen.findByText('0800 000 0081')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Account settings/ })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('link', { name: /Change password/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })
})
