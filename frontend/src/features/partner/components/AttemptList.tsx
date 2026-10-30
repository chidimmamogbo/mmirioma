import { Card } from '../../../components/ui/Card'
import { formatTime } from '../../../lib/format/datetime'
import { attemptCountLine } from '../attempts'

/**
 * The partner's recorded attempts to reach the customer (U3): one row per
 * attempt with the server's time, and a count under them. There is no maximum,
 * so every attempt is a row.
 *
 * @param attempts - Attempt times (UTC ISO), oldest first.
 */
export function AttemptList({ attempts, className }: { attempts: string[]; className?: string }) {
  return (
    <Card className={className}>
      {attempts.length === 0 ? (
        <p className="m-0 px-3.5 py-3 text-sub text-mute">No attempts recorded yet.</p>
      ) : (
        <ol className="m-0 list-none p-0 px-3.5 py-1">
          {attempts.map((at, i) => (
            <li key={`${at}-${i}`} className="mo-li justify-between text-[14px] font-semibold">
              <span>Attempt {i + 1}</span>
              <span className="text-mute">{formatTime(at)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 border-0 border-t border-solid border-line px-3.5 py-2.5 text-caption font-bold text-slate" aria-live="polite">
        {attemptCountLine(attempts.length)}
      </p>
    </Card>
  )
}
