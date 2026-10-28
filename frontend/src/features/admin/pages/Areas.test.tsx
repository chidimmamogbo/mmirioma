// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { routes } from '../../../app/router'
import { mockLogin } from '../../../mocks/authMock'
import { read, resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'

// Whole-app renders load lazy page chunks, which can take seconds on a busy runner.
const WAIT = 10_000
const SLOW = 20_000

async function openAreas() {
  await mockLogin({ phone: '0800 000 0100', password: DEMO_PASSWORD })
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/areas'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByText('GRA', {}, { timeout: WAIT })
}

/** Open the "+ Add area" row and return its Save button's row. */
async function startAdding(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: '+ Add area' }))
  await user.type(screen.getByPlaceholderText('e.g. Abakpa Nike'), name)
}

beforeEach(() => resetMockDb())

describe('Service areas screen (Z4, #111)', () => {
  it('has coordinates and a delivery fee per order, and no station or distance', async () => {
    await openAreas()
    for (const header of ['Latitude', 'Longitude', 'Delivery fee per order (₦)']) {
      expect(screen.getAllByRole('columnheader', { name: header }).length).toBe(1)
    }
    expect(screen.queryByText('Serving station')).not.toBeInTheDocument()
    expect(screen.queryByText('Distance (km)')).not.toBeInTheDocument()
    expect(screen.queryByText('Fixed fee (₦)')).not.toBeInTheDocument()
    expect(screen.getByText(/decimal degrees, e\.g\. 6\.4447 and 7\.5108/)).toBeInTheDocument()
    expect(screen.getByText(/leave empty for no fee; quotes for this area become manual/)).toBeInTheDocument()
  }, SLOW)

  it('refuses a missing or out-of-range coordinate with the Z4 messages, and saves nothing', async () => {
    const user = userEvent.setup()
    await openAreas()
    await startAdding(user, 'Abakpa Nike')
    await user.type(screen.getAllByPlaceholderText('e.g. 6.4447')[0], '95')
    const saves = screen.getAllByRole('button', { name: 'Save' })
    await user.click(saves[0])
    expect(await screen.findByText('Enter a latitude between -90 and 90')).toBeInTheDocument()
    expect(screen.getByText('Enter a longitude between -180 and 180')).toBeInTheDocument()
    expect(read().admin.areas.some((a) => a.name === 'Abakpa Nike')).toBe(false)
  }, SLOW)

  it('refuses a coordinate that is not plain decimal degrees, and marks the field', async () => {
    const user = userEvent.setup()
    await openAreas()
    await startAdding(user, 'Abakpa Nike')
    const latitude = screen.getAllByPlaceholderText('e.g. 6.4447')[0]
    expect(latitude).not.toHaveAttribute('aria-invalid')
    await user.type(latitude, '6.4.4')
    await user.type(screen.getAllByPlaceholderText('e.g. 7.5108')[0], '7.5108')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(await screen.findByText('Enter a latitude between -90 and 90')).toBeInTheDocument()
    expect(latitude).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Enter a longitude between -180 and 180')).not.toBeInTheDocument()
  }, SLOW)

  it('adds an area with its coordinates', async () => {
    const user = userEvent.setup()
    await openAreas()
    await startAdding(user, 'Abakpa Nike')
    await user.type(screen.getAllByPlaceholderText('e.g. 6.4447')[0], '6.4447')
    await user.type(screen.getAllByPlaceholderText('e.g. 7.5108')[0], '7.5108')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(await screen.findByText('Abakpa Nike', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(read().admin.areas.find((a) => a.name === 'Abakpa Nike')?.centre).toEqual({ latitude: 6.4447, longitude: 7.5108 })
  }, SLOW)

  it('says "An area with this name already exists" for a taken name', async () => {
    const user = userEvent.setup()
    await openAreas()
    await startAdding(user, 'gra')
    await user.type(screen.getAllByPlaceholderText('e.g. 6.4447')[0], '6.4447')
    await user.type(screen.getAllByPlaceholderText('e.g. 7.5108')[0], '7.5108')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(await screen.findByText('An area with this name already exists', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(read().admin.areas.filter((a) => a.name.toLowerCase() === 'gra')).toHaveLength(1)
  }, SLOW)
})
