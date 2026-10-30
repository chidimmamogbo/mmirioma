# Prompt 17: cancelling an order from the admin order detail

Issue: [#129](https://github.com/mmiri-oma/mmirioma/issues/129) ·
Requirements: FR-036, FR-044, FR-050, NFR-004, SRS fallback F10 · Contract
(agreed, G3):
[deliveries.md](../../api/deliveries.md#get-adminordersreferencecancellation-outcome),
"GET /admin/orders/{reference}/cancellation-outcome" and "POST
/admin/orders/{reference}/transition (fail and cancel)" · Backend: built in
#93 and #112 · Build: a link issue opened after G2 (#17 was closed and
re-scoped, see #130). The CANCEL dialog itself is designed in
[prompt 16](16-admin-hold-review.md) (#128) and built in #166.

**Why this prompt:** the Orders page has a "Cancel this order" button, but it
comes from the design handoff, before the cancel was agreed. It takes a
free-text reason ("Customer asked to cancel by phone") and promises that "the
rider and the customer are told" and that "a paid order becomes a refund to pay
as points". The agreed cancel accepts one reason, `mmirioma_unable`, notifies
no one, and never refunds in the app (refunds are outside it, F7). The button
cannot be linked until its wording matches what the endpoint does.

**What is already designed:** #128 owns the CANCEL dialog (reason line, the
server's sentence, note, what it does, every error state) and FAIL. This prompt
designs only **the entry on the order detail** and the small variants of that
dialog an entry from the order detail needs (an order with no live driver, an
order with an open hold).

**Before using:** the visual system is the **design handoff v1**
([handoff-v1.md](../handoff-v1.md)), the `a-orders` side panel, and the dialog
of [admin-hold-review.md](../admin-hold-review.md). Add a component only when a
screen truly needs one, and say so. Paste everything inside the block into
Claude Design, or use it as the spec for a clickable preview.

```text
Using the MmiriOma admin design already in this project (design handoff v1:
the Orders page with its pills and right-hand panel, and the dialogs of the
hold review design; Plus Jakarta Sans), design the "CANCEL THIS ORDER" ENTRY
on the order panel. Desktop first at 1280px; also 360px.

CONTEXT
A dispatcher opens an order in the Orders page's right-hand panel. At the
bottom there is a "Cancel this order" button. It opens the CANCEL DIALOG that
the hold review design already has. You do not redesign that dialog; you show
it from this entry and design the variants below.

PRODUCT HONESTY RULES (every screen)
- The only reason is "MmiriOma is unable to deliver". It is fixed text, never
  a choice and never a free-text field. No example reason such as "Customer
  asked to cancel by phone".
- The sentence about what the cancel costs the customer comes from the server
  and is shown exactly as written. Never write an amount or a refund promise.
- Say only what the cancel does: the driver's job ends and leaves their list;
  nothing notifies the driver; no cancellation message goes to the customer
  yet, so the dispatcher tells them. Never "the rider and the customer are
  told", never a refund, never points.
- Simulated orders keep their SIMULATED label (BR-09). In the mock, the
  server's sentence is labelled SAMPLE.
- No customer phone number or address beyond what the panel already shows.

SCREENS AND STATES

C0. ORDER PANEL ENTRY (build now)
  The existing "Cancel this order" button (outlined, danger colour) at the
  bottom of the panel, below the assign and details cards. Pressing it opens
  the CANCEL dialog (C1), not an inline form.
  Shown for every order except Delivered, Cancelled and Disputed: for those
  it is not on the page (hidden, not disabled). It is shown for an order that
  is Awaiting confirmation, Awaiting rider, Assigned, Loading, On the way and
  Delivery failed.
  After a successful cancel: the dialog closes, the toast "Order cancelled.
  Tell the customer." shows, the panel reads Cancelled (status chip), "Assign
  a rider" and the cancel button are gone, and the order moves to the
  "Cancelled" pill with the counts updated.

C1. CANCEL DIALOG, as opened from the entry (the dialog is #128's; show
    these variants)
  a. With a driver: as in the hold review design. Text "The driver's job ends
     and leaves their list. Nothing notifies the driver. No cancellation
     message is sent to the customer yet: tell them yourself."
  b. No live driver (Awaiting confirmation, Awaiting rider, Delivery failed):
     the same dialog WITHOUT the driver sentence: "No driver is assigned, so
     no driver's job changes. No cancellation message is sent to the customer
     yet: tell them yourself."
  c. The order has an open hold: add "This also closes the <kind> hold."
     (Proof review, Source review or Unsafe stop), as the dialog does from the
     hold review sheet.
  d. All the dialog's own states from the hold review design apply
     unchanged: loading the sentence, "We couldn't check what this costs the
     customer." with Try again (Cancel order stays disabled), "This order can
     no longer be cancelled.", "This order has changed." with Refresh, a 422,
     no connection.

REMOVED FROM TODAY'S SCREEN
  The inline card with a free-text reason, the placeholder "e.g. Customer
  asked to cancel by phone", and the sentence "The rider and the customer are
  told. A paid order becomes a refund to pay as points."

PHONE (360px)
  The same entry at the bottom of the panel; the dialog full screen with the
  buttons fixed at the bottom, as in the hold review design.

OUTPUT
Show C0 in each status where it appears, the entry absent for Delivered,
Cancelled and Disputed, C1 variants a, b and c, and the panel after a cancel.
Name components as in the handoff so developers can map them to the existing
ones. Do not add a component unless a screen needs one, and say so.
```

## Screen-to-endpoint table (for the designer)

| Screen | Element / action | Endpoint |
| --- | --- | --- |
| C0 | The order, its status and live driver | `GET /admin/orders/{reference}` (`status`, `assignment`, `hold`) |
| C1 | The customer's cost sentence | `GET /admin/orders/{reference}/cancellation-outcome?reason_code=mmirioma_unable` (`message` as written; 409 `invalid_order_transition`) |
| C1 | Cancel order | `POST /admin/orders/{reference}/transition`: `to: cancelled`, `expected_status` (the status the dispatcher saw), `reason_code: mmirioma_unable`, `note` (optional, up to 500) |

## After the preview

1. Check every screen and state exists and the honesty rules hold.
2. Record the result in
   [admin-order-cancellation.md](../admin-order-cancellation.md) for G2.
