/**
 * The mock database: one state object, loaded from localStorage once and
 * saved after every change. `mutate` is the only way to change it.
 */
import { deliverMockPush, notificationIds } from './mockPush'
import { MOCK_STORAGE_KEY, loadState, resetState, saveState } from './store'
import { seedState, type MockState } from './seed'

let state: MockState | null = null

// Another tab (say the rider app beside the customer app) saved a change:
// drop the in-memory copy so the next read loads the shared data again.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === MOCK_STORAGE_KEY || e.key === null) state = null
  })
}

function current(): MockState {
  state ??= loadState(() => seedState())
  return state
}

/** Read the mock state. Treat the result as read-only. */
export function read(): MockState {
  return current()
}

/**
 * Change the mock state and persist it. Saves even when the change throws,
 * because a handler may record something (a failed code try) and then
 * reject, as a server would. New notifications are then sent as push
 * notifications to users who turned them on (see mockPush.ts).
 */
export function mutate<T>(change: (s: MockState) => T): T {
  const s = current()
  const before = notificationIds(s)
  try {
    return change(s)
  } finally {
    saveState(s)
    deliverMockPush(s, before)
  }
}

/** Forget all changes and start again from the seed data (tests, demo reset). */
export function resetMockDb(): void {
  resetState()
  state = null
}
