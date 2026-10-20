import { useEffect, useState } from 'react'

/** "01:45" from seconds. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Seconds left until `targetMs` (a timestamp), counting down once a second
 * and stopping at 0. The clock is read only in the state initialiser and the
 * timer, so rendering stays pure.
 */
export function useSecondsUntil(targetMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  const running = targetMs > now
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running, targetMs])
  return Math.max(0, (targetMs - now) / 1000)
}
