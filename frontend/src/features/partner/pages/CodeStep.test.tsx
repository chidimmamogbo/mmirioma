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
import { acceptJob, arriveAtCustomer, completeUnloading, confirmPickup, listAvailableJobs, simulateCodeProblem, startUnloading } from '../../../mocks/partnerMock'
import { DEMO_PASSWORD } from '../../../mocks/seed'
import { CodeStep } from './CodeStep'

const loaded = { loaded: true, receipt: true, photo_url: null, gallons_loaded: null }

beforeEach(() => resetMockDb())

/**
 * A rider job at the customer with unloading started: no code issued yet. The
 * arrival and "Start unloading" are their own steps (#250), so the code screen
 * is only reached after them.
 */
async function collectedJob(): Promise<string> {
  await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
  const [job] = await listAvailableJobs()
  await acceptJob(job.reference)
  await confirmPickup(job.reference, loaded)
  await arriveAtCustomer(job.reference)
  await startUnloading(job.reference)
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

describe('CodeStep before unloading starts (#250)', () => {
  it('sends a job that has not arrived back to the customer step', async () => {
    await mockLogin({ phone: '0800 000 0101', password: DEMO_PASSWORD })
    const [job] = await listAvailableJobs()
    await acceptJob(job.reference)
    await confirmPickup(job.reference, loaded)
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[`/partner/rider/jobs/${job.reference}/code`]}>
          <Routes>
            <Route path="/partner/rider/jobs/:reference/code" element={<CodeStep />} />
            <Route path="/partner/rider/jobs/:reference/customer" element={<p>Customer step</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Customer step')).toBeInTheDocument()
  })
})

describe('CodeStep before the code is issued (#13)', () => {
  it('sends the code when unloading is done, then shows the keypad', async () => {
    renderCodeStep(await collectedJob())
    expect(await screen.findByText('Waiting for the delivery code.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify code' })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Unloading done, send the code' }))
    expect(await screen.findByText('Code sent to customer')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for the delivery code.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify code' })).toBeInTheDocument()
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

/** A collected job whose code was already issued (unloading done). */
async function codeIssuedJob(): Promise<string> {
  const reference = await collectedJob()
  await completeUnloading(reference)
  return reference
}

/** Type six digits on the keypad and press "Verify code". */
async function enterCode(digit: string) {
  const user = userEvent.setup()
  for (let i = 0; i < 6; i++) await user.click(await screen.findByRole('button', { name: digit }))
  await user.click(screen.getByRole('button', { name: 'Verify code' }))
}

describe('CodeStep when the code SMS failed (#138, FR-050)', () => {
  it('never says the code was sent, and offers a new code', async () => {
    const reference = await codeIssuedJob()
    simulateCodeProblem(reference, 'sms_failed')
    renderCodeStep(reference)
    expect(await screen.findByText('The code could not be sent to the customer.')).toBeInTheDocument()
    expect(screen.queryByText('Code sent to customer')).not.toBeInTheDocument()
    expect(screen.queryByText(/we sent to their phone/)).not.toBeInTheDocument()
    // The mock holds a new code back for two minutes after the first, so the button shows the wait.
    expect(screen.getByRole('button', { name: /Send a new code in \d+:\d{2}/ })).toBeDisabled()
  })

  it('says "Code sent to customer" when the SMS was accepted', async () => {
    renderCodeStep(await codeIssuedJob())
    expect(await screen.findByText('Code sent to customer')).toBeInTheDocument()
    expect(screen.queryByText('The code could not be sent to the customer.')).not.toBeInTheDocument()
  })
})

describe('CodeStep when the code expired (#138)', () => {
  it('shows the expired state, not "That code is not right"', async () => {
    const reference = await codeIssuedJob()
    simulateCodeProblem(reference, 'expired')
    renderCodeStep(reference)
    await enterCode('1')
    expect(await screen.findByText('This code has expired.')).toBeInTheDocument()
    expect(screen.queryByText('That code is not right.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send a new code/ })).toBeInTheDocument()
  })

  it('still shows "That code is not right" for a wrong code', async () => {
    renderCodeStep(await codeIssuedJob())
    await enterCode('0')
    expect(await screen.findByText('That code is not right.')).toBeInTheDocument()
    expect(screen.queryByText('This code has expired.')).not.toBeInTheDocument()
  })
})
