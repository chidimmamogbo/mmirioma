import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api/client'
import type { LoginInput, RegisterInput, Session } from '../../lib/api/auth'
import { getMe, login, logout, register } from './authApi'

export const SESSION_KEY = ['session'] as const

/**
 * The current session, or `null` when signed out.
 *
 * Calls `GET /auth/me` once per page load (the CSRF token lives only in
 * memory, so a reload must fetch it again, see frontend.md). A 401 means
 * "signed out", not an error.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }): Promise<Session | null> => {
      try {
        return await getMe(signal)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
    retry: false,
  })
}

/** Sign in; on success the session query holds the new session. */
export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (session) => {
      qc.clear()
      qc.setQueryData(SESSION_KEY, session)
    },
  })
}

/** Create a customer account and sign in. */
export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) => register(input),
    onSuccess: (session) => {
      qc.clear()
      qc.setQueryData(SESSION_KEY, session)
    },
  })
}

/**
 * Sign out. All cached data is dropped so the next person on a shared phone
 * never sees the previous account's orders.
 */
export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      qc.clear()
      qc.setQueryData(SESSION_KEY, null)
    },
  })
}
