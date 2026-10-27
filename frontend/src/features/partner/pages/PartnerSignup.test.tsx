// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { ApiError } from '../../../lib/api/client'
import { PartnerSignup } from './PartnerSignup'

/** What the next sign-up answers; set by each test. */
const server = vi.hoisted(() => ({ refusal: null as unknown }))

vi.mock('../partnerApi', () => ({
  partnerSignup: async () => {
    throw server.refusal
  },
}))

const refused = (details: unknown) =>
  new ApiError({ kind: 'http', status: 422, code: 'validation_error', message: 'Request validation failed', details })

function renderSignup() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/partner/signup']}>
        <Routes>
          <Route path="/partner/signup" element={<PartnerSignup />} />
          <Route path="/partner" element={<p>Partner home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function submitForm(refusal: ApiError) {
  server.refusal = refusal
  const user = userEvent.setup()
  renderSignup()
  await user.type(screen.getByLabelText('Full name'), 'Sample Rider')
  await user.type(screen.getByLabelText('Phone number'), '08031234567')
  await user.type(screen.getByLabelText('Plate number'), 'ENU 482 KK')
  await user.type(screen.getByLabelText('Area you work in'), 'GRA')
  await user.type(screen.getByLabelText('Password'), 'long-enough')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('PartnerSignup server errors (#80)', () => {
  it('shows an area error under the area field', async () => {
    const msg = 'We do not serve "GRA" yet.'
    await submitForm(refused([{ loc: ['body', 'service_area'], msg, type: 'value_error' }]))
    expect(await screen.findByText(msg)).toBeInTheDocument()
    expect(screen.queryByText('Request validation failed')).not.toBeInTheDocument()
  })

  it('puts errors no field can show in the top notice, and keeps the field errors', async () => {
    await submitForm(
      refused([
        { loc: ['body', 'plate'], msg: 'Use 4 to 15 characters', type: 'value_error' },
        { loc: ['body', 'vehicle_type'], msg: 'Choose keke or tanker', type: 'enum' },
        { loc: ['body'], msg: 'Request body is not valid', type: 'value_error' },
      ]),
    )
    expect(await screen.findByText('Choose keke or tanker Request body is not valid')).toBeInTheDocument()
    expect(screen.getByText('Use 4 to 15 characters')).toBeInTheDocument()
  })

  it('shows the message of a validation error without details', async () => {
    await submitForm(refused(null))
    expect(await screen.findByText('Request validation failed')).toBeInTheDocument()
  })
})
