# Admin order cancellation design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#129](https://github.com/chidimmamogbo/mmirioma/issues/129) ·
Requirements: FR-036, FR-044, FR-050, NFR-004, SRS fallback F10 · Prompt:
[prompts/17-admin-order-cancellation.md](prompts/17-admin-order-cancellation.md)
· Contract (agreed, G3):
[deliveries.md](../api/deliveries.md#get-adminordersreferencecancellation-outcome),
"GET /admin/orders/{reference}/cancellation-outcome" and "POST
/admin/orders/{reference}/transition (fail and cancel)"
Designer: @nnamdi-security + Claude Code (for #129, owner @Cloudcrackamara) ·
Reviewed by: pending · Status: ready for review (G2)

The "Cancel this order" button on the Orders page's order panel is redesigned
around the agreed cancel. It keeps its place and opens the CANCEL dialog of
[admin-hold-review.md](admin-hold-review.md) (#128, built in #166), so there is
one cancel flow. It drops the mock's free-text reason and the promises the
contract does not keep: "the rider and the customer are told" and "a paid order
becomes a refund to pay as points". What the cancel does is what the contract
says: the order becomes `cancelled`, the live assignment is `withdrawn` and the
job leaves the driver's list, nothing notifies the driver, the customer's
charge is 0 (`mmirioma_unable`, FR-044), and no cancellation message goes to
the customer yet: an administrator tells them (fallback F10).

## Design link

No clickable preview: the screen is one button on an existing panel plus
variants of a dialog that #128's preview already shows (its `Dialogs.dc.html`
board, CANCEL). The brief ([prompt 17](prompts/17-admin-order-cancellation.md))
specifies each state, and the screens are built from the handoff's existing
components. A preview can be made from the brief if the G2 reviewer asks for
one.

## Screens and states

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| C0 Order panel entry | The "Cancel this order" button (outlined, danger colour) at the bottom of the panel, shown for Awaiting confirmation, Awaiting rider, Assigned, Loading, On the way and Delivery failed; **not on the page** for Delivered, Cancelled and Disputed. Pressing it opens the CANCEL dialog (C1), not an inline form. After a successful cancel: toast "Order cancelled. Tell the customer.", the panel reads Cancelled, "Assign a rider" and the button are gone, and the order moves to the "Cancelled" pill with the counts updated | Build now |
| C1 CANCEL dialog, from the entry | The dialog of #128 with three variants. **a. With a live driver:** "The driver's job ends and leaves their list. Nothing notifies the driver. No cancellation message is sent to the customer yet: tell them yourself." **b. No live driver** (Awaiting confirmation, Awaiting rider, Delivery failed): "No driver is assigned, so no driver's job changes. No cancellation message is sent to the customer yet: tell them yourself." **c. An open hold:** adds "This also closes the <kind> hold." The dialog's own states are #128's, unchanged: loading the sentence, "We couldn't check what this costs the customer." with Try again (Cancel order stays disabled), "This order can no longer be cancelled.", "This order has changed." with Refresh, a 422, no connection | Build now (the dialog itself is built in #166; this adds variants b and c) |
| Phone (360 px) | The same entry at the bottom of the panel; the dialog full screen with the buttons fixed at the bottom, as in #128 | Build now |
| Customer-requested cancel | Not designed (open question 1) | Design ahead, after a contract change |

## Screen-to-endpoint table

All paths are under `/api/v1`.

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| C0 | The order, its status, its live driver and its hold | `GET /admin/orders/{reference}` ([orders.md](../api/orders.md), [deliveries.md](../api/deliveries.md#hold-object-on-admin-orders-r0)) | `status`, `assignment.driver.name` (a live assignment), `hold` (`id`, `kind`, `since`) |
| C1 | The customer's cost sentence | `GET /admin/orders/{reference}/cancellation-outcome?reason_code=mmirioma_unable` | `message` (as written), `customer_charge_minor_units`; 409 `invalid_order_transition` (the order cannot be cancelled, row 23) |
| C1 | Cancel order | `POST /admin/orders/{reference}/transition` | `to: cancelled`, `expected_status` (the status the panel loaded), `reason_code: mmirioma_unable`, `note` (optional, up to 500); no `hold_id` from the entry; 409 `invalid_order_transition`; 422 `validation_error` (`loc`) |
| All | Errors | the calls above | 401, 403 `forbidden`, 403 `csrf_failed`, 404 `order_not_found`, 422 `validation_error` |

No row needs a change to the contract. Mock mode (`VITE_USE_MOCKS=true`) keeps
its own `cancelOrder`; the dialog shows the same wording, with the server's
sentence labelled SAMPLE.

## Decisions

Design choices for the reviewer (G2):

1. **The button stays where it is, and opens the shared dialog.** The inline
   card with a reason box goes. One dialog serves this entry and the hold
   review sheet (#128, decision 14), so wording and states cannot drift apart.
2. **Hidden, not disabled, when the order cannot be cancelled.** The contract
   (row 23) refuses a cancel from `cancelled`, `delivered` and `disputed`, so
   the button is not on the page for those. A button that never works would
   invite a click and an error.
3. **No free-text reason and no example reason.** The reason is the fixed line
   "MmiriOma is unable to deliver". The old placeholder "e.g. Customer asked to
   cancel by phone" goes, because it invites a reason the contract does not
   accept (open question 1). The note stays optional (up to 500), as the
   contract allows.
4. **The driver sentence appears only when a driver's job is live.** From an
   unconfirmed, unassigned or failed order there is no live assignment, so
   "The driver's job ends and leaves their list" would be untrue. Variant b
   says that no driver is assigned. This is a change to #128's dialog text,
   agreed here and built with it in #166 (open question 2).
5. **An order with an open hold can be cancelled from here too.** The contract
   closes every open hold on the job when an order is cancelled, so the entry
   sends no `hold_id` and the dialog says "This also closes the <kind> hold."
   The panel's hold banner and its Review button stay as #128 designed them.
6. **`expected_status` is the status the panel loaded**, so a cancel never
   lands on an order that changed meanwhile: a mismatch is 409
   `invalid_order_transition` and the dialog says "This order has changed."
   with Refresh, as everywhere else.
7. **After a cancel the toast is the only reminder.** "Order cancelled. Tell
   the customer." The panel does not keep a "tell the customer" notice,
   because it cannot know whether the customer was told, and a notice that is
   sometimes untrue is worse than none.
8. **Removed promises, in one place:** "The rider and the customer are told."
   (nothing notifies the driver, and no message goes to the customer yet) and
   "A paid order becomes a refund to pay as points." (refunds are decided and
   paid outside the app, F7, and points are out of the MVP).
9. **The cost to the customer is the server's sentence, as written.** The
   cancel button stays off until it has loaded, as in #128 (decision 9), so the
   dialog never states a cost the client worked out.

## Open questions

1. **Cancelling because the customer asked.** The most common real case is a
   customer phoning to cancel. The agreed cancel accepts only
   `mmirioma_unable`, and the cost outcome for any other reason is a 422 until
   "the cancellation feature" exists. Cancelling at the customer's request has
   its own FR-044 rules (free before the driver departs, then only delivery
   costs actually incurred, never more than the disclosed delivery charge) and
   its own audit reason. Until that exists, a dispatcher who cancels because
   the customer asked would record a reason that is not true. This design does
   not add the reason (no invented business rule). Proposal: a separate
   contract issue for `customer_request` (and `other`) on row 23 and the
   FR-044 outcome, with acceptance test T-26, before any screen offers it.
   Recommendation: open it now.
2. **The no-driver variant belongs to #128's dialog.** Variants b and c change
   the dialog's text, and #166 builds the dialog. The owner of #166 should
   build them with it; if the dialog has already merged, a small follow-up
   adds them.

## Changes to the design system

None. The outlined danger button, the dialog and the toast already exist
(handoff v1 and [admin-hold-review.md](admin-hold-review.md)).

## After approval

Open the link issue for `cancelOrder` (the Done-when item of #129): the entry
on the order panel, the two dialog variants, and the adapter for
`cancellation-outcome` and `transition` with `to: cancelled`, with the mock for
`VITE_USE_MOCKS=true`. It depends on the CANCEL dialog from #166. The status
label for a cancelled order needs no new row in `api-mapping.md`.
