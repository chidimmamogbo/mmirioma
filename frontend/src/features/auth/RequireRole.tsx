import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from '../../lib/api/auth'
import { LoadingScreen, ErrorScreen } from '../../components/layout/StateScreens'
import { HOME_PATH, SIGN_IN_PATH } from './authPaths'
import { useSession } from './useSession'

/**
 * Renders its children only for a signed-in user with the given role.
 *
 * - Signed out: redirects to that role's sign-in page and remembers where the
 *   person was going (`state.from`), so sign-in can return them there.
 * - Signed in with another role: sends them to their own home page.
 *
 * This is a convenience for the UI only. The server enforces roles on every
 * request (FR-001); the mock does too.
 */
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (session.isPending) return <LoadingScreen />
  if (session.isError) return <ErrorScreen error={session.error} onRetry={() => session.refetch()} />
  const user = session.data?.user
  if (!user) return <Navigate to={SIGN_IN_PATH[role]} replace state={{ from: location.pathname + location.search }} />
  if (user.role !== role) return <Navigate to={HOME_PATH[user.role]} replace />
  return <>{children}</>
}
