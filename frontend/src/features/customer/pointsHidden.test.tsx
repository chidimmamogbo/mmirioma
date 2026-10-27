// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../app/queryClient'
import type { CustomerNotification } from '../../domain/orders'
import { POINTS_ENABLED } from '../../lib/features'
import { mockRegister } from '../../mocks/authMock'
import { resetMockDb } from '../../mocks/db'
import * as api from './customerApi'
import { Menu } from './pages/Menu'
import { Profile } from './pages/Profile'
import { useNotifications, usePoints } from './queries'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/menu" element={<Menu />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  resetMockDb()
  vi.restoreAllMocks()
  await mockRegister({ name: 'Sample Customer', phone: '0800 000 0082', password: 'sample-password-1' })
})

// Points are hidden for the pilot, not deleted (#107); flipping POINTS_ENABLED brings them back.
describe('points are hidden for the pilot (#107)', () => {
  it('is switched off', () => {
    expect(POINTS_ENABLED).toBe(false)
  })

  it('the menu has no "My points" entry, even in mock mode', async () => {
    renderAt('/menu')
    expect(await screen.findByRole('link', { name: /Saved addresses/ })).toBeInTheDocument()
    expect(screen.queryByText(/My points/)).not.toBeInTheDocument()
    expect(screen.queryByText(/points to go/)).not.toBeInTheDocument()
  })

  it('My profile shows no points stat, although the mock profile has one', async () => {
    renderAt('/profile')
    expect(await screen.findByText('0800 000 0082')).toBeInTheDocument()
    expect(screen.queryByText('Points')).not.toBeInTheDocument()
  })

  it('never asks for points, and leaves points messages out of the notifications and the bell', async () => {
    const getPoints = vi.spyOn(api, 'getPoints')
    const at = '2026-10-27T09:00:00Z'
    const list: CustomerNotification[] = [
      { id: 'a', kind: 'points', title: 'You earned 60 points', body: '', at, read: false, reference: 'MO-1' },
      { id: 'b', kind: 'delivered', title: 'Delivered', body: '', at, read: false, reference: 'MO-1' },
    ] as CustomerNotification[]
    vi.spyOn(api, 'listNotifications').mockResolvedValue({ items: list, unread_count: 2 })

    const points = renderHook(() => usePoints(), { wrapper })
    const notes = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(notes.result.current.data).toBeDefined())
    expect(notes.result.current.data?.items.map((n) => n.id)).toEqual(['b'])
    // The hidden unread points message is not counted on the bell.
    expect(notes.result.current.data?.unread_count).toBe(1)
    expect(points.result.current.data).toBeUndefined()
    expect(getPoints).not.toHaveBeenCalled()
  })
})
