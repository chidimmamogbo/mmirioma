import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Notice } from '../../../components/ui/Notice'
import { errorMessage } from '../../../lib/api/errorMessage'
import { stepErrorKind } from '../stepErrorKind'

/**
 * The error notice of an arrival or unreachable-customer step, with the
 * design's wording (docs/design/driver-arrival-unreachable.md, "Wording to
 * approve").
 *
 * @param error - The failed request's error.
 * @param notSent - Words for a request that did not reach the server.
 * @param onRetry - Shown as a button on a not-sent error and a "Refresh" one on a changed job.
 * @param base - The app's home, for "Back to dashboard" after a reassignment.
 */
export function StepError({ error, notSent, onRetry, retryLabel = 'Try again', base }: { error: unknown; notSent: string; onRetry?: () => void; retryLabel?: string; base: string }) {
  switch (stepErrorKind(error)) {
    case 'paused':
      // The server's own hold message follows the fixed words.
      return (
        <Notice tone="error">
          <b>This job is paused. The dispatcher will contact you.</b> {errorMessage(error)}
        </Notice>
      )
    case 'changed':
      return (
        <Notice tone="error">
          <b>This job has changed.</b> It is no longer at this step.
          {onRetry && (
            <Button variant="line" size="sm" className="mt-2" onClick={onRetry}>
              Refresh
            </Button>
          )}
        </Notice>
      )
    case 'reassigned':
      return (
        <Notice tone="error">
          This job was reassigned. It is no longer on your list.{' '}
          <Link to={base} className="font-bold">
            Back to dashboard
          </Link>
        </Notice>
      )
    case 'not_sent':
      return (
        <Notice tone="error">
          {notSent}
          {onRetry && (
            <Button variant="line" size="sm" className="mt-2" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </Notice>
      )
    default:
      return <Notice tone="error">{errorMessage(error)}</Notice>
  }
}
