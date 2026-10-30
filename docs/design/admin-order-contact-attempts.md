# Contact attempts on the order panel's timeline design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team workflow". -->

Issue: [#280](https://github.com/mmiri-oma/mmirioma/issues/280) ·
Requirements: FR-038 (P0), FR-030 · Acceptance test: T-25 · Contract
(agreed, G3 on 2026-10-30):
[deliveries.md](../api/deliveries.md), "Amendment (#280): contact attempts on
the admin order detail" · Backend: PR #289 · Related:
[driver-arrival-unreachable.md](driver-arrival-unreachable.md) (#250)
Designer: @Bonvee120 + Claude Code · Reviewed by: @nnamdi-security (technical
lead), 2026-10-30 · Status: approved

When a driver ends a delivery as "Customer not reachable", FR-038 has them
record two timed contact attempts first, and the approved #250 design says the
dispatcher can see the times. The order panel on the Orders page does not show
them: its timeline reads "Arrived", then "Delivery failed · Customer
unreachable", with nothing between. This record adds one kind of line to that
timeline, "Contact attempt 1 · 9:44 AM", one per attempt, from the field the
agreed contract now sends. It changes no other screen and adds no control.

## Design link

No clickable preview and no prompt: the change is one line format in an
existing list, and the brief below specifies every state. The lines are built
from the timeline's existing row (`<b>label</b> · time`), so nothing new is
drawn. A preview can be made from this record if the G2 reviewer asks for one.

## Screens and states

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| Order panel, Timeline (Orders page, `a-orders`) | **A. A delivery that failed after two attempts:** "Order placed", ..., "Arrived · 2:47 PM", **"Contact attempt 1 · 2:47 PM"**, **"Contact attempt 2 · 2:48 PM"**, "Delivery failed · 2:57 PM / Demo Driver · Customer unreachable". **B. Three or more attempts:** one line each, numbered in the order they happened ("Contact attempt 3"); the contract sets no maximum. **C. An order with no attempt** (every order that was never reached, or whose driver did not need them): the timeline is exactly as today. **D. A job in progress** (the driver has arrived and recorded one attempt): the line shows from the panel's next read; the panel does not update by itself. **E. The history did not load:** the timeline stays at "Order placed" as today, and the attempts are not added (decision 4). **F. A cancelled order that had failed first:** the attempts stay in the timeline, before "Delivery failed" and "Cancelled" | Build now (after G2) |
| Phone (360 px) | The same rows; the label and the time wrap together as the other lines do, with no detail line | Build now (after G2) |
| Mock mode (`VITE_USE_MOCKS=true`) | One mock order that failed shows two attempts, so the demo still covers the whole timeline | Build now (after G2) |

## Screen-to-endpoint table

All paths are under `/api/v1`.

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| Order panel | The order and its attempts | `GET /admin/orders/{reference}` ([deliveries.md](../api/deliveries.md), Amendment #280) | `contact_attempts[].attempted_at`, oldest first; `[]` when none; 404 `order_not_found` as before |
| Order panel | The status events the attempts sit between | `GET /admin/orders/{reference}/history` ([deliveries.md](../api/deliveries.md), H1) | `created_at`, `to_status`, the existing entries; unchanged |
| Order panel | The same detail after assign, withdraw, transition and hold calls | The responses of those calls | `contact_attempts`, always present (the client replaces its cached detail with each response) |

No row needs a change to the contract. The attempts come from the detail and the
events from the history, so the screen merges them by time; the history gains no
entry (the amendment explains why).

## Wording to approve

| Where | Wording |
| --- | --- |
| Timeline line | Contact attempt 1 · 9:44 AM |
| Further lines | Contact attempt 2 · 9:49 AM, Contact attempt 3 · ... |
| Detail line under it | None. The contract sends times only, no name, number or note |

The time is shown as the other timeline lines show it (Lagos time, `h:mm AM/PM`).
"Contact attempt" is the wording the technical lead agreed with the contract on
#286.

## Decisions

1. **One line per attempt, no detail line.** The other lines name who did it
   ("Demo Driver · Customer unreachable"). The contract sends no actor for an
   attempt, and the dispatcher already sees the driver on the Arrived and
   Failed lines around it.
2. **Merged by time, status events first on a tie.** An attempt cannot happen
   before the arrival it follows, so when an attempt and a status event share
   the same time, the event comes first and the attempt after.
3. **Numbered by order of time across the whole order.** "Contact attempt 1" is
   the earliest attempt on the order. Today an order has one arrival, so this
   is also the numbering per arrival. When rescheduling exists (deliveries.md,
   row 21, designed ahead), the contract says the items do not say which
   arrival they belong to; grouping would be a later, additive change.
4. **No attempts when the history failed.** The history is a separate read that
   can fail on its own (H1) and the panel then shows the timeline at "Order
   placed" only. A line "Contact attempt 1" hanging under "Order placed", with
   no arrival or ending around it, would mislead, so it is left out too. The
   detail page has no state for a failed history today, and this adds none.
5. **Shown for any order that has attempts, not only failed ones.** An order
   whose driver has arrived and is mid-wait shows what has been recorded so far.
6. **No new control.** Nothing here edits, adds or deletes an attempt. The
   dispatcher reads them; the driver records them (#250).

## Open questions

None.

## Known limitations

- **The times are what the driver reported.** With no arrival location (#250,
  decision 1), the arrival and each attempt are times the driver records by
  tapping. The server stamps them, but a driver could still tap early or late.
  The server enforces two attempts and the full 10 minutes from the recorded
  arrival before a delivery can fail. This record shows the times; it does not
  verify that a call took place.
- **The panel does not update by itself.** An attempt recorded while the
  dispatcher has the panel open appears on the panel's next read, like the rest
  of the order.
- **Rescheduled orders** will put attempts of different arrivals in one list
  until the contract adds a way to tell them apart (decision 3).

## Changes to the design system

None. The line reuses the timeline row.
