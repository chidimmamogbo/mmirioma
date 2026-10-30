// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../../app/queryClient'
import { resetMockDb } from '../../mocks/db'
import { DEMO_PASSWORD } from '../../mocks/seed'
import { loadDraft, newDraft, saveDraft } from '../customer/order/draft'
import { useLogin, useLogout } from './useSession'

const STORAGE_KEY = 'mmirioma.orderDraft.v1'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

/** A draft as the previous customer left it, with their receiver and a saved address. */
function leaveSomeonesDraft() {
  saveDraft({ ...newDraft(), receiver_name: 'Customer A', receiver_phone: '0803 123 4567', address_id: 'addr-home' })
  expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
}

beforeEach(() => {
  resetMockDb()
  sessionStorage.clear()
})

describe('the order draft does not outlive the account that made it (#272)', () => {
  it('is cleared on sign-out', async () => {
    leaveSomeonesDraft()
    const { result } = renderHook(() => useLogout(), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadDraft().receiver_name).toBe('')
  })

  it('is cleared when another account signs in', async () => {
    leaveSomeonesDraft()
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(() => result.current.mutateAsync({ phone: '0803 123 4567', password: DEMO_PASSWORD }))
    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(loadDraft().address_id).toBeNull()
  })

  it('is kept when sign-in fails', async () => {
    leaveSomeonesDraft()
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(() => result.current.mutateAsync({ phone: '0803 123 4567', password: 'wrong-password' }).catch(() => undefined))
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})
