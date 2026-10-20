import { useEffect, useState } from 'react'
import { useRouteError } from 'react-router-dom'
import { ErrorScreen, LoadingScreen } from '../components/layout/StateScreens'
import { isStaleChunkError, shouldReloadForStaleChunk } from './staleChunk'

/**
 * Root error screen for anything a route throws, instead of React Router's
 * plain built-in page.
 *
 * Pages are lazy chunks with hashed names. After a new deploy the service
 * worker swaps in the new files at once, so a tab that was already open can
 * ask for an old chunk that no longer exists. Loading the page again fixes
 * that, so this reloads once (at most once a minute, so it can never loop);
 * any other error shows the app's error screen with "Try again".
 */
export function RouteError() {
  const error = useRouteError()
  // Decided once, when the error first shows.
  const [reloading] = useState(() => isStaleChunkError(error) && shouldReloadForStaleChunk())

  // The reload is a side effect, so it runs after render.
  useEffect(() => {
    if (reloading) window.location.reload()
  }, [reloading])

  if (reloading) return <LoadingScreen />
  return <ErrorScreen error={error} onRetry={() => window.location.reload()} />
}
