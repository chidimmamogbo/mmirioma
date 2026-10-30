import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Whether the phone reports a connection. The unreachable-customer screens
 * switch their send buttons off while it is `false`: an attempt carries the
 * server's time, so nothing is queued to send later (design decision 4).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
