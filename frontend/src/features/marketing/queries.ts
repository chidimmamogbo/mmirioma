/** Query hooks for the public website: the support contact. */
import { useQuery } from '@tanstack/react-query'
import type { PublicContact } from '../../domain/publicSite'
import { DEFAULT_SUPPORT_PHONE, DEFAULT_WHATSAPP } from '../../lib/whatsapp'
import { getPublicContact } from './publicApi'

export const publicKeys = { contact: ['public', 'contact'] as const }

/** Used while loading or when the server cannot be reached, so help is always reachable. */
const FALLBACK: PublicContact = { phone: DEFAULT_SUPPORT_PHONE, whatsapp: DEFAULT_WHATSAPP }

/**
 * The support contact from the backend (FR-055). `whatsapp` is `null` when
 * WhatsApp support is switched off: screens then hide their WhatsApp buttons
 * and show the phone instead (docs/api/public-site.md).
 */
export function useSupportContact(): PublicContact {
  const contact = useQuery({ queryKey: publicKeys.contact, queryFn: getPublicContact, staleTime: 5 * 60_000, retry: false })
  return contact.data ?? FALLBACK
}

/** The WhatsApp number to chat with (E.164), or `null` while WhatsApp support is off. */
export function useWhatsappNumber(): string | null {
  return useSupportContact().whatsapp
}
