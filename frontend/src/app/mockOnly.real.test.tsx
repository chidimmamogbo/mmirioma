// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import customerProfileSample from '../../../docs/api/examples/customer-profile.json'
import partnerProfileSample from '../../../docs/api/examples/partner-profile.json'

// With the real API the customer and partner apps hide what the contracts give no endpoint (#221);
// mockOnly.test.tsx checks that mock mode still offers it. Admin: features/admin/mockOnly.real.test.tsx.
vi.mock('../lib/api/mode', () => ({ USE_MOCKS: false }))

const WAIT = 10_000
const SLOW = 20_000

const session = (role: 'customer' | 'driver') => ({
  user: { id: 'u1', name: 'Sample User', phone: '+2348000000001', role, phone_verified: true },
  csrf_token: 'csrf',
  expires_at: '2099-01-01T00:00:00Z',
})

let bodies: Record<string, unknown> = {}

/** Answers each backend path from `bodies`, anything else 404 (set up before the app loads: the client binds `fetch` on import). */
const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '')
  const body = bodies[path] ?? { error: { code: 'not_found', message: 'No', details: null } }
  return new Response(JSON.stringify(body), { status: path in bodies ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
})

let App: typeof import('./providers').AppProviders
let appRoutes: typeof import('./router').routes

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchStub)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  App = (await import('./providers')).AppProviders
  appRoutes = (await import('./router')).routes
}, 60_000)

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

describe('mock-only actions with the real API (#221)', () => {
  it('switches them off', async () => {
    const features = await import('../lib/features')
    expect(features.CUSTOMER_PROFILE_EDITS_ENABLED).toBe(false)
    expect(features.PUSH_ENABLED).toBe(false)
    expect(features.PARTNER_DOCUMENTS_ENABLED).toBe(false)
  })

  it('offers the customer no "Change photo" on My profile', async () => {
    bodies = { '/auth/me': session('customer'), '/me/profile': customerProfileSample }
    renderAt('/profile')
    expect(await screen.findByText(/^Customer since/, {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change photo' })).not.toBeInTheDocument()
  }, SLOW)

  it('shows the customer no "Phone notifications" row in Account settings', async () => {
    bodies = { '/auth/me': session('customer'), '/me/profile': customerProfileSample }
    renderAt('/settings')
    expect(await screen.findByText('Change password', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(await screen.findByText('Privacy notice', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Phone notifications')).not.toBeInTheDocument()
  }, SLOW)

  it('shows the partner no "Phone notifications" row in Settings', async () => {
    bodies = { '/auth/me': session('driver'), '/driver/profile': partnerProfileSample }
    renderAt('/partner/rider/settings')
    expect(await screen.findByText('New order alerts', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Phone notifications')).not.toBeInTheDocument()
  }, SLOW)

  it('shows the partner no "Documents" section on the vehicle page', async () => {
    bodies = { '/auth/me': session('driver'), '/driver/profile': partnerProfileSample }
    renderAt('/partner/rider/vehicle')
    expect(await screen.findByText('Verified safe load', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(screen.queryByText('Documents')).not.toBeInTheDocument()
  }, SLOW)
})
