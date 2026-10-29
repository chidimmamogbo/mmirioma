/**
 * Whether typed API functions serve mock data (`src/mocks/`) instead of
 * calling the backend through `client.ts`.
 *
 * - `VITE_USE_MOCKS=true` forces mocks, `VITE_USE_MOCKS=false` forces the API.
 * - Unset: mocks in `npm run dev` (most new-design endpoints do not exist
 *   yet), the real API in a production build, so a deployed build never shows
 *   sample data by accident.
 *
 * The rule itself lives in `vite.config.ts`, which sets the build-time constant `__USE_MOCKS__`. A literal there lets a build
 * without mocks drop `src/mocks/` and its demo values (#236, `lazyMock.ts`).
 *
 * Every typed API function checks this once, so switching a feature to the
 * real API is a change in that one function, not in the screens.
 */
export const USE_MOCKS: boolean = __USE_MOCKS__
