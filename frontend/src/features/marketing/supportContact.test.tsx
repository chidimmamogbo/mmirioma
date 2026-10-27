// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../../app/queryClient'
import { NotFound } from '../../app/NotFound'
import { SupportContact } from '../customer/pages/SupportContact'
import { getPublicContact } from './publicApi'

vi.mock('./publicApi', () => ({ getPublicContact: vi.fn() }))
const contact = vi.mocked(getPublicContact)

function renderPage(page: React.ReactNode) {
  // A fresh query client per test, so one test's contact never leaks into the next.
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('support contact from the server (FR-055, #57)', () => {
  it('hides WhatsApp and offers the phone when WhatsApp support is off', async () => {
    contact.mockResolvedValue({ phone: '+2348133774902', whatsapp: null })
    renderPage(<NotFound />)
    expect(await screen.findByRole('link', { name: 'Need help? Call us on 0813 377 4902' }, { timeout: 5000 })).toHaveAttribute('href', 'tel:+2348133774902')
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
  })

  it('shows the WhatsApp chat when it is on', async () => {
    contact.mockResolvedValue({ phone: '+2348133774902', whatsapp: '+2348133774902' })
    renderPage(<NotFound />)
    expect(await screen.findByRole('link', { name: 'Need help? Chat with us on WhatsApp' }, { timeout: 5000 })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/2348133774902/),
    )
  })

  it('Contact us shows the real support number and no WhatsApp tile while it is off', async () => {
    contact.mockResolvedValue({ phone: '+2348133774902', whatsapp: null })
    renderPage(<SupportContact />)
    expect(await screen.findByText('0813 377 4902', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('[SUPPORT PHONE NUMBER]')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Chat on WhatsApp' })).not.toBeInTheDocument()
  })
})
