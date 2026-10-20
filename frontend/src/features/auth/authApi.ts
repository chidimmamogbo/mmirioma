/**
 * Auth calls for screens. Uses the agreed contract (`lib/api/auth.ts`) against
 * the real API, or the mock of the same contract in mock mode.
 */
import * as real from '../../lib/api/auth'
import type { LoginInput, RegisterInput, Session } from '../../lib/api/auth'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'
import * as mock from '../../mocks/authMock'

export function login(input: LoginInput): Promise<Session> {
  return USE_MOCKS ? mock.mockLogin(input) : real.login(input)
}

export function register(input: RegisterInput): Promise<Session> {
  return USE_MOCKS ? mock.mockRegister(input) : real.register(input)
}

export function getMe(signal?: AbortSignal): Promise<Session> {
  return USE_MOCKS ? mock.mockGetMe() : real.getMe(signal)
}

export function logout(): Promise<void> {
  return USE_MOCKS ? mock.mockLogout() : real.logout()
}

/** Change password. Not in the auth contract yet (planned). */
export function changePassword(current: string, next: string): Promise<void> {
  return USE_MOCKS ? mock.mockChangePassword(current, next) : notConnected('Changing your password')
}
