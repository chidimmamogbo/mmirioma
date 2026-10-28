# Admin hold review design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#128](https://github.com/chidimmamogbo/mmirioma/issues/128) ·
Requirements: FR-012, FR-034, FR-035, FR-036, FR-038, FR-044, BR-06, BR-12,
BR-13, BR-14, NFR-004, NFR-012, NFR-020, NFR-021, SRS §8 · Acceptance tests:
T-14, T-23 · Prompt:
[prompts/16-admin-hold-review.md](prompts/16-admin-hold-review.md) · Contract
(agreed, G3):
[deliveries.md](../api/deliveries.md#admin-hold-review-endpoints), "Admin
hold review endpoints" (built in #93 and #112; feature doc
[admin-hold-review.md](../features/admin-hold-review.md))
Designer: @Cloudcrackamara + Claude Code (for #128, owner @Cloudcrackamara) ·
Reviewed by: pending · Status: ready for review (G2)

A dispatcher finds orders whose driver's job is on **hold**, reads the
evidence, and decides: approve or reject alternative proof (R1), continue,
fail or cancel after a source review (R2), resume, fail, cancel or withdraw
after an unsafe stop (R3). A hold is not an order status: the order keeps its
status while the hold is open, and the driver cannot take the next step
until a dispatcher decides. The contract and the decisions behind it come
from the upstream repo's approved hold review design (#88; the file did not
come across to the fork, so this design is the fork's own, in the fork's
look, from the agreed contract only). The upstream "R4 reschedule" stays
design ahead and is not designed here.

## Design link

Clickable preview: https://claude.ai/artifact/LWayMHf1wL9B8L4PARkCCd
("MmiriOma Admin Hold Review", version `1793190342-8612`). Four boards, each
with **Tweaks** to switch kind and state; the Orders page, the sheet and the
dialogs link to each other in Play. Every name, phone, reference, litre and
time is SAMPLE DATA. The preview is private until the owner shares it from its
Share menu.

| Board | Covers |
| --- | --- |
| `Main.dc.html` (1280) | R0: the Orders page with the "On hold" pill and count, held rows (status chip, "On hold" chip, kind and age), the panel banner with Review; the history with hold entries (H). Tweaks: list (on hold, all, empty, loading, error); panel (held, decided) |
| `Sheet.dc.html` (1280) | R1, R2, R3: the 720 px review sheet; Tweaks: kind (proof, source, unsafe stop); state (loaded, loading, no hold, error); source eligibility (eligible, not eligible, cannot check); Withdraw job on or off; proof form (approve, reject) |
| `Dialogs.dc.html` (1280) | Approve, reject, continue, resume, withdraw, FAIL and CANCEL; Tweaks: dialog and state (ready, submitting, order changed, own delivery, 422, no connection, security check, source no longer eligible, no driver assigned, loading and failed cancel outcome, cannot cancel), "from a hold" |
| `Phone.dc.html` (360) | The review sheet full screen with the buttons fixed at the bottom; Tweak: kind |

## Screens and states

