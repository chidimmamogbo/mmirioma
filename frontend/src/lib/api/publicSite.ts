/**
 * Public website endpoint (docs/api/public-site.md, agreed in #8, built in
 * #56). No session and no CSRF token: the website reads it before anyone
 * signs in.
 */
import type { PublicContact } from '../../domain/publicSite'
import { apiClient, type ApiClient } from './client'

/**
 * The support phone and, when WhatsApp support is on, its WhatsApp number
 * (`GET /api/v1/public/contact`, FR-055).
 *
 * @throws {ApiError} `too_many_attempts` (429) or a network error.
 */
export function getPublicContact(client: ApiClient = apiClient): Promise<PublicContact> {
  return client.request<PublicContact>('/api/v1/public/contact')
}
