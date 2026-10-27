// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { mockLogin, mockLogout } from '../../../mocks/authMock'
import { resetMockDb } from '../../../mocks/db'
import { acceptJob, confirmPickup, listAvailableJobs } from '../../../mocks/partnerMock'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { CodeStep } from './CodeStep'

const loaded = { loaded: true, receipt: true, photo_url: null, gallons_loaded: null }

beforeEach(() => resetMockDb())

/** A rider job just collected at the station: no code issued yet. */
async function collectedJob(): Promise<string> {
  await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
  const [job] = await listAvailableJobs()
  await acceptJob(job.reference)
  await confirmPickup(job.reference, loaded)
  return job.reference
}

function renderCodeStep(reference: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/partner/rider/jobs/${reference}/code`]}>
        <Routes>
          <Route path="/partner/rider/jobs/:reference/code" element={<CodeStep />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CodeStep before the code is issued (#13)', () => {
  it('sends the code when unloading is done, then shows the keypad', async () => {
    renderCodeStep(await collectedJob())
    expect(await screen.findByText('Waiting for the delivery code.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Unloading done, send the code' }))
    expect(await screen.findByText('Code sent to customer')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for the delivery code.')).not.toBeInTheDocument()
  })

  it('shows the server message when sending the code fails', async () => {
    renderCodeStep(await collectedJob())
    const button = await screen.findByRole('button', { name: 'Unloading done, send the code' })
    await mockLogout()
    await userEvent.setup().click(button)
    const expected = errorMessage(new ApiError({ kind: 'http', status: 401, code: 'not_authenticated', message: 'Not signed in' }))
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.getByText('Waiting for the delivery code.')).toBeInTheDocument()
  })
})
