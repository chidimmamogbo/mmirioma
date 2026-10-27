// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createQueryClient } from '../../app/queryClient'
import { PrivacyPage } from './LegalPages'

// PRIVACY_NOTICE.md is the source (Vite will not load files outside frontend/).
// When the notice changes, update these two and the page together (#93).
const NOTICE_VERSION = '2.0'
const NOTICE_SECTIONS = [
  '1. Who operates MmiriOma?',
  '2. What information do we collect?',
  '3. Why do we use personal data?',
  '4. Phone verification and service messages',
  '5. Addresses and location data',
  '6. Payments, refunds and delivery evidence',
  '7. Who receives your information?',
  '8. How long do we keep information?',
  '9. How can you request access, correction or deletion?',
  '10. Exceptions and backups',
  '11. Security',
  '12. Your privacy rights',
  '13. Cookies and sessions',
  "14. Children's privacy",
  '15. Changes to this notice',
  '16. Contact',
]

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the /privacy page mirrors PRIVACY_NOTICE.md (#93)', () => {
  it('has every section of the notice, in the same order', () => {
    renderPage()
    expect(NOTICE_SECTIONS.length).toBeGreaterThan(10)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim())
    expect(headings.filter((h) => /^\d+\. /.test(h ?? ''))).toEqual(NOTICE_SECTIONS)
  })

  it('shows the notice version, and none of the old policy claims', () => {
    renderPage()
    expect(screen.getByText(new RegExp(`Version ${NOTICE_VERSION?.replace('.', '\\.')}`))).toBeInTheDocument()
    for (const claim of [/live location while online/i, /Paystack/, /Bank details for payouts/i]) {
      expect(screen.queryByText(claim)).not.toBeInTheDocument()
    }
  })

  it('offers the app for deletion requests, with the identity check (section 9)', () => {
    renderPage()
    expect(screen.getByText(/use "Delete my account" in the customer app; we still call you back to confirm it is you/)).toBeInTheDocument()
  })
})
