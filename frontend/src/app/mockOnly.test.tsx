// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { CUSTOMER_PROFILE_EDITS_ENABLED, PARTNER_DOCUMENTS_ENABLED, PUSH_ENABLED } from '../lib/features'
import { mockLogin, mockRegister } from '../mocks/authMock'
import { resetMockDb } from '../mocks/db'
import { DEMO_PASSWORD } from '../mocks/seed'
import { AppProviders } from './providers'
import { routes } from './router'

// Mock mode keeps the full demo of what the real API hides (#221, mockOnly.real.test.tsx).
const WAIT = 10_000
const SLOW = 20_000

function renderAt(path: string) {
  render(
    <AppProviders>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </AppProviders>,
  )
}

const asCustomer = () => mockRegister({ name: 'Sample Customer', phone: '0800 000 0083', password: 'sample-password-1' })
/** The demo rider (mocks/seed.ts). */
const asRider = () => mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })

beforeEach(() => resetMockDb())

describe('mock-only actions in mock mode (#221)', () => {
  it('switches them on', () => {
    expect(CUSTOMER_PROFILE_EDITS_ENABLED && PUSH_ENABLED && PARTNER_DOCUMENTS_ENABLED).toBe(true)
  })

  it('offers the customer "Change photo" on My profile', async () => {
    await asCustomer()
    renderAt('/profile')
    expect(await screen.findByRole('button', { name: 'Change photo' }, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)

  it('shows the customer the "Phone notifications" row in Account settings', async () => {
    await asCustomer()
    renderAt('/settings')
    expect(await screen.findByText('Phone notifications', {}, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)

  it('shows the partner the "Phone notifications" row in Settings', async () => {
    await asRider()
    renderAt('/partner/rider/settings')
    expect(await screen.findByText('Phone notifications', {}, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)

  it('shows the partner the "Documents" section on the vehicle page', async () => {
    await asRider()
    renderAt('/partner/rider/vehicle')
    expect(await screen.findByText('Documents', {}, { timeout: WAIT })).toBeInTheDocument()
  }, SLOW)
})
