# Admin pricing design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team fork workflow". -->

Issue: [#44](https://github.com/chidimmamogbo/mmirioma/issues/44) ·
Requirements: FR-011, FR-021, FR-022, FR-024, BR-01, BR-09, NFR-004,
NFR-012 · Prompt: [prompts/15-admin-pricing.md](prompts/15-admin-pricing.md) ·
Contracts (agreed):
[admin-directory.md](../api/admin-directory.md#price-lists) ("Price lists",
#36, built in #37) and
[order-details-and-price.md](../api/order-details-and-price.md) ("Pilot
note", "How the total is computed")
Designer: @chidimmamogbo + Claude Code (for #44, owner @Cloudcrackamara) ·
Reviewed by: @nnamdi-security on 2026-10-28 · Status: approved

The Pricing screen edits the server's **price list**: rules that set the
handling and margin per area, water category and quantity band (FR-022).
Saving makes a new version; quotes already given and placed orders keep their
price (FR-024). It replaces the mock screen's flat prices per can and per
tank, rider pay and delivery switches, which FR-022 rules out (#10).

## Design link

Clickable preview: https://claude.ai/artifact/1GGd3jXTgfaocy1BgpuXFL
("MmiriOma Admin Pricing", version `1793188036-4cad`). Every name and amount
is SAMPLE DATA.

| Board | Covers |
| --- | --- |
| `Main.dc.html` (1280, interactive) | P0, with **Tweaks › state** for every state: loaded, editing, saving, saved, changed (someone saved meanwhile), unchanged, overlap, loading, empty (no price list yet), error (not loaded) |
| `RuleSheet.dc.html` (1280, interactive) | P1, the side sheet; Tweaks: `mode` (edit or add), `errors` (field errors) |
| `Phone.dc.html` (390) | P2, the page stacked, rules as cards |

## Screens and states

| Screen | States designed | Build now / design ahead |
| --- | --- | --- |
| P0 Pricing page | "How a price is made" (water and delivery set elsewhere, handling and margin here); rules of the current version as a table (area and water, quantity, handling, margin, Edit, Remove) and "+ Add a rule"; road-distance rates collapsed as "saved, not used yet"; Save card (optional reason, "Save as version N+1", disabled until something changed); version history (reason, what changed in words, who, when). States: loading; not loaded ("We couldn't load the prices.", Try again); no price list yet ("Add the first rule"); editing (changed rows marked); saving; saved ("Saved as version 4."); changed meanwhile ("Prices changed since you opened this page.", "Load version 4", nothing saved); nothing changed ("Nothing to save."); overlap (the rules named, the clashing row marked, nothing saved) | Build now |
| P1 Rule sheet | 1 Applies to (area, water), 2 Quantity (from, to, "No upper limit"), 3 Handling and margin (percentage or fixed), 4 Delivery rates for road distance (collapsed, not used yet); add and edit; field errors (summary plus under each field); Cancel, "Add rule" / "Update rule" (into the next version, not saved yet) | Build now |
| P2 Phone | P0 stacked, rules as cards; P1 full screen (the 720 px sheet's phone form, as on the confirm sheet) | Build now |

## Screen-to-endpoint table

All paths are under `/api/v1`.

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| P0 | Rules of the current version | `GET /admin/price-lists/current` ([Price lists](../api/admin-directory.md#price-lists)) | `version`, `rules[]` (`zone_id`, `water_category_id`, `min_litres`, `max_litres`, `handling_minor_units`, `margin`, `base_delivery_fee_minor_units`, `distance_rate_minor_units_per_km`, `additional_trip_minor_units`); 404 `price_list_not_found` = no price list yet |
| P0, P1 | Area names, and the Area picker | `GET /admin/service-zones` ([Service zones](../api/admin-directory.md#service-zones)) | `items[].id`, `name`, `is_active` |
| P0, P1 | Water names, and the Water picker | **Needs contract change** ([decision 8](#decisions)) | category `id`, `label` |
| P0 | Version history | `GET /admin/price-lists` (newest first, `limit`, `offset`) | `version`, `effective_from`, `created_by.name`, `reason`, `changes[]` (`path`, `from`, `to`) |
| P0 | Save as version N+1 | `POST /admin/price-lists` ([POST](../api/admin-directory.md#post-adminprice-lists)) | `base_version` (the version opened; `null` for the first), `reason`, `rules[]` (the whole set) → 201 `PriceList` |
| P0 | Changed meanwhile | same | 409 `price_list_changed`, `details.current_version` → "Load version N" re-reads `current` |
| P0 | Nothing changed | same | 409 `price_list_unchanged` |
| P0 | Overlap | same | 422 `price_rules_overlap`, `details[].loc` `["body","rules",i]` and `msg` "Overlaps rules[j] (…)" → rows i and j named and marked |
| P1 | Field errors | same, and client checks first | 422 `validation_error` `loc` per field; 404 `service_zone_not_found`, `water_category_not_found` (area or water removed meanwhile: "This area is no longer listed. Choose it again.") |

Every row points to an agreed endpoint except the Water picker, marked
"needs contract change" (decision 8).

## Decisions

Design choices for the reviewer (G2):

1. **Only handling and margin lead.** The pilot prices delivery from the
   area's fee (`order-details-and-price.md`, "Pilot note"), so the three
   road-distance rates sit in a collapsed "saved, not used yet" part on the
   page and in the sheet, with that sentence. They are kept, not hidden, so
   the price list matches the contract and nothing is lost when road distance
   arrives.
2. **"How a price is made"** names all four parts and says where water and
   delivery are set (the water sources, Service areas), so staff never look
   for them here. No cost per litre, points or rider pay anywhere on the page.
3. **Rules are edited one at a time in the side sheet** from
   [admin-confirm-order.md](admin-confirm-order.md) (720 px, full screen on a
   phone), and saved together as one version from the page, matching the
   contract's "the whole set of rules". The sheet's button says "Update rule"
   / "Add rule", never "Save", so nobody thinks one rule was saved.
4. **Labels in staff words:** "Area" for zone, "Water" for category, "Every
   area" / "Every water" for `null`, "From" / "To (litres)" and "No upper
   limit" for the band, "Second trip" for the additional-trip charge.
5. **History in words** from `changes[]`: "Handling, every area: ₦400 →
   ₦500"; an added rule reads "Rule added: <area>, <water>, <band>".
6. **Page title "Pricing"**, sub-line "Every save is a new version. Quotes
   already given and placed orders keep their price." The mock's "Pricing,
   points and payouts" title and SAMPLE price banner go.
7. **Margin as a percentage** is typed in percent (up to two decimals) and
   sent as basis points; a fixed margin in whole naira, sent as kobo.
8. **Water picker (answered 2026-10-28, @nnamdi-security, G3 call).** The
   admin API has no list of water categories (checked 2026-10-28): the
   confirm sheet gets categories from one order's `confirmation-options`, and
   `GET /admin/service-zones` names only the categories that have a zone fee
   plus `pilot_water_category` (#145). **Decided: yes**, an additive,
   read-only `GET /admin/water-categories` (`id`, `code`, `label`,
   `is_active`). It still has to be written into
   [admin-directory.md](../api/admin-directory.md) and agreed (G3) before the
   link issue builds the picker. **Written and agreed (G3) in #160, PR #163**
   ([amendment](../api/admin-directory.md#amendment-160-the-list-of-water-categories)):
   `id`, `label` and `is_active`; `code` is left out. Build: #161. Until it is built, the Water picker offers
   "Every water" and the categories the zone list names.
9. **The Money tabs (answered 2026-10-28, @nnamdi-security).** The page sits
   under tabs "Pricing", "Loyalty points" and "Payouts and payments"
   (`MONEY_TABS`); points and partner pay are out of the MVP. **Decided:**
   show **Pricing alone** in the pilot, without the other two tabs (as #107
   hid points for customers). The design already shows the page this way.

## Open questions

None. Both questions raised for the G2 review were answered on 2026-10-28
(decisions 8 and 9).

## Changes to the design system

None new: the side sheet, notices, chips, table and cards exist (the sheet
since [admin-confirm-order.md](admin-confirm-order.md)). The changed-row tint
reuses the gold tint (`#FFF4D6`) and the overlap row the red background
(`#FEE2E2`).
