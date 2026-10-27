// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import type { PartnerProfile } from '../../../domain/partner'
import { ApiError } from '../../../lib/api/client'
import { PartnerProfilePage, PartnerSettings } from './PartnerAccount'

/** What the next profile save answers; set by each test. */
const server = vi.hoisted(() => ({ refusal: null as unknown }))

/** Has an email and "News and offers" on, so the tests prove the screens leave them out. */
const profile: PartnerProfile = {
  name: 'Sample Rider',
  phone: '+2348031234567',
  email: 'rider@example.com',
  approval: 'approved',
  online: true,
  partner_since: '2026-08-01',
  vehicle: { type: 'keke', plate: 'ENU 482 KK', description: 'Blue tricycle', tank_gallons: null, safe_load_litres: null, can_pour_into: 'Drums' },
  service_areas: ['GRA'],
  documents: [],
  preferences: { new_order_alerts: true, sms_updates: true, offers_and_news: true },
  payout_account_ending: null,
}

vi.mock('../partnerApi', () => ({
  getPartnerProfile: async () => profile,
  updatePartnerProfile: async () => {
    if (server.refusal) throw server.refusal
    return profile
  },
}))

function renderScreen(screenUnderTest: ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>{screenUnderTest}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('partner account screens without email or "News and offers" (#85)', () => {
  it('profile shows no email row', async () => {
    renderScreen(<PartnerProfilePage />)
    expect(await screen.findByText('Phone')).toBeInTheDocument()
    expect(screen.queryByText('Email (optional)')).not.toBeInTheDocument()
    expect(screen.queryByText('rider@example.com')).not.toBeInTheDocument()
  })

  it('settings show the two alerts and no email form or "News and offers" switch', async () => {
    renderScreen(<PartnerSettings />)
    expect(await screen.findByRole('switch', { name: 'New order alerts' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'SMS updates' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'News and offers' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Email address/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save email' })).not.toBeInTheDocument()
  })

  it('shows the server message when saving an alert fails', async () => {
    server.refusal = new ApiError({ kind: 'http', status: 403, code: 'forbidden', message: 'You cannot change this account.' })
    const user = userEvent.setup()
    renderScreen(<PartnerSettings />)
    await user.click(await screen.findByRole('switch', { name: 'SMS updates' }))
    expect(await screen.findByText('You cannot change this account.')).toBeInTheDocument()
  })
})
