/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** 'true' serves typed mock data instead of calling the API (see src/lib/api/mode.ts). */
  readonly VITE_USE_MOCKS?: string
  /** Public VAPID key for push subscriptions (docs/api/push.md). Public by design; the private key stays on the server. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
