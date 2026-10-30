// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { mockLogin } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { getPublicContact } from '../../marketing/publicApi'
import { Support } from './Support'
import { SupportContact } from './SupportContact'

vi.mock('../../marketing/publicApi', () => ({ getPublicContact: vi.fn() }))
const contact = vi.mocked(getPublicContact)
const PHONE = '+2348133774902'

// Renders slowly on a busy machine or CI runner; give the lookups room.
const WAIT = 10_000

function renderPage(page: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  resetMockDb()
  contact.mockResolvedValue({ phone: PHONE, whatsapp: PHONE })
  await mockLogin({ phone: '0803 123 4567', password: DEMO_PASSWORD })
})

/** Any `[LIKE THIS]` design placeholder left in the page text. */
const PLACEHOLDER = /\[[A-Z][A-Z ]*\]/

describe('the support screens show no design placeholder (#270)', () => {
  it('Support has no bracketed placeholder and no claim about hours or chat', async () => {
    const { container } = renderPage(<Support />)
    expect(await screen.findByText('Call or message our team.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(PLACEHOLDER)
    expect(container.textContent).not.toMatch(/Hours:/)
  })

  it('Contact us has no bracketed placeholder and keeps the hours notice', async () => {
    const { container } = renderPage(<SupportContact />)
    expect(await screen.findByText('Our support hours will be added once they are agreed.', {}, { timeout: WAIT })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(PLACEHOLDER)
    expect(container.textContent).not.toMatch(/answers during/)
  })
})

describe('the WhatsApp tile follows the WhatsApp support switch (#277)', () => {
  it('shows no WhatsApp tile while WhatsApp support is off, and keeps Call us and Chat', async () => {
    contact.mockResolvedValue({ phone: PHONE, whatsapp: null })
    renderPage(<Support />)
    expect(await screen.findByRole('link', { name: 'Call us' }, { timeout: WAIT })).toHaveAttribute('href', '/support/contact#call')
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/support/contact#chat')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument())
  })

  it('shows the WhatsApp tile, linked to the WhatsApp card, while it is on', async () => {
    renderPage(<Support />)
    expect(await screen.findByRole('link', { name: 'WhatsApp' }, { timeout: WAIT })).toHaveAttribute('href', '/support/contact#whatsapp')
  })
})
