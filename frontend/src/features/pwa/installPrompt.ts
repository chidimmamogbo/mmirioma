/**
 * Install ("Download app") state for the two installable apps.
 *
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once a page's
 * manifest and service worker make it installable. We keep that event and
 * call `prompt()` when someone taps an Install button. Safari on iPhone has
 * no prompt, so the buttons open a short how-to instead (decision Q3).
 *
 * The event belongs to the manifest the page had when it fired. The customer
 * and partner apps use different manifests (manifest.ts swaps them by path),
 * so a stored event is dropped when the manifest changes; otherwise "Install"
 * on a partner page could install the customer app.
 *
 * This module starts listening when it is imported (main.tsx imports it
 * first), because the event can fire before React renders.
 */
import { useSyncExternalStore } from 'react'

/** Chrome's install event (not in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** The browser offered to install the current app; Install shows its prompt. */
  canPrompt: boolean
  /** iPhone or iPad Safari: no prompt, show "Tap Share, then Add to Home Screen". */
  ios: boolean
  /** Running as the installed app (home-screen icon). Install buttons hide. */
  standalone: boolean
  /** The app was installed from this page just now. */
  installed: boolean
}

let deferred: BeforeInstallPromptEvent | null = null
let deferredFor: string | null = null
let state: InstallState = { canPrompt: false, ios: false, standalone: false, installed: false }
const listeners = new Set<() => void>()

function set(next: Partial<InstallState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function currentManifest(): string | null {
  return document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href') ?? null
}

/** True on iPhone and iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(ua: string, maxTouchPoints: number): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1)
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

if (typeof window !== 'undefined') {
  state = { canPrompt: false, ios: isIos(navigator.userAgent, navigator.maxTouchPoints ?? 0), standalone: isStandalone(), installed: false }
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop the browser's own mini-bar; our buttons show the prompt instead.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    deferredFor = currentManifest()
    set({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    set({ canPrompt: false, installed: true })
  })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => set({ standalone: isStandalone() }))
}

/** Forget a prompt that was offered for another app's manifest (called by manifest.ts). */
export function manifestChanged(href: string): void {
  if (deferred && deferredFor !== href) {
    deferred = null
    set({ canPrompt: false, installed: false })
  }
}

/**
 * Show the browser's install prompt.
 *
 * @returns `accepted` or `dismissed` from the prompt, or `unavailable` when
 * the browser has not offered one (already installed, iPhone, Firefox).
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred
  if (!e) return 'unavailable'
  // A prompt can be used only once.
  deferred = null
  set({ canPrompt: false })
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') set({ installed: true })
  return outcome
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Current install state; re-renders when the browser offers or completes an install. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
