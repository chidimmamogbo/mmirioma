# Customer delivery window design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#188](https://github.com/chidimmamogbo/mmirioma/issues/188) ·
Requirements: FR-023, FR-037, NFR-012 · Prompt: none (a one-row change on an
existing screen, written from the screens as they are) · Contract (agreed):
[orders.md](../api/orders.md#customer-pilot-changes-99), `OrderRead.delivery_window`
(built in #165, PR #187)
Designer: @Cloudcrackamara + Claude Code · Reviewed by: @nnamdi-security on 2026-10-28 · Status: approved

A customer whose order a dispatcher has confirmed sees the delivery window
that was agreed with them, in the app and not only in the confirmation SMS.

The fork never received the original design that `orders.md` links
(`customer-pilot-status.md`; see the entry in `docs/log/` and #195), so this
record is the design for the window. If the original turns up, compare it to
this one before building.

## Design link

No clickable preview: this adds one row to the existing order detail screen
(`c-order-detail`), in the handoff v1 look. The layout is drawn below.

```
┌────────────────────────────────────┐
│ ‹  MO-7KQ2M9XH4T              ⬇    │
├────────────────────────────────────┤
│  [ hero: quantity, status chips ]  │
│                                    │
│  Timeline                          │
│  ● Order placed · 27 Oct, 8:02 AM  │
│  ● Confirmed · 8:40 AM             │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ Delivery window              │  │   ← new row, first in the card
│  │ Tue, 27 Oct 2026             │  │
│  │ 10:00 AM – 12:00 PM          │  │
│  │ The time agreed with the     │  │
│  │ dispatcher. Not a live       │  │
│  │ arrival time.                │  │
│  │ ──────────────────────────── │  │
│  │ Deliver to     Home · 12 …   │  │
│  │ Payment        Pay on deliv… │  │
│  │ Total               ₦45,000  │  │
│  └──────────────────────────────┘  │
├────────────────────────────────────┤
│ [ Get help ]   [ ⟳ Reorder ]       │
└────────────────────────────────────┘
```

## Screens and states

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| Order detail (`c-order-detail`), details card | **Window agreed:** a "Delivery window" row with the day and the two times, and one line saying what it is. **No window:** nothing in its place, no row and no placeholder (unconfirmed order, an older server, or a finished order). | Build now |
| My orders (`c-orders`), Receipt (`c-receipt`), Home | Unchanged: no window shown | Not designed (see decisions 3 and 4) |

## Screen-to-endpoint table

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| Order detail | "Delivery window" row | `GET /api/v1/orders/{reference}` | `delivery_window.start_at`, `delivery_window.end_at` (UTC, `null` until confirmed) |

No contract change. The window is read; nothing is written.

## Decisions

1. **One place: the order detail.** The customer opens an order to see where
   it stands, and the window belongs with the order's agreed facts (address,
   payment, total). The row is first in the card so that an active order shows
   it without scrolling past the timeline.
2. **Wording is "Delivery window", with the line "The time agreed with the
   dispatcher. Not a live arrival time."** The window is the dispatcher's
   agreed window, not an ETA, and the product has no live tracking
   (FR-037, PRD §9). The word "arrive" is not used for the window. The app
   never says "arriving between".
3. **Shown only while the order is open.** A delivered, cancelled or failed
   order has no use for a window, and the timeline already says what happened.
   The row is hidden for those stages even if the server still sends a window.
   It shows for every other stage with a window, including after the rider is
   assigned and on the way.
4. **Not on the orders list or the receipt.** The list has one line per order
   and the status chip is what a customer scans for. The receipt is for a
   delivered order, where the window no longer matters. Either can be designed
   later if customers ask.
5. **Lagos time, written out.** Times use the existing formatters
   (`lib/format/datetime`, Africa/Lagos): the day as "Tue, 27 Oct 2026" and the
   times as "10:00 AM – 12:00 PM". A window that crosses midnight shows both
   days: "27 Oct, 11:00 PM – 28 Oct, 1:00 AM". An end that is not after its
   start (a bad record) shows nothing rather than a wrong window.
6. **No window, no placeholder.** An unconfirmed order shows no row, no
   "to be confirmed" and no dash. The status chip ("Awaiting confirmation")
   already says why. An older server that sends no `delivery_window` reads the
   same as `null`, and shows nothing.
7. **The preferred date is never shown as the window.** The customer's
   preferred date is a request. Only `delivery_window` is the agreed window.
8. **Mock mode** keeps working. Mock orders have no window except the seeded
   active order, which gets a window so the row can be seen in the demo. It is
   labelled by the screen's existing sample-data tags, with no new tag.
9. **Closed orders hide the window** (answers the open question on closed
   orders, 2026-10-28). A cancelled order's old window could read as a
   promise, and the timeline already says what happened.
10. **No window on the home screen's active-order card for now** (2026-10-28).
    One place to start; it can be added if customers ask.
11. **The in-app line is the design's own, not the SMS wording** (2026-10-28).
    The line needs the extra "Not a live arrival time" sentence that the SMS
    does not carry. Only the day and time format is shared, and it already
    matches the SMS ("confirmed for Tue 27 Oct 2026, 10:00 am to 12:00 pm").

## Open questions

None. Answered at review (@nnamdi-security, 2026-10-28), and moved into
"Decisions" above (9 to 11).

## Changes to the design system

None. The row uses the existing `KeyValue` and caption text. No new component
or token.