All build now except where marked. Times are Africa/Lagos.

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| R0 Orders page | "On hold (n)" pill (n from the filter's `total`); held rows keep their status chip, add an amber "On hold" chip and "Proof review / Source review / Unsafe stop · 12 minutes ago"; the hold shows in every pill; panel banner "On hold: <kind>", since, driver, **Review**; no "Assign a rider" on a held order; loading; error (Try again); "On hold" empty ("No orders are on hold.") | Build now |
| Review sheet (shared) | Header (kind, order, status in staff words, driver, since, customer call link); loading; no open hold ("This order has no open hold.", Refresh); error (Try again); "Other reports from the driver" or "No other reports." | Build now |
| R1 Proof review | Evidence (delivered litres, why no code, driver's note, arrived, unloading completed, proof sent, code issued / SMS / attempts / expired and "The code itself is never shown", contact attempts, location text or "No location shared"); decision Approve (how the customer confirmed, when, details, your note) or Reject (your note); confirm dialogs; own delivery (403); order changed; 422 per field | Build now |
| R2 Source review | Evidence (assigned source, used source, reference, litres, time, safety concern with the driver's note); "Can this source be used?" with the server's sentence for eligible, not eligible and cannot check; Continue (only when eligible; note), Fail, Cancel; source no longer eligible; order changed | Build now |
| R3 Unsafe stop | Evidence (kind of report, the driver's note, when, status then); Resume (note = the safe alternative), Fail, Cancel, and Withdraw job only while the driver has not left; no driver assigned; order changed | Build now |
| FAIL dialog | Reason (source quality concern, unsafe access, other + note), optional note, what it does ("No redelivery fee is recorded", driver not notified), "also closes the <kind> hold" when opened from a hold; submitting; order changed; 422 on the note; no connection; security check | Build now (from R2, R3, and from an order that is Driver accepted or later, with no hold: decision 5) |
| CANCEL dialog | Fixed reason "MmiriOma is unable to deliver"; the server's sentence about the customer's cost; note; what it does (driver not notified, no customer message yet: "tell them yourself"); loading the sentence; failed to load (Cancel off); cannot be cancelled; order changed; 422; no connection | Build now (from R2 and R3; the entry from the order detail is #129) |
| H History | "Hold opened: <kind>" (driver, time, note, concern in words); decisions "Proof approved", "Proof rejected", "Source continued", "Delivery resumed after unsafe stop" (dispatcher, time, note); no decision line for a hold closed by fail, cancel or withdraw | Build now |
| Decided card | After a decision, the panel shows who decided, when and the note (from the history entry) | Build now |

## Screen-to-endpoint table

All paths are under `/api/v1`.

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| R0 | Held orders, count | `GET /admin/orders?on_hold=true` ([orders.md](../api/orders.md), [deliveries.md](../api/deliveries.md#hold-object-on-admin-orders-r0)) | `items[]`, `total` (the On hold count) |
| R0 | Chip, banner | `GET /admin/orders`, `GET /admin/orders/{reference}` | `hold` (`id`, `kind`, `since`), `status`, `assignment.driver.name`, `customer.name`, `customer.phone` |
| Sheet | Evidence | `GET /admin/orders/{reference}/hold` | `HoldReview`: `id`, `kind`, `since`, `order_status`, `driver`, `proof`, `pickup`, `source_eligibility`, `report`, `incidents[]`, `withdraw_allowed`; 404 `hold_not_found`, 404 `order_not_found` |
| R1 | Approve | `POST /admin/orders/{reference}/proof-overrides` | `hold_id`, `decision: approve`, `customer_acknowledgment` (`method`, `confirmed_at`, `note`), `note`; 403 `own_delivery_override`; 409 `hold_not_open`, `invalid_order_transition`; 422 |
| R1 | Reject | same | `hold_id`, `decision: reject`, `note`; no `customer_acknowledgment` |
| R2 | Continue | `POST /admin/orders/{reference}/hold/continue` | `hold_id`, `note`; 409 `source_not_eligible` (`message`, `details.answer`), `hold_not_open` |
| R3 | Resume | `POST /admin/orders/{reference}/hold/resume` | `hold_id`, `note` (the safe alternative); 409 `hold_not_open` |
| R3 | Withdraw job | `POST /admin/orders/{reference}/withdraw` ([deliveries.md](../api/deliveries.md#post-adminordersreferencewithdraw)) | `expected_status: accepted`, `note`; shown only when `withdraw_allowed`; 404 `assignment_not_found`; 409 `invalid_order_transition` |
| FAIL | Fail delivery | `POST /admin/orders/{reference}/transition` | `to: failed`, `expected_status`, `reason_code` (`source_quality_concern`, `unsafe_access`, `other`), `note`, `hold_id` (from a hold); 409 `hold_not_open`, `invalid_order_transition`; 422 |
| CANCEL | The customer's cost sentence | `GET /admin/orders/{reference}/cancellation-outcome?reason_code=mmirioma_unable` | `message` (as written), `customer_charge_minor_units`; 409 `invalid_order_transition` |
| CANCEL | Cancel order | `POST /admin/orders/{reference}/transition` | `to: cancelled`, `expected_status`, `reason_code: mmirioma_unable`, `note`, `hold_id` |
| H | History | `GET /admin/orders/{reference}/history?include=holds` | `kind` (`status_change`, `hold_opened`, `hold_decided`), `hold.category`, `hold.decision`, `actor.name`, `note`, `created_at` |
| All | Errors | the calls above | 403 `csrf_failed`, 401, 403 `forbidden`, 404 `order_not_found`, 422 `validation_error` (`loc`) |

No row needs a change to the contract.

## Decisions

Design choices for the reviewer (G2):

1. **One review sheet for R1, R2 and R3.** The same 720 px side sheet
   (full screen at 360) as the confirm sheet in
   [admin-confirm-order.md](admin-confirm-order.md); only the evidence and
   the decision change with the kind, as the contract returns one
   `HoldReview` with the part for its kind.
2. **A hold is shown beside the status, never as one.** The order keeps its
   status chip; an amber "On hold" chip with the kind and age is added, in
   every pill, and the panel gets a banner with **Review**. "On hold" is also
   a pill, with the count from the filter's `total`.
3. **The dispatcher can call the customer from the sheet.** The customer's
   name and phone come from the order the sheet was opened from (staff only,
   NFR-003); R1's approval needs a call or a visit to the customer, so the
   number must be at hand. The review itself adds no customer data.
4. **The delivery code is never shown**, only whether it was issued, whether
   the SMS was accepted, the attempts used and whether it expired. A shared
   location is text only (latitude, longitude, accuracy) and never a map or a
   route (no live tracking).
5. **FAIL and CANCEL are dialogs, designed once.** Opened from R2 and R3 they
   send `hold_id` and say "This also closes the <kind> hold". FAIL also opens
   from an order that is Driver accepted or later **with no hold**, because
   rejecting a proof ends with "fail the delivery (Other, with a note)" and
   nothing else on the page can do it. The CANCEL dialog is the same one
   [#129](https://github.com/chidimmamogbo/mmirioma/issues/129) will reuse
   from the order detail (open question 1).
6. **FAIL offers only the three reasons the contract agrees for these
   screens**: source quality concern, unsafe access, other (note required).
   `customer_unreachable` and `vehicle_failure` exist for the dispatch
   screens and are not offered here.
7. **Approving asks for two things**: how the customer confirmed (with the
   time, and details for "Other") and the dispatcher's own note, because the
   contract requires both. The time cannot be in the future or before
   unloading was completed; the form says so.
8. **Continue is enabled only when the source can be used**, as the server
   answers; the card shows the server's sentence as written, and a refusal at
   the request ("source no longer eligible") updates the card with the new
   answer. When it cannot continue, the sheet says to fail or cancel instead.
9. **CANCEL is off until the server's sentence about the customer's cost has
   loaded** (contract decision 5), so the dialog never states a cost the
   client worked out. The reason is fixed: `mmirioma_unable` is the only one
   agreed.
10. **No false promises about notification.** The dialogs say the driver is
    not notified (their app shows the change when it next loads) and that no
    cancellation message is sent to the customer yet: the dispatcher tells
    them (fallback F10). A fail records no redelivery fee. Payment is never
    changed by a hold decision (BR-12), and the approve dialog says so.
11. **"This order has changed."** with Refresh is the one wording for every
    stale case (409 `hold_not_open`, 409 `invalid_order_transition`, 404 no
    open hold), as the contract asks; nothing typed is lost on a network
    error, and a repeat after a decision that succeeded shows the same line.
12. **Labels in staff words.** Hold kinds: Proof review, Source review,
    Unsafe stop. Order status: the staff labels of
    [orders.md](../api/orders.md) ("Unloading", "Water collected", "Driver
    accepted"). History decisions: Proof approved, Proof rejected, Source
    continued, Delivery resumed after unsafe stop. Concern kinds in the
    history: `alternative_proof` "Alternative proof", `source_mismatch`
    "Another source used", `pickup_safety_concern` "Safety concern at pickup",
    `unsafe_access` "Unsafe access", `unsafe_transfer` "Unsafe transfer". A
    category the app does not know shows no concern line, never a raw code.
13. **Toasts** say what happened and no more: "Proof approved. The order is
    now Delivered.", "Proof rejected. The driver can send a new code.",
    "Continued. The driver can go on to the customer.", "Resumed. The driver
    can continue.", "Delivery marked as failed.", "Order cancelled. Tell the
    customer.", "Job withdrawn. The order is back to Confirmed."

## Open questions

1. **Who owns what between #128 and #129 (for the G2 reviewer).** #129 is the
   order-detail "Cancel this order". This design already needs the CANCEL
   dialog (from R2 and R3) and a FAIL entry on the order. Proposal: #128
   owns FAIL (both entries) and the CANCEL dialog; #129 owns the entry on the
   order detail, drops the mock's reasons and promises, and reuses this
   dialog, so there is one cancel. @Daveoski asked to take #129 on #128; they
   have been told on #128 to check with the owner first.
2. **The approval card cannot show two lines.** After an approval the panel
   can show who approved, when and the note (from the history), but not the
   litres recorded or how the customer confirmed: no agreed endpoint returns
   them (they are stored on the proof; the feature doc lists this as a known
   limitation). Showing them needs a small additive contract change; until
   then the card omits them. Not blocking.
3. **History categories.** The contract gives `hold.category` "for example"
   and no full list; decision 12 labels the five a hold can open with. Please
   confirm that an unknown category showing no concern line is acceptable.

## Changes to the design system

None new. The side sheet, dialogs, notices, chips, key-value rows and the
gold tint are the handoff's and the confirm sheet's. The "On hold" chip is the
existing amber chip with an icon; the hold banner is a card in the gold tint
(`#FFF4D6`, text `#8A5300`) with a button; the driver's note is a quote line
(left border). The preview's stylesheet only restates the tokens of
`frontend/src/styles/theme.css`.

## After approval

Open the link issue for the approved screens (the Done-when item of #128):
the typed calls already exist (`frontend/src/lib/api/adminHolds.ts`,
`holdTypes.ts`), so it is the screens, the "On hold" filter and chip on the
orders list, the history with `include=holds`, and the adapters, with the
mock for `VITE_USE_MOCKS=true`. The status label for an order on hold needs no
new row in `api-mapping.md`: the status is unchanged.
