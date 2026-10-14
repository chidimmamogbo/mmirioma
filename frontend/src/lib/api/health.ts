import { apiClient, type ApiClient } from './client'

/** Body of `GET /api/v1/health`. */
export interface HealthResponse {
  status: 'ok'
  service: string
}

/**
 * Call the backend liveness endpoint.
 *
 * @param signal - Optional abort signal.
 * @param client - Override for tests; defaults to the shared client.
 * @throws {ApiError} If the API is unreachable or returns an error.
 */
export function getHealth(signal?: AbortSignal, client: ApiClient = apiClient) {
  return client.request<HealthResponse>('/api/v1/health', { signal })
}
