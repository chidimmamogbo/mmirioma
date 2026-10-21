/**
 * Types for the public website's two server calls (docs/api/public-site.md,
 * proposed): the company contact numbers admin sets, and newsletter sign-up.
 */

/** Contact numbers set by admin in Settings. `null` when admin has not set one. */
export interface PublicContact {
  /** E.164, e.g. `+2348133774902`. Opens the WhatsApp chat button. */
  whatsapp: string | null
  /** E.164 support phone, or null. */
  phone: string | null
}

export interface NewsletterInput {
  email: string
}

/**
 * The same answer whether the address was new or already on the list, so the
 * form cannot be used to find out who is subscribed.
 */
export interface NewsletterResult {
  status: 'subscribed'
}
