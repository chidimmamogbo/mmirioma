import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './client'
import { getHealth } from './health'

const BASE_URL = 'http://api.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(impl: () => Promise<Response>) {
  return vi.fn<typeof fetch>(impl)
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('Expected the request to fail')
}

describe('health endpoint integration', () => {
  it('calls the health endpoint with credentials and returns the payload', async () => {
    const fetch = mockFetch(async () =>
      jsonResponse({ status: 'ok', service: 'mmirioma-api' }),
    )
    const client = createApiClient({ baseUrl: `${BASE_URL}/`, fetch })

    const health = await getHealth(undefined, client)

    expect(health).toEqual({ status: 'ok', service: 'mmirioma-api' })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/api/v1/health`)
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
  })
})

describe('createApiClient', () => {
  it('serializes JSON bodies', async () => {
    const fetch = mockFetch(async () => jsonResponse({ ok: true }))
    const client = createApiClient({ baseUrl: BASE_URL, fetch })

    await client.request('/echo', { method: 'POST', body: { litres: 20 } })

    const init = fetch.mock.calls[0][1]
    expect(init?.body).toBe('{"litres":20}')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('maps the backend error envelope to ApiError', async () => {
    const fetch = mockFetch(async () =>
      jsonResponse(
        {
          error: {
            code: 'service_unavailable',
            message: 'Database is not reachable',
            details: null,
          },
        },
        503,
      ),
    )
    const client = createApiClient({ baseUrl: BASE_URL, fetch })

    const error = await captureError(client.request('/api/v1/health/ready'))

    expect(error).toMatchObject({
      kind: 'http',
      status: 503,
      code: 'service_unavailable',
      message: 'Database is not reachable',
    })
  })

  it('handles error responses without the envelope', async () => {
    const fetch = mockFetch(async () => new Response('Bad Gateway', { status: 502 }))
    const client = createApiClient({ baseUrl: BASE_URL, fetch })

    const error = await captureError(client.request('/x'))

    expect(error).toMatchObject({ kind: 'parse', status: 502, code: 'http_error' })
  })

  it('reports network failures as network errors', async () => {
    const fetch = mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = createApiClient({ baseUrl: BASE_URL, fetch })

    const error = await captureError(client.request('/x'))

    expect(error).toMatchObject({ kind: 'network', status: null, code: 'network_error' })
  })

  it('rethrows aborts unchanged', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const fetch = mockFetch(async () => {
      throw abort
    })
    const client = createApiClient({ baseUrl: BASE_URL, fetch })

    await expect(client.request('/x')).rejects.toBe(abort)
  })

  it('fails clearly when the base URL is missing', async () => {
    const fetch = mockFetch(async () => jsonResponse({}))
    const client = createApiClient({ baseUrl: undefined, fetch })

    const error = await captureError(client.request('/x'))

    expect(error).toMatchObject({ kind: 'config', code: 'missing_api_base_url' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
