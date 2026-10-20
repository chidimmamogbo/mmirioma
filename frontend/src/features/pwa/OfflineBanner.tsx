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
 * "You're offline" notice (decision Q2: app shell offline, data online). The
 * screens still open from the saved app shell, but nothing is saved or sent
 * until the connection is back, and we say so instead of pretending.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-[60] mx-auto w-fit max-w-[calc(100%-32px)] rounded-full bg-ink px-4 py-2 text-center text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(10,37,64,0.3)]"
    >
      You're offline. Orders and updates need a connection.
    </div>
  )
}
