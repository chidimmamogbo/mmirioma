import { ButtonLink } from '../../../components/ui/Button'
import { Notice } from '../../../components/ui/Notice'
import { useSession } from '../../auth/useSession'

/**
 * "Verify your phone number to send your first water request." with a
 * "Verify phone" button, shown while the signed-in customer's phone is not
 * verified (`GET /auth/me` `user.phone_verified`, FR-003). It has no close
 * button (decision 2 of docs/design/phone-verification.md).
 *
 * @param from - The screen to come back to after verifying (Home or Review).
 */
export function VerifyPhoneBanner({ from, className }: { from: string; className?: string }) {
  const session = useSession()
  if (!session.data || session.data.user.phone_verified) return null
  return (
    <Notice className={className}>
      Verify your phone number to send your first water request.
      <span className="mt-2 block">
        <ButtonLink to="/verify-phone" state={{ from }} size="sm" block={false}>
          Verify phone
        </ButtonLink>
      </span>
    </Notice>
  )
}
