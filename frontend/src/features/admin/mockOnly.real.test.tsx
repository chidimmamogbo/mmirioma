// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import dashboardSample from '../../../../docs/api/examples/admin-dashboard.json'
import ordersPageSample from '../../../../docs/api/examples/admin-orders-page.json'
import shellSample from '../../../../docs/api/examples/admin-shell.json'
import type { AdminCustomer } from '../../domain/admin'

// With the real API the admin actions the contracts give no endpoint are hidden (#221);
// admin.test.tsx checks that mock mode still offers them.
vi.mock('../../lib/api/mode', () => ({ USE_MOCKS: false }))

// The customer directory is not linked yet, so the detail panel is fed here to check its buttons.
const CUSTOMER: AdminCustomer = {
  id: 'c1',
  name: 'Sample Customer',
  phone: '+2348000000001',
  phone_verified: false,
  orders: 0,
  email: null,
  customer_since: '2026-10-01T09:00:00Z',
  total_paid_minor_units: 0,
  points: 0,
  complaints: 0,
  addresses: [],
  recent_orders: [],
}
vi.mock('./adminApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adminApi')>()),
  listCustomers: async () => ({ customers: [CUSTOMER], total: 1, ordered_this_week: 0 }),
  getCustomer: async () => CUSTOMER,
}))

const WAIT = 10_000
const SLOW = 20_000

const ME = { user: { id: 'u1', name: 'Sample Admin', phone: '+2348000000099', role: 'admin', phone_verified: true }, csrf_token: 'csrf', expires_at: '2099-01-01T00:00:00Z' }

const BODIES: Record<string, unknown> = {
  '/auth/me': ME,
  '/admin/shell': shellSample,
  '/admin/dashboard': dashboardSample,
  '/admin/orders': ordersPageSample,
}

/** Answers each backend path from `BODIES`, anything else 404 (set up before the app loads: the client binds `fetch` on import). */
const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '')
  const body = BODIES[path] ?? { error: { code: 'not_found', message: 'No', details: null } }
  return new Response(JSON.stringify(body), { status: path in BODIES ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
})

let App: typeof import('../../app/providers').AppProviders
let appRoutes: typeof import('../../app/router').routes

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchStub)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  App = (await import('../../app/providers')).AppProviders
  appRoutes = (await import('../../app/router')).routes
}, 60_000)

afterAll(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

beforeEach(() => fetchStub.mockClear())

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  )
  return router
}

describe('mock-only admin actions with the real API (#221)', () => {
  it('switches them off', async () => {
    const features = await import('../../lib/features')
    expect(features.PAYMENTS_PAGE_ENABLED).toBe(false)
    expect(features.ORDER_FOR_CUSTOMER_ENABLED).toBe(false)
    expect(features.DIRECTORY_EDITS_ENABLED).toBe(false)
  })

  it('offers no Payments entry and no "+ Create order" on the dashboard', async () => {
    renderAt('/admin')
    expect((await screen.findAllByText('Awaiting rider', {}, { timeout: WAIT })).length).toBeGreaterThan(0)
    const nav = screen.getAllByRole('navigation', { name: 'Admin' })[0]
    expect(within(nav).getByRole('link', { name: /Cash/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Payments/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Create order' })).not.toBeInTheDocument()
  }, SLOW)

  it('offers no "+ Create order for a customer" on Orders', async () => {
    renderAt('/admin/orders')
    expect(await screen.findByRole('heading', { name: 'Orders' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create order/ })).not.toBeInTheDocument()
  }, SLOW)

  it('offers no "+ Add rider" on Riders', async () => {
    renderAt('/admin/riders')
    expect(await screen.findByRole('heading', { name: 'Riders and drivers' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Add rider/ })).not.toBeInTheDocument()
  }, SLOW)

  it('offers no order, phone, points or payment action on a customer', async () => {
    renderAt('/admin/customers?id=c1')
    expect(await screen.findByRole('heading', { name: 'Sample Customer' }, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Phone not verified yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Support history' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Place order for/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark phone verified' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adjust points' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Payment records' })).not.toBeInTheDocument()
  }, SLOW)

  it.each(['/admin/payments', '/admin/orders/new', '/admin/riders/new'])('sends an old link to %s to the dashboard', async (path) => {
    const router = renderAt(path)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/admin'), { timeout: WAIT })
  }, SLOW)
})
