/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/  ·  test options: https://vitest.dev/config/
/**
 * Whether this build serves mocks (`src/lib/api/mode.ts`): `VITE_USE_MOCKS=true` forces them, `false` forces the API, and
 * unset means mocks in the dev server and tests, the real API in a production build.
 */
function serveMocks(command: 'build' | 'serve', mode: string): boolean {
  const flag = loadEnv(mode, process.cwd(), 'VITE_').VITE_USE_MOCKS
  return flag === 'true' || (command === 'serve' && flag !== 'false')
}

export default defineConfig(({ command, mode }) => ({
  // A literal in every module, so a build without mocks drops the mock layer and its demo values (#236, `lazyMock.ts`).
  define: { __USE_MOCKS__: JSON.stringify(serveMocks(command, mode)) },
  plugins: [
    react(),
    tailwindcss(),
    // Service worker for the installable apps (docs/architecture/frontend.md, "PWA").
    // We write the worker ourselves (src-sw/sw.ts) because it handles push;
    // the plugin only fills in the list of built files to keep offline.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src-sw',
      filename: 'sw.ts',
      // Registered in src/features/pwa/registerServiceWorker.ts.
      injectRegister: false,
      // The two manifests are static files in public/ (customer and partner app).
      manifest: false,
      injectManifest: {
        // App shell only. Marketing photos and PNG fallbacks load from the network.
        globPatterns: ['**/*.{js,css,html,woff2}', 'illustrations/*.webp', 'brand/*@1x.webp', 'brand/*@2x.webp', 'icons/icon-{192,512}.png', 'favicon*'],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  test: {
    // API client and utility tests mock fetch and need no DOM. Component tests
    // opt into jsdom with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // jsdom page tests type, click and load lazy page chunks; with every file
    // running at once on a busy machine or CI runner they can pass 5 s.
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
  },
}))
