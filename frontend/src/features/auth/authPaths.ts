import type { UserRole } from '../../lib/api/auth'

/** Sign-in page for each role. */
export const SIGN_IN_PATH: Record<UserRole, string> = {
  customer: '/signin',
  driver: '/partner/login',
  admin: '/admin/login',
}

/** Home page for each role, used after sign-in and when the wrong role opens a page. */
export const HOME_PATH: Record<UserRole, string> = {
  customer: '/home',
  driver: '/partner',
  admin: '/admin',
}
