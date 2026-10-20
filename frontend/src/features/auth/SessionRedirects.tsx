import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ErrorScreen, LoadingScreen } from '../../components/layout/StateScreens'
import { HOME_PATH } from './authPaths'
import { useSession } from './useSession'

/**
 * `/app`: where the installed customer app opens. Signed-in people go to
 * their home, everyone else to customer sign-in. (`/` is the public landing
 * page, which never redirects, because it is the page we share.)
 */
export function RootRedirect() {
  const session = useSession()
  if (session.isPending) return <LoadingScreen />
  if (session.isError) return <ErrorScreen error={session.error} onRetry={() => session.refetch()} />
  const user = session.data?.user
  return <Navigate to={user ? HOME_PATH[user.role] : '/signin'} replace />
}

/** Sign-in and sign-up pages: skip them when already signed in. */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const session = useSession()
  if (session.isPending) return <LoadingScreen />
  const user = session.data?.user
  if (user) return <Navigate to={HOME_PATH[user.role]} replace />
  return <>{children}</>
}
