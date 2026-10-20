import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api/client'
import { initials } from '../lib/initials'
import { shouldRetry } from './queryClient'

function httpError(status: number) {
  return new ApiError({ kind: 'http', status, code: 'x', message: 'x' })
}

describe('shouldRetry', () => {
  it('never retries client errors or misconfiguration', () => {
    expect(shouldRetry(0, httpError(401))).toBe(false)
    expect(shouldRetry(0, httpError(422))).toBe(false)
    expect(shouldRetry(0, new ApiError({ kind: 'config', status: null, code: 'missing_api_base_url', message: 'x' }))).toBe(false)
  })

  it('retries network and server errors up to twice', () => {
    const network = new ApiError({ kind: 'network', status: null, code: 'network_error', message: 'x' })
    expect(shouldRetry(0, network)).toBe(true)
    expect(shouldRetry(1, httpError(503))).toBe(true)
    expect(shouldRetry(2, httpError(503))).toBe(false)
  })
})

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initials('Adaeze Nwosu')).toBe('AN')
    expect(initials('  chidimma  m. ')).toBe('CM')
    expect(initials('Emeka')).toBe('E')
    expect(initials('Chukwudi Ifeanyi Ilonze')).toBe('CI')
  })
})
