/**
 * Order confirmation vocabulary shared by the order detail, its history and
 * the confirmation calls (docs/api/deliveries.md, "Order confirmation
 * endpoints", agreed G3 in PR #111, built in #113). Kept apart so
 * `adminDispatch.ts` and `adminConfirmation.ts` can both use it without
 * importing each other.
 */

import { z } from 'zod'

/** Why a source cannot serve a category, in the server's order ("Source eligibility (shared with R2)"). */
export const SOURCE_REASONS = ['not_activated', 'suspended', 'revoked', 'approval_expired'] as const
export type SourceReason = (typeof SOURCE_REASONS)[number]

/** How the customer agreed: the hold review's codes, reused (confirmation decision 4). */
export const AGREEMENT_METHODS = ['phone_call', 'in_person_to_staff', 'other'] as const
export type AgreementMethod = (typeof AGREEMENT_METHODS)[number]

const windowSchema = z.object({ start_at: z.string(), end_at: z.string() })
export type DeliveryWindow = z.infer<typeof windowSchema>

/**
 * The fields `AdminOrderDetail` gains with confirmation. Each is `null` on an
 * unconfirmed order, and a missing one (an older server) reads as `null`.
 */
export const orderConfirmationSchema = z.object({
  water_category: z.object({ id: z.string(), label: z.string() }).nullable().default(null),
  /** The order's source with its **current** eligibility; reasons drive the C2 warning and block nothing (decision 10). */
  source: z
    .object({
      id: z.string(),
      name: z.string(),
      approximate_location: z.string(),
      report_reference: z.string().nullable(),
      reasons: z.array(z.enum(SOURCE_REASONS)),
    })
    .nullable()
    .default(null),
  delivery_window: windowSchema.nullable().default(null),
  /** The frozen price snapshot (FR-024); `total_minor_units` is integer kobo. */
  price: z
    .object({
      total_minor_units: z.number().int(),
      currency: z.literal('NGN'),
      manual: z.boolean(),
      water_category_label: z.string(),
      entered_by: z.object({ id: z.string(), name: z.string() }).nullable(),
      entered_at: z.string(),
      customer_agreement: z.object({ method: z.enum(AGREEMENT_METHODS), agreed_at: z.string() }),
    })
    .nullable()
    .default(null),
  /** Whether the SMS provider accepted the confirmation SMS; never that it arrived (FR-050). */
  confirmation_sms: z
    .object({ status: z.enum(['accepted', 'not_accepted']), attempted_at: z.string() })
    .nullable()
    .default(null),
})
export type OrderConfirmation = z.infer<typeof orderConfirmationSchema>

/** An order with no confirmation yet: every field `null`. */
export const NO_CONFIRMATION: OrderConfirmation = {
  water_category: null,
  source: null,
  delivery_window: null,
  price: null,
  confirmation_sms: null,
}

/** `confirmation` on the history entry that confirmed the order (row 7); `null` on every other entry. */
export const confirmationLineSchema = z.object({
  water_category_label: z.string(),
  source_name: z.string(),
  delivery_window: windowSchema,
  total_minor_units: z.number().int(),
  manual: z.boolean(),
})
export type ConfirmationLine = z.infer<typeof confirmationLineSchema>
