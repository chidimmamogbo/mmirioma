// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { isStaleChunkError, shouldReloadForStaleChunk } from './staleChunk'

beforeEach(() => sessionStorage.clear())

describe('stale chunk errors', () => {
  it('recognises the browsers’ failed module loads, and nothing else', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: /assets/Orders-abc.js'))).toBe(true)
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('reloads at most once a minute, so it cannot loop', () => {
    const t = Date.UTC(2026, 9, 20, 12)
    expect(shouldReloadForStaleChunk(t)).toBe(true)
    expect(shouldReloadForStaleChunk(t + 5_000)).toBe(false)
    expect(shouldReloadForStaleChunk(t + 61_000)).toBe(true)
  })
})
