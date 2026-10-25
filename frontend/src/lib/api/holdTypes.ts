/**
 * Hold vocabulary shared by the admin order, dispatch and hold review calls
 * (docs/api/deliveries.md, "Admin hold review endpoints"). Kept apart so
 * `adminDispatch.ts` and `adminHolds.ts` can both use it without importing
 * each other.
 */

import { z } from 'zod'

/** Hold kinds (driver job concepts, "Hold"). A hold is not an order status. */
export const HOLD_KINDS = ['proof_review', 'source_review', 'unsafe_stop'] as const
export type HoldKind = (typeof HOLD_KINDS)[number]

/** How an administrator decided a hold; only these four show as "hold decided" entries. */
export const HOLD_DECISIONS = ['proof_approved', 'proof_rejected', 'source_continued', 'unsafe_resumed'] as const
export type HoldDecision = (typeof HOLD_DECISIONS)[number]

/** Every way a hold can be closed (`order_exceptions.resolution`). */
export const HOLD_RESOLUTIONS = [...HOLD_DECISIONS, 'failed', 'cancelled', 'withdrawn'] as const
export type HoldResolution = (typeof HOLD_RESOLUTIONS)[number]

/** Exception categories (backend `ExceptionCategory`). */
export const EXCEPTION_CATEGORIES = [
  'running_late',
  'unsafe_access',
  'unsafe_transfer',
  'volume_issue',
  'source_concern',
  'vehicle_problem',
  'other',
  'source_mismatch',
  'pickup_safety_concern',
  'partial_pickup',
  'partial_delivery',
  'customer_unreachable',
  'alternative_proof',
] as const
export type ExceptionCategory = (typeof EXCEPTION_CATEGORIES)[number]

/** `hold` on an admin order: the oldest open hold on its live job (R0). */
export const orderHoldSchema = z.object({
  /** Sent back with a decision (`hold_id`). */
  id: z.string(),
  kind: z.enum(HOLD_KINDS),
  /** When the hold opened (UTC ISO). */
  since: z.string(),
})
export type OrderHold = z.infer<typeof orderHoldSchema>
