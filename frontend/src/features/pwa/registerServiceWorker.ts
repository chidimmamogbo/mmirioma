/**
 * Register the service worker (src-sw/sw.ts, built to /sw.js) that makes
 * both apps installable, keeps the app shell offline and receives push.
 * In `npm run dev` vite-plugin-pwa serves a dev build at /dev-sw.js.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const url = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js'
  const type: WorkerType = import.meta.env.DEV ? 'module' : 'classic'
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: '/', type }).catch(() => {
      // No service worker (old browser, blocked): the site still works, it just cannot be installed or work offline.
    })
  })
}
