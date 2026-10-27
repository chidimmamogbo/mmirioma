/**
 * Product features switched off for the pilot but kept in the code, so each
 * comes back with a one-line change once its requirement, contract and
 * backend exist.
 */

/**
 * Loyalty points: points earned per delivery, the balance, rewards and the
 * "My points" page. Out of the MVP: neither the SRS nor the PRD defines them
 * and there is no backend (docs/api/customer-account.md, decision 12). The
 * owner decided on #107 (2026-10-27) to hide them rather than delete them, so
 * they can return after the MVP.
 *
 * While `false`, in mock and real mode alike: no screen shows points, the
 * points query never runs, points notifications are not listed, and `/points`
 * redirects to `/home`.
 */
export const POINTS_ENABLED = false
