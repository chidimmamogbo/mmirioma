/// <reference lib="webworker" />
/**
 * MmiriOma service worker, shared by the customer app and the partner app
 * (one origin, scope `/`). Built by vite-plugin-pwa in `injectManifest` mode,
 * which replaces `self.__WB_MANIFEST` with the list of built files.
 *
 * What it does:
 * - App shell offline (decision Q2): keeps the built JS, CSS, fonts, icons and
 *   illustrations, so screens open without a connection. Page loads try the
 *   network first and fall back to the saved `index.html`. API data is never
 *   cached and actions are never queued; screens show their own error states.
 * - Google Fonts: saved after first use, so text keeps its font offline.
 * - Push (decision Q9): shows the server's message and opens the right screen
 *   when it is tapped (payload: `PushPayload`, docs/api/push.md).
 */
import type { PushPayload } from '../src/domain/push'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] }

const PRECACHE = self.__WB_MANIFEST
const FONT_CACHE = 'mo-fonts-v1'
const SHELL_PREFIX = 'mo-shell-'

/** A short hash of the file list, so each build gets its own cache. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i)
  return (h >>> 0).toString(36)
}

const SHELL_CACHE = SHELL_PREFIX + hash(JSON.stringify(PRECACHE))
const SHELL_URLS = new Set(PRECACHE.map((e) => new URL(e.url, self.location.href).href))
const INDEX_URL = new URL('index.html', self.location.href).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([...SHELL_URLS]))
      // Take over straight away: built files have hashed names, so the new
      // shell never mixes with the old one inside a page.
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(SHELL_PREFIX) && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).catch(() => caches.match(INDEX_URL).then((r) => r ?? Response.error())))
      return
    }
    if (SHELL_URLS.has(url.href)) {
      event.respondWith(caches.match(url.href).then((r) => r ?? fetch(req)))
    }
    return
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req))
  }
  // Anything else (the API) goes straight to the network.
})

async function staleWhileRevalidate(req: Request): Promise<Response> {
  const cache = await caches.open(FONT_CACHE)
  const cached = await cache.match(req)
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') void cache.put(req, res.clone())
      return res
    })
    .catch(() => cached ?? Response.error())
  return cached ?? fresh
}

/** Read a push message; anything malformed still shows a safe generic notice. */
function parsePayload(data: PushMessageData | null): PushPayload {
  const fallback: PushPayload = { title: 'MmiriOma', body: 'You have a new update.', url: '/app', tag: 'mmirioma' }
  try {
    const p = data?.json() as Partial<PushPayload> | undefined
    if (!p || typeof p.title !== 'string' || typeof p.body !== 'string') return fallback
    // Only in-app paths: a push must never open another site.
    const url = typeof p.url === 'string' && p.url.startsWith('/') && !p.url.startsWith('//') ? p.url : '/app'
    return { title: p.title, body: p.body, url, tag: typeof p.tag === 'string' ? p.tag : fallback.tag }
  } catch {
    return fallback
  }
}

self.addEventListener('push', (event) => {
  const p = parsePayload(event.data)
  event.waitUntil(self.registration.showNotification(p.title, { body: p.body, tag: p.tag, icon: '/icons/icon-192.png', data: { url: p.url } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.notification.data as { url?: unknown } | null)?.url
  const href = new URL(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/app', self.location.origin).href
  event.waitUntil(openOrFocus(href))
})

/**
 * Bring an open window of the same app (customer or partner) to the front
 * and show the screen, or open a new one.
 */
async function openOrFocus(href: string): Promise<void> {
  const partner = new URL(href).pathname.startsWith('/partner')
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const same = windows.find((w) => new URL(w.url).pathname.startsWith('/partner') === partner)
  if (same) {
    await same.focus()
    const moved = await same.navigate(href).catch(() => null)
    if (moved) return
  }
  await self.clients.openWindow(href)
}
