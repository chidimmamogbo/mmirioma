// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/providers'
import { routes } from '../../app/router'
import { mockLogin } from '../../mocks/authMock'
import { read, resetMockDb } from '../../mocks/db'
import { DEMO_PASSWORD } from '../../mocks/seed'
import { timeAgo } from './adminFormat'

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
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'), { timeout: 4000 })
    expect(await screen.findByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument()
  })

  it('show the dashboard to staff, with every sidebar section', async () => {
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin')
    expect((await screen.findAllByText('Awaiting rider', {}, { timeout: 4000 })).length).toBeGreaterThan(0)
    expect(screen.getByText('Riders online')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Service areas/ }).length).toBeGreaterThan(0)
  })

  it('assign a rider from the orders panel', async () => {
    const user = userEvent.setup()
    await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
    renderAt('/admin/orders?ref=MO-6RTA2KXP9B')
    const button = await screen.findByRole('button', { name: /^Assign / }, { timeout: 4000 })
    await user.click(button)
    expect(await screen.findByText(/Assigned\./, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(read().jobs.find((j) => j.reference === 'MO-6RTA2KXP9B')!.stage).toBe('assigned')
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
