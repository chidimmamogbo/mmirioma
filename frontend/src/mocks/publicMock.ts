/**
 * Mock of the public website endpoint (docs/api/public-site.md).
 * No sign-in needed: anyone on the website can call it.
 */
import type { PublicContact } from '../domain/publicSite'
import { DEFAULT_SUPPORT_PHONE } from '../lib/whatsapp'
import { delay } from './store'

/** The support contact, as the backend's settings give it (WhatsApp on, #8). */
export async function getPublicContact(): Promise<PublicContact> {
  await delay(null, 120)
  return { phone: DEFAULT_SUPPORT_PHONE, whatsapp: DEFAULT_SUPPORT_PHONE }
}
