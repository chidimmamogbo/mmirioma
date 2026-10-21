/**
 * Mock of the public website endpoints (docs/api/public-site.md, proposed).
 * No sign-in needed: anyone on the website can call them.
 */
import type { NewsletterInput, NewsletterResult, PublicContact } from '../domain/publicSite'
import { EMAIL_MAX_LENGTH, EMAIL_PATTERN } from '../lib/forms'
import { mutate, read } from './db'
import { delay, mockError } from './store'

/** The WhatsApp and phone numbers admin saved in Settings (null until set). */
export async function getPublicContact(): Promise<PublicContact> {
  await delay(null, 120)
  const { support_whatsapp, support_phone } = read().admin.settings
  return { whatsapp: support_whatsapp, phone: support_phone }
}

/**
 * Add an email address to the newsletter list. Addresses are compared in
 * lower case, so `Ada@Example.com` and `ada@example.com` are one subscriber.
 * Signing up again changes nothing and gives the same answer.
 *
 * @throws ApiError 422 `validation_error` when the address is not an email.
 */
export async function subscribeNewsletter(input: NewsletterInput): Promise<NewsletterResult> {
  await delay(null, 400)
  const email = input.email.trim().toLowerCase()
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw mockError(422, 'validation_error', 'Enter a valid email address.', [
      { loc: ['body', 'email'], msg: 'Enter a valid email address.', type: 'value_error' },
    ])
  }
  mutate((s) => {
    // Older saved mock data has no list yet.
    s.newsletter ??= []
    if (!s.newsletter.some((n) => n.email === email)) s.newsletter.push({ email, subscribed_at: new Date().toISOString() })
  })
  return { status: 'subscribed' }
}
