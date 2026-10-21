/** Query hooks for the public website: company contact numbers and newsletter sign-up. */
import { useMutation, useQuery } from '@tanstack/react-query'
import type { NewsletterInput } from '../../domain/publicSite'
import { DEFAULT_WHATSAPP } from '../../lib/whatsapp'
import { getPublicContact, subscribeNewsletter } from './publicApi'

export const publicKeys = { contact: ['public', 'contact'] as const }

/**
 * The company WhatsApp number to chat with (E.164). Admin's saved number
 * when there is one; the default while loading, when none is set, or when
 * the server cannot be reached, so the chat button always works.
 */
export function useWhatsappNumber(): string {
  const contact = useQuery({ queryKey: publicKeys.contact, queryFn: getPublicContact, staleTime: 5 * 60_000, retry: false })
  return contact.data?.whatsapp ?? DEFAULT_WHATSAPP
}

/** Newsletter sign-up from the public pages. */
export const useNewsletterSignup = () => useMutation({ mutationFn: (input: NewsletterInput) => subscribeNewsletter(input) })
