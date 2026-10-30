// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/client'
import { stepErrorKind } from '../stepErrorKind'
import { StepError } from './StepError'

const error = (status: number | null, code: string, kind: 'http' | 'network' = 'http', message = 'Server words') =>
  new ApiError({ kind, status, code, message, details: null })

describe('stepErrorKind', () => {
  it.each([
    [error(409, 'job_on_hold'), 'paused'],
    [error(409, 'invalid_order_transition'), 'changed'],
    [error(404, 'order_not_found'), 'reassigned'],
    [error(null, 'network_error', 'network'), 'not_sent'],
    [error(500, 'server_error'), 'other'],
    [new Error('x'), 'other'],
  ] as const)('sorts %#', (e, kind) => {
    expect(stepErrorKind(e)).toBe(kind)
  })
})

describe('StepError wording', () => {
  const show = (e: unknown) =>
    render(
      <MemoryRouter>
        <StepError error={e} notSent="We could not record your arrival. Check your connection and try again." onRetry={() => {}} base="/partner/rider" />
      </MemoryRouter>,
    )

  it('says a paused job is paused, then adds the server\'s message', () => {
    show(error(409, 'job_on_hold', 'http', 'Held for review'))
    expect(screen.getByText('This job is paused. The dispatcher will contact you.')).toBeInTheDocument()
    expect(screen.getByText(/Held for review/)).toBeInTheDocument()
  })

  it('offers Refresh for a changed job and a way home for a reassigned one', () => {
    show(error(409, 'invalid_order_transition'))
    expect(screen.getByText('This job has changed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('links back to the dashboard when the job was reassigned', () => {
    show(error(404, 'order_not_found'))
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/partner/rider')
  })

  it('says nothing was sent when the request did not reach the server, with Try again', () => {
    show(error(null, 'network_error', 'network'))
    expect(screen.getByText(/We could not record your arrival/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
