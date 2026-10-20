/**
 * Telling a missing lazy chunk (after a new deploy) apart from other errors,
 * and reloading for it at most once a minute so a real outage cannot loop.
 */

const KEY = 'mmirioma.chunk-reload-at'

/** True for the browsers' "could not load this module" errors. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message)
}

/** True when no reload for a stale chunk happened in the last minute; records this one. */
export function shouldReloadForStaleChunk(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY))
    if (Number.isFinite(last) && now - last < 60_000) return false
    sessionStorage.setItem(KEY, String(now))
    return true
  } catch {
    // No storage: never reload automatically, show the error screen instead.
    return false
  }
}
