/**
 * Whether typed API functions serve mock data (`src/mocks/`) instead of
 * calling the backend through `client.ts`.
 *
 * - `VITE_USE_MOCKS=true` forces mocks, `VITE_USE_MOCKS=false` forces the API.
 * - Unset: mocks in `npm run dev` (most new-design endpoints do not exist
 *   yet), the real API in a production build, so a deployed build never shows
 *   sample data by accident.
 *
 * Every typed API function checks this once, so switching a feature to the
 * real API is a change in that one function, not in the screens.
 */
export const USE_MOCKS: boolean =
  import.meta.env.VITE_USE_MOCKS === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== 'false')
