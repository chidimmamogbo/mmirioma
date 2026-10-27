/**
 * Type for the public website's server call (docs/api/public-site.md): the
 * support contact. The newsletter is out of the pilot (#8).
 */

/** The support contact from backend settings (FR-055). */
export interface PublicContact {
  /** The support number, E.164, e.g. `+2348133774902`. Always present. */
  phone: string
  /** The number for WhatsApp chats, or `null` while WhatsApp support is off. */
  whatsapp: string | null
}
