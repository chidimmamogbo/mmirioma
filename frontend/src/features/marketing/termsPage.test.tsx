// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createQueryClient } from '../../app/queryClient'
import { TermsPage } from './LegalPages'

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return document.body.textContent ?? ''
}

describe('the /terms page describes the pilot (#107)', () => {
  it('makes none of the old promises', () => {
    const text = renderPage()
    for (const claim of [/Paystack/, /card details/i, /MmiriOma points/i, /cancellation fee/i, /waiting fee/i, /earnings are paid/i, /driver's licence/i]) {
      expect(text).not.toMatch(claim)
    }
  })

  it('states the pilot rules', () => {
    const text = renderPage()
    expect(text).toMatch(/pay in cash on delivery, to the rider or driver, after the water has been unloaded/) // F4, FR-040
    expect(text).toMatch(/agree a delivery window with you on the confirmation call/) // F3
    expect(text).toMatch(/no charge for cancelling an order or for a new delivery after a failed one/) // F5
    expect(text).toMatch(/refund we approve is paid to you outside the app/) // F7
    expect(text).toMatch(/within 48 hours of delivery/) // FR-036, BR-16
    expect(text).toMatch(/Last updated 27 October 2026/)
  })

  it('gives the same contact as the privacy notice', () => {
    const text = renderPage()
    expect(text).toMatch(/olivetgrail@gmail\.com/)
    expect(text).toMatch(/0813 377 4902/)
  })
})
