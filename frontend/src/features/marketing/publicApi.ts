/**
 * The public website's server call (docs/api/public-site.md). Mock mode uses
 * `src/mocks/publicMock.ts`; real-API mode calls `GET /api/v1/public/contact`.
 *
 * The mock is imported on first use, not at the top: the public pages are in
 * the main bundle, and the mock database should not make it bigger.
 */
import type { PublicContact } from '../../domain/publicSite'
import { USE_MOCKS } from '../../lib/api/mode'
import * as real from '../../lib/api/publicSite'

const loadMock = () => import('../../mocks/publicMock')

/** The support contact (`GET /api/v1/public/contact`, FR-055). */
export function getPublicContact(): Promise<PublicContact> {
  return USE_MOCKS ? loadMock().then((m) => m.getPublicContact()) : real.getPublicContact()
}
