/**
 * Mock of the agreed auth contract (docs/api/auth.md): phone + password,
 * customers self-register, same error codes. Used only in mock mode.
 */
import type { LoginInput, RegisterInput, Session, User } from '../lib/api/auth'
import { normalizeNigerianPhone } from '../lib/format/phone'
import { mutate, read } from './db'
import { emptyCustomerData, type MockState } from './seed'
import { delay, mockError, newId } from './store'

/** Session lifetime: absolute, counted from sign-in, no sliding renewal (auth.md). */
export const SESSION_DAYS = 7

/** Start a session for `userId` (inside `mutate`). */
export function startSession(s: MockState, userId: string, now = Date.now()): void {
  s.sessionUserId = userId
  s.sessionExpiresAt = new Date(now + SESSION_DAYS * 86_400_000).toISOString()
}

function sessionFor(user: User, expiresAt: string | null): Session {
  return {
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role, phone_verified: user.phone_verified },
    csrf_token: 'mock-csrf-token',
    expires_at: expiresAt ?? new Date().toISOString(),
  }
}

/**
 * The signed-in user's id, or null. A session past its 7 days is ended here,
 * as the real API stops accepting the cookie.
 */
export function sessionUserId(now = Date.now()): string | null {
  const s = read()
  if (!s.sessionUserId) return null
  if (!s.sessionExpiresAt || Date.parse(s.sessionExpiresAt) <= now) {
    mutate((m) => {
      m.sessionUserId = null
      m.sessionExpiresAt = null
    })
    return null
  }
  return s.sessionUserId
}

function invalidCredentials() {
  return mockError(401, 'invalid_credentials', 'Phone number or password is incorrect')
}

export async function mockLogin(input: LoginInput): Promise<Session> {
  await delay(null)
  const phone = normalizeNigerianPhone(input.phone)
  const user = read().users.find((u) => u.phone === phone)
  if (!phone || !user || user.password !== input.password) throw invalidCredentials()
  mutate((s) => startSession(s, user.id))
  return sessionFor(user, read().sessionExpiresAt)
}

export async function mockRegister(input: RegisterInput): Promise<Session> {
  await delay(null)
  const phone = normalizeNigerianPhone(input.phone)
  const name = input.name.trim()
  const details: { loc: string[]; msg: string; type: string }[] = []
  if (!phone) details.push({ loc: ['body', 'phone'], msg: 'Enter a Nigerian mobile number', type: 'value_error' })
  if (name.length < 1 || name.length > 100) details.push({ loc: ['body', 'name'], msg: 'Enter your name', type: 'value_error' })
  if (input.password.length < 8 || input.password.length > 128)
    details.push({ loc: ['body', 'password'], msg: 'Use 8 to 128 characters', type: 'value_error' })
  if (details.length) throw mockError(422, 'validation_error', 'Request validation failed', details)
  if (read().users.some((u) => u.phone === phone)) {
    throw mockError(409, 'phone_already_registered', 'This phone number already has an account')
  }
  const user = mutate((s) => {
    const created = { id: newId('user'), name, phone: phone!, role: 'customer' as const, phone_verified: false, password: input.password }
    s.users.push(created)
    s.customers[created.id] = emptyCustomerData()
    startSession(s, created.id)
    return created
  })
  return sessionFor(user, read().sessionExpiresAt)
}

export async function mockGetMe(): Promise<Session> {
  await delay(null, 80)
  const id = sessionUserId()
  const user = read().users.find((u) => u.id === id)
  if (!user) throw mockError(401, 'not_authenticated', 'Not signed in')
  return sessionFor(user, read().sessionExpiresAt)
}

export async function mockLogout(): Promise<void> {
  await delay(null, 80)
  mutate((s) => {
    s.sessionUserId = null
    s.sessionExpiresAt = null
  })
}

/** The signed-in user's id, or a 401 like the real API. */
export function requireUserId(): string {
  const id = sessionUserId()
  if (!id) throw mockError(401, 'not_authenticated', 'Not signed in')
  return id
}

/** Mock of `POST /auth/password` (docs/api/auth.md, "Change password"). */
export async function mockChangePassword(current: string, next: string): Promise<void> {
  await delay(null)
  const id = requireUserId()
  const user = read().users.find((u) => u.id === id)!
  if (user.password !== current) throw mockError(403, 'password_incorrect', 'Your password is not right')
  if (next.length < 8 || next.length > 128) {
    throw mockError(422, 'validation_error', 'Request validation failed', [{ loc: ['body', 'new_password'], msg: 'Use 8 to 128 characters', type: 'value_error' }])
  }
  mutate((s) => {
    s.users.find((u) => u.id === id)!.password = next
  })
}
