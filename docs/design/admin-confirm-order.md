# Admin confirm order design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#72](https://github.com/chidimmamogbo/mmirioma/issues/72) ·
Requirements: FR-012, FR-014, FR-022, FR-023, FR-024, FR-027, FR-030,
FR-033 (rows 26 and 7), FR-036, FR-050, BR-02, BR-05, NFR-004, NFR-012,
NFR-020, NFR-021, NFR-022 · Prompt:
[prompts/14-admin-confirm-quoted-order.md](prompts/14-admin-confirm-quoted-order.md)
(PR #132) · Contracts (agreed):
[deliveries.md](../api/deliveries.md#order-confirmation-endpoints) and its
[amendment (#72)](../api/deliveries.md#amendment-72-the-quotes-category-id-and-the-source-kind),
[order-details-and-price.md](../api/order-details-and-price.md) (question 14)
Designer: @Daveoski + Claude Code (for #72, owner @Cloudcrackamara) ·
Reviewed by: @chidimmamogbo on 2026-10-27 · Status: approved (G2)

A dispatcher confirms an order in the admin app. Two kinds share one sheet:
**A, a priced order** (placed with a server price, `awaiting_confirmation`)
and **B, a price request** (no price in the app, `quote_requested`). Only the
price and the category differ: A shows both read-only, B takes a manual
price and a category choice. It reuses the upstream approved confirm sheet
C1 (`admin-order-confirmation.md` in mmiri-oma/mmirioma, #87) in the fork's
design handoff v1 look, and adds the case upstream left as design ahead (C4).

## Design link

Clickable preview: https://claude.ai/artifact/R2SZ3dP6Xa1R4HUnDNH73A
("MmiriOma Admin Confirm Order", version `1793141033-1db6`). Five boards,
each with a Tweaks switch between **Server price** (A) and **Manual price**
(B); Sheet, Dialog and Confirmed also switch state. The Orders page, the
sheet and the phone board are clickable in Play. Every name, phone, source
and amount is SAMPLE DATA.

| Board | Covers |
| --- | --- |
| `Main.dc.html` (1280) | Q0: Orders page, "Awaiting confirmation" pill and chips, the "Confirm this order" panel for A and B; phone not verified |
| `Sheet.dc.html` (1280) | Q1: the 720 px side sheet, eight sections; filled, loading, no sources set up, none usable for the category, no category usable (B), phone not verified, field errors |
| `Dialog.dc.html` (1280) | Q2: confirm dialog and confirming (locked); Q3: refused (checks no longer met), order changed, 422 on a field, security check failed, no connection |
| `Confirmed.dc.html` (1280) | Q4: toast and the confirmed summary with Assign a rider; SMS not sent; source no longer eligible. Q5: history for A and B |
| `Phone.dc.html` (360) | Q0 panel and the full-screen sheet with buttons fixed at the bottom |

## Screens and states

All build now; nothing is design ahead.

| Screen | States designed |
| --- | --- |
| Q0 Orders page | "Awaiting confirmation" for `quote_requested` and `awaiting_confirmation` (table, pill, panel); panel card "Confirm this order": A "Server price", total, category; B "Price request", "No price yet: agree the total on the call."; phone not verified (button disabled, reason shown); no "Assign a rider" before confirmation |
| Q1 Confirm sheet | 1 Order, 2 Checks, 3 Price (A read-only "Server price"; B money field "Manual price"), 4 Category (A read-only; B cards, "No source available" disabled), 5 Source (A Tanker: the customer's kind only, named; B any kind), 6 Window, 7 Agreement (how, when, tick box), 8 Note; loading; no sources set up; none usable; no category usable (B); phone not verified (read-only); field errors (summary plus under each field) |
| Q2 Confirm dialog | Summary with the price chip; B adds "The manual price is then fixed for this order."; confirming (locked) |
| Q3 Errors | 409 checks no longer met (missing items, source list refreshed and choice cleared); 409 order changed (Refresh); 422 under its section; 403 security check (Reload page); no connection (kept; "Trying again won't confirm it twice.") |
| Q4 Confirmed | Toast; summary: category, source, window, "Server price ₦…" or "Manual price ₦…", payment, confirmed by, customer agreement, note; SMS not sent; source no longer eligible; Assign a rider |
| Q5 History | A: "Order placed", then "Confirmed" with the confirmation line. B: "Order placed", "Awaiting confirmation" ("Manual price agreed with the customer"), then "Confirmed" |

## Screen-to-endpoint table

All paths are under `/api/v1`.

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| Q0 | Rows, status, price kind | `GET /admin/orders` ([orders.md](../api/orders.md)) | `status` (`quote_requested`, `awaiting_confirmation` → "Awaiting confirmation"), `quote` (A when set), `quantity_litres`, `service_zone` |
| Q0, Q1 | Order and checks | `GET /admin/orders/{reference}` | `reference`, `quantity_litres`, `delivery_type`, `keke`, `tanker`, `water_source`, `delivery_address`, `service_zone.name`, `landmark`, `customer.name`, `customer.phone`, `customer.phone_verified`, `preferred_delivery_date`, `quote.total_minor_units`, `quote.water_category.label`, `quote.water_category.id` (amendment) |
| Q1 | Categories, sources, reasons | `GET /admin/orders/{reference}/confirmation-options` ([deliveries.md](../api/deliveries.md#objects-1)) | `categories[]` (`id`, `label`, `sources[]`: `id`, `name`, `approximate_location`, `report_reference`, `approved_until`, `is_simulated`, `reasons[]`, `kind` (amendment)) |
| Q2 | Confirm, A | `POST /admin/orders/{reference}/transition` | `to: confirmed`, `expected_status: awaiting_confirmation`, `water_category_id` (= `quote.water_category.id`), `source_id`, `delivery_window`, `customer_agreement` (`method`, `agreed_at`, `disclosures_confirmed`), `note`; no `manual_quote_total_minor_units` |
| Q2 | Confirm, B | same | as A with `expected_status: quote_requested`, the chosen `water_category_id`, and `manual_quote_total_minor_units` |
| Q3 | Errors | same | 409 `transition_requirements_unmet` (`details.missing`: `phone_verified`, `source_eligible`, `delivery_window_set`), 409 `invalid_order_transition`, 422 `validation_error` (`loc`), 403 `csrf_failed`, 404 `order_not_found` |
| Q4 | Confirmed summary, warnings | the `POST` response, then `GET /admin/orders/{reference}` | `water_category`, `source` (current `reasons`), `delivery_window`, `price` (`total_minor_units`, `manual`, `entered_by`, `entered_at`, `customer_agreement`), `confirmation_sms.status` |
| Q5 | History | `GET /admin/orders/{reference}/history` | Row 26 entry (`reason_code` `manual_quote`, B only); row 7 entry with `confirmation` (`water_category_label`, `source_name`, `delivery_window`, `total_minor_units`, `manual`) |

No row needs a change beyond the agreed #72 amendment.

## Decisions

From the review of PR #132 (@chidimmamogbo, 2026-10-27; the amendment agreed
by @nnamdi-security):

1. **The quote's category id** comes from an additive `id` on
   `quote.water_category` of the admin order detail (amendment).
2. **The source's kind** comes from an additive `kind` on each option, so a
   priced Tanker order shows only sources of the customer's kind (amendment).
3. **"Awaiting confirmation"** in admin for `quote_requested` and
   `awaiting_confirmation`; `confirmed` stays "Awaiting rider". The
   `api-mapping.md` change comes with the build.
4. **Both kinds in one sheet**, with upstream C1's wording and rules for a
   price request ("Manual price").

Design choices:

5. **The price chip names how the price was set**, "Server price" or "Manual
   price", on the panel, the sheet, the dialog, the summary and the history
   line, so the dispatcher never reads a server price as one they agreed, or
   the reverse.
6. **History starts with a neutral "Order placed"** for both kinds, because
   a price request also reads "Awaiting confirmation" in admin (decision 3).
7. **A priced Tanker order names the customer's kind** above the sources
   ("Customer chose: Any borehole water"), so a missing source is explained,
   not hidden.
8. **No connection after sending** says trying again cannot confirm twice:
   a repeat of a confirmation that succeeded is 409, never a second snapshot
   or SMS ([deliveries.md](../api/deliveries.md#post-adminordersreferencetransition-confirm)).

## Open questions

None for the design. The build needs the amendment's two fields on the
backend first (additive reads of stored values); until then the sheet cannot
confirm a priced order without guessing.

## Changes to the design system

New in the fork's admin look, built from the handoff tokens only (no new
colours, sizes or fonts): the 720 px side sheet (full screen at 360 px), the
money field (₦ prefix, formatted total under it), category radio cards with
a disabled "No source available" state, and the agreement tick box. They
match upstream's additions from its confirm design.
