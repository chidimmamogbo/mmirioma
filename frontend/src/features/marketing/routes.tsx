import type { RouteObject } from 'react-router-dom'
import { FaqPage } from './FaqPage'
import { Landing } from './Landing'
import { PrivacyPage, TermsPage } from './LegalPages'

/**
 * Public pages from design/MmiriOma-landing-handoff. No shell and no sign-in
 * guard: anyone can open them, signed in or not.
 */
export const marketingRoutes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/faq', element: <FaqPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
]
