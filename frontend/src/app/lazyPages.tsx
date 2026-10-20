import { lazy, Suspense, type ReactNode } from 'react'

/*
 * Lazy-loaded development pages (see router.tsx). Each dynamic import sits
 * behind `import.meta.env.DEV`, which the build replaces with `false`, so
 * production bundles do not contain these pages at all.
 */
const notInProduction = () => Promise.reject(new Error('Development page'))

export const MobileGallery = lazy(() =>
  import.meta.env.DEV ? import('../dev/ComponentGallery').then((m) => ({ default: m.MobileGallery })) : notInProduction(),
)
export const MenuGallery = lazy(() =>
  import.meta.env.DEV ? import('../dev/ComponentGallery').then((m) => ({ default: m.MenuGallery })) : notInProduction(),
)
export const AdminGallery = lazy(() =>
  import.meta.env.DEV ? import('../dev/ComponentGallery').then((m) => ({ default: m.AdminGallery })) : notInProduction(),
)
export const FoundationPreview = lazy(() =>
  import.meta.env.DEV ? import('../dev/FoundationPreview').then((m) => ({ default: m.FoundationPreview })) : notInProduction(),
)

/** Suspense boundary for a lazy page. */
export function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
