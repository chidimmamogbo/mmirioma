// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import activitySample from '../../../../docs/api/examples/admin-activity.json'
import dashboardSample from '../../../../docs/api/examples/admin-dashboard.json'
import liveMapSample from '../../../../docs/api/examples/admin-live-map.json'
import ordersPageSample from '../../../../docs/api/examples/admin-orders-page.json'
import settingsSample from '../../../../docs/api/examples/admin-settings.json'
import shellSample from '../../../../docs/api/examples/admin-shell.json'

// The real-API branches of the admin screens (#217): the adapters and the shared client run for real,
// and only `fetch` is replaced, answering with the contract's example responses.
vi.mock('../../lib/api/mode', () => ({ USE_MOCKS: false }))

const WAIT = 10_000
const SLOW = 20_000

const ME = { user: { id: 'u1', name: 'Sample Admin', phone: '+2348000000099', role: 'admin', phone_verified: true }, csrf_token: 'csrf', expires_at: '2099-01-01T00:00:00Z' }

let bodies: Record<string, unknown> = {}

/**
 * The shared API client binds `fetch` and the base URL when it is first
 * imported, so the stub and the env are set up before the app is loaded (in
 * `beforeAll`). It answers each backend path with a body from `bodies`;
 * anything else is a 404, as the real server would send.
 */
const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '')
  const body = bodies[path] ?? { error: { code: 'not_found', message: 'No', details: null } }
  return new Response(JSON.stringify(body), { status: path in bodies ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
})

function serve(overrides: Record<string, unknown> = {}) {
  bodies = {
    '/auth/me': ME,
    '/admin/shell': shellSample,
    '/admin/dashboard': dashboardSample,
    '/admin/live-map': liveMapSample,
    '/admin/activity': activitySample,
    '/admin/settings': settingsSample,
    '/admin/orders': ordersPageSample,
    ...overrides,
  }
}

let App: typeof import('../../app/providers').AppProviders
let appRoutes: typeof import('../../app/router').routes

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchStub)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  App = (await import('../../app/providers')).AppProviders
  appRoutes = (await import('../../app/router')).routes
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderAt(path: string) {
  render(
    <App>
      <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} />
    </App>,
  )
}

beforeEach(() => serve())

describe('admin screens against the real API (#217)', () => {
  it('shows the dashboard from the backend: no payouts or payments cards, stations from the live map, drivers by name', async () => {
    renderAt('/admin')
    expect(await screen.findByText('Refill stations open', {}, { timeout: WAIT })).toBeInTheDocument()
    // The backend sends neither: the cards are hidden, not shown as zero.
    expect(screen.queryByText('Rider payouts due')).toBeNull()
    // Real orders are not sample data: the example has is_simulated true, so flip it in the next test; here the tag shows.
    expect(screen.getByText('SAMPLE DATA')).toBeInTheDocument()
    expect(screen.queryByText('Payments to verify')).toBeNull()
    // The panel reads the live map's water sources.
    const panel = (await screen.findByRole('heading', { name: 'Refill stations' }, { timeout: WAIT })).closest('section, div') as HTMLElement
    expect(await within(panel.parentElement as HTMLElement).findByText('Sample Borehole A', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(within(panel.parentElement as HTMLElement).getByText('Sample Borehole B')).toBeInTheDocument()
    expect(within(panel.parentElement as HTMLElement).getByText('Open')).toBeInTheDocument()
    expect(within(panel.parentElement as HTMLElement).getByText('Closed')).toBeInTheDocument()
    // Recent orders name the driver; the others say none yet.
    expect((await screen.findAllByText('Sample Driver One', {}, { timeout: WAIT })).length).toBeGreaterThan(0)
  }, SLOW)

  it('shows no SAMPLE tag when the numbers are real orders (is_simulated false)', async () => {
    serve({ '/admin/dashboard': { ...dashboardSample, is_simulated: false } })
    renderAt('/admin')
    expect(await screen.findByText('Refill stations open', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('SAMPLE DATA')).toBeNull()
    expect(screen.queryByText(/SAMPLE/)).toBeNull()
  }, SLOW)

  it('shows Settings read only: the two values the backend sends, no save button, no bracket placeholders', async () => {
    renderAt('/admin/settings')
    expect(await screen.findByText('10 minutes', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.getByText('Support phone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
    expect(screen.queryByText(/\[SUPPORT HOURS\]|\[SAFE LOAD\]|\[CODE TIME LIMIT\]/)).toBeNull()
    expect(screen.queryByLabelText(/Support hours/)).toBeNull()
    // Staff: role Admin and the last sign-in, not "last active".
    expect(screen.getByRole('columnheader', { name: 'Last sign-in' })).toBeInTheDocument()
    expect(screen.getAllByText('Sample Admin').length).toBeGreaterThan(0)
  }, SLOW)

  it('says "Never signed in" for a staff member with no sign-in', async () => {
    serve({ '/admin/settings': { ...settingsSample, staff: [{ ...settingsSample.staff[0], last_sign_in_at: null }] } })
    renderAt('/admin/settings')
    expect((await screen.findAllByText('Never signed in', {}, { timeout: WAIT })).length).toBeGreaterThan(0)
  }, SLOW)

  it('draws a delivery with no delivery type, plate or zone without failing, and shows the driver by name', async () => {
    const sparse = {
      ...liveMapSample,
      deliveries: [{ ...liveMapSample.deliveries[0], delivery_type: null, driver: { ...liveMapSample.deliveries[0].driver, plate: null }, source: null, zone: null }],
    }
    serve({ '/admin/live-map': sparse })
    renderAt('/admin')
    // No code: the label falls back to the driver's name, and the marker has neither K nor T.
    expect((await screen.findAllByText('Sample Driver One', {}, { timeout: WAIT })).length).toBeGreaterThan(0)
    expect(screen.queryByText('K')).toBeNull()
    expect(screen.queryByText('T')).toBeNull()
  }, SLOW)
})
