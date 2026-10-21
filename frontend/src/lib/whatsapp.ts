/**
 * Company WhatsApp chat links (owner decision 2026-10-21).
 *
 * The number is set by admin in Settings ("Support WhatsApp"). Until admin
 * saves one, or while the website cannot read it, chats go to the interim
 * number below, which the owner chose until the company line is bought.
 */

/** Interim company WhatsApp number (E.164). Replace by saving the new one in admin Settings. */
export const DEFAULT_WHATSAPP = '+2348133774902'

/** The greeting already typed in the chat when someone taps the button. */
export const WHATSAPP_GREETING = "Hello MmiriOma, I'd like to order water."

/**
 * A `https://wa.me/` link that opens a chat with `e164` in the WhatsApp app
 * (or WhatsApp Web), with `text` typed in. wa.me wants the number as digits
 * only, without `+`.
 *
 * @param e164 - Number like `+2348133774902`; falls back to the default when null.
 * @param text - Message to prefill; omit for an empty chat.
 */
export function whatsappLink(e164: string | null, text?: string): string {
  const digits = (e164 ?? DEFAULT_WHATSAPP).replace(/\D/g, '')
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
}
