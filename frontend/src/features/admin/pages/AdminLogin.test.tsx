// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { routes } from '../../../app/router'
import { resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'

const WAIT = 10_000

beforeEach(() => resetMockDb())

describe('staff sign-in in mock mode (#236)', () => {
  it('offers the demo staff account, fills it in and signs in with it', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/admin/login'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Use demo staff account' }, { timeout: WAIT }))
    // The demo values load on click, so wait for the form to hold them.
    await vi.waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(DEMO_PASSWORD), { timeout: WAIT })
    expect(screen.getByLabelText('Phone number')).toHaveValue('0800 000 0100')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await vi.waitFor(() => expect(router.state.location.pathname).not.toBe('/admin/login'), { timeout: WAIT })
  }, 20_000)
})
