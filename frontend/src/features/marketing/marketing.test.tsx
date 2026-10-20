// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/providers'
import { routes } from '../../app/router'
import { resetMockDb } from '../../mocks/db'
import { FAQS, filterFaqs } from './content'
import { FaqPage } from './FaqPage'
import { MarketingHeader } from './MarketingParts'

beforeAll(() => {
  // jsdom has no layout, so scrolling is a no-op here.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
})

describe('filterFaqs', () => {
  it('matches the search in questions and answers, ignoring case', () => {
    expect(filterFaqs('PAYSTACK', 'All').list.map((f) => f.q)).toEqual(['What payment methods do you accept?'])
    expect(filterFaqs('gateman', 'All').list).toHaveLength(1)
    expect(filterFaqs('   ', 'All').list).toHaveLength(FAQS.length)
  })

  it('counts each category for the current search and filters by category', () => {
    const { counts } = filterFaqs('code', 'All')
    expect(counts['Delivery code']).toBe(3)
    expect(counts.All).toBe(Object.entries(counts).reduce((n, [k, v]) => (k === 'All' ? n : n + v), 0))
    expect(filterFaqs('code', 'Delivery code').list.every((f) => f.cat === 'Delivery code')).toBe(true)
  })

  it('keeps no question that promises what the app does not do', () => {
    const text = FAQS.map((f) => `${f.q} ${f.a}`).join(' ').toLowerCase()
    expect(text).not.toMatch(/sealed|track your rider live|schedule|one tap/)
  })
})

describe('FAQ page', () => {
  it('shows the empty state for a search with no match, and Clear search resets search and category', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/faq']}>
        <FaqPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Frequently asked questions')
    await user.click(screen.getByRole('button', { name: /^Payments/ }))
    expect(screen.getByRole('button', { name: /^Payments/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 questions')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search FAQs' }), 'zzzz')
    expect(screen.getByText('No questions match your search.')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /^All/ })).getByText('0')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('searchbox', { name: 'Search FAQs' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(`${FAQS.length} questions`)).toBeInTheDocument()
  })
})

describe('MarketingHeader', () => {
  it('opens the mobile menu and closes it with Escape or a link', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <MarketingHeader current="home" />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: 'FAQs' }))
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
  })
})

describe('routes', () => {
  function renderAt(path: string) {
    const router = createMemoryRouter(routes, { initialEntries: [path] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    return router
  }

  it('shows the landing page at / to everyone', async () => {
    resetMockDb()
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: /Water at\s*your gate/ })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Order Water' })[0]).toHaveAttribute('href', '/order')
    const become = screen.getAllByRole('link', { name: /Become a Rider or Driver/ })
    expect(become.length).toBeGreaterThan(0)
    for (const link of become) expect(link).toHaveAttribute('href', '/partner/signup')
  })

  it('still sends /app to sign-in when signed out', async () => {
    resetMockDb()
    const router = renderAt('/app')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/signin'), { timeout: 3000 })
  })
})
