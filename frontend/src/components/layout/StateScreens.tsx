import type { ReactNode } from 'react'
import { errorMessage } from '../../lib/api/errorMessage'
import { Illustration } from '../brand/Illustration'
import { AlertCircleIcon } from '../icons/icons'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { MobileShell, ScrollArea, TopBar } from './MobileShell'

/** Inline loading block (skeleton-like pulse of the card shape). */
export function LoadingBlock({ label = 'Loading', lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-[72px] animate-pulse rounded-card border border-card-line bg-white" />
      ))}
    </div>
  )
}

/** Inline error card with a retry button (NFR-012: clear guidance). */
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card pad role="alert" className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 text-red">
        <AlertCircleIcon size={20} />
        <p className="m-0 font-bold">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="alt" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  )
}

/** Empty state: illustration, title, short text and an optional action. */
export function EmptyBlock({
  title,
  text,
  action,
  illustration = 'jerrycan',
}: {
  title: string
  text?: string
  action?: ReactNode
  illustration?: 'jerrycan' | 'keke' | 'tanker' | 'gift'
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Illustration name={illustration} className="animate-float h-20 w-auto" />
      <p className="m-0 text-section font-extrabold">{title}</p>
      {text && <p className="m-0 max-w-[280px] text-sub text-mute">{text}</p>}
      {action && <div className="mt-2 w-full">{action}</div>}
    </div>
  )
}

/** Full-screen loading state while the session is checked. */
export function LoadingScreen() {
  return (
    <MobileShell>
      <TopBar />
      <ScrollArea>
        <LoadingBlock />
      </ScrollArea>
    </MobileShell>
  )
}

/** Full-screen error with retry. */
export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <MobileShell>
      <TopBar />
      <ScrollArea>
        <ErrorBlock error={error} onRetry={onRetry} />
      </ScrollArea>
    </MobileShell>
  )
}
