// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { mockLogin } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { Support } from './Support'
import { SupportContact } from './SupportContact'

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
