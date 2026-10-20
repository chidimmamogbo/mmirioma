import { useCallback, useState } from 'react'
import { promptInstall, useInstallState } from './installPrompt'

/**
 * What an Install ("Download app") button does on this device (decision Q3):
 * - Chrome, Edge, Samsung Internet: the browser's own install prompt.
 * - iPhone and iPad: a short how-to sheet (Apple gives websites no prompt).
 * - Already installed, running as the app, or a browser that cannot install
 *   (Firefox): `available` is false and the button hides or falls back.
 */
export function useInstallAction() {
  const state = useInstallState()
  const [howToOpen, setHowToOpen] = useState(false)
  // Stable, because the how-to sheet's focus effect depends on it.
  const closeHowTo = useCallback(() => setHowToOpen(false), [])
  const available = !state.standalone && !state.installed && (state.canPrompt || state.ios)

  /** @returns false when nothing could be shown, so the caller can fall back (e.g. go to sign-in). */
  async function install(): Promise<boolean> {
    if (state.ios && !state.standalone) {
      setHowToOpen(true)
      return true
    }
    return (await promptInstall()) !== 'unavailable'
  }

  return { ...state, available, install, howToOpen, closeHowTo }
}
