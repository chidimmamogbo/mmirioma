// Shared Vitest setup. Adds DOM matchers (toBeInTheDocument, ...) and unmounts
// rendered components after each test, because Vitest globals are off and
// Testing Library cannot register its automatic cleanup.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
