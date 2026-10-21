/**
 * Typed functions for the public website's server calls
 * (docs/api/public-site.md, proposed). Mock mode uses `src/mocks/publicMock.ts`;
 * with the real API they fail with `not_connected` until the endpoints exist.
 *
 * The mock is imported on first use, not at the top: the public pages are in
 * the main bundle, and the mock database should not make it bigger.
 */
import type { NewsletterInput, NewsletterResult, PublicContact } from '../../domain/publicSite'
import { USE_MOCKS } from '../../lib/api/mode'
import { notConnected } from '../../lib/api/notConnected'

const loadMock = () => import('../../mocks/publicMock')

/** The WhatsApp and phone numbers admin set (GET /api/v1/public/contact). */
export function getPublicContact(): Promise<PublicContact> {
  return USE_MOCKS ? loadMock().then((m) => m.getPublicContact()) : notConnected('Contact details')
}

/** Add an email to the newsletter (POST /api/v1/newsletter/subscriptions). */
export function subscribeNewsletter(input: NewsletterInput): Promise<NewsletterResult> {
  return USE_MOCKS ? loadMock().then((m) => m.subscribeNewsletter(input)) : notConnected('Newsletter sign-up')
}
