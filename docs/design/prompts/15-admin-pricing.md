# Prompt 15: the admin Pricing screen around FR-022 price lists

Issue: [#44](https://github.com/chidimmamogbo/mmirioma/issues/44) ·
Requirements: FR-011, FR-021, FR-022, FR-024, BR-01, BR-09, NFR-004,
NFR-012 · Contract (agreed, G3):
[admin-directory.md](../../api/admin-directory.md#price-lists) ("Price
lists", agreed 2026-10-26, #36; built in #37) and
[order-details-and-price.md](../../api/order-details-and-price.md)
("Pilot note", "How the total is computed") · Build: a link issue after
approval.

**Why this prompt:** the fork's Pricing screen (`a-pricing`,
`frontend/src/features/admin/pages/Pricing.tsx`) is mock-only and edits flat
prices per can and per tank, rider pay, and two delivery-fee switches. FR-022
rules all of that out (decided in #10): the server computes every quote as
water + delivery + handling + margin, and only **price lists** of rules are
admin-configured. Without this design the backend's price lists (#37) can only
be set through the API, as the #23 run had to.

**Before using:** the fork's visual system is the design handoff v1
([handoff-v1.md](../handoff-v1.md)): the admin shell, cards, tables,
the 720 px side sheet from [admin-confirm-order.md](../admin-confirm-order.md),
notices and chips; Plus Jakarta Sans.

```text
Using the MmiriOma admin design already in this project, design the PRICING
screen around FR-022 PRICE LISTS. Desktop first at 1280px; also 360-390px.

CONTEXT
The server prices every order as: water (the source's cost per litre) +
delivery + handling + MmiriOma margin, then rounds the total UP to the next
whole naira. Customers see only the total. Staff set the handling and margin
here, in a PRICE LIST of RULES. Saving makes a new numbered VERSION; versions
are never edited; quotes already given and placed orders keep their price.

A rule applies to: an area (a service zone, or "Every area"), a water
category ("Every water" or one), and a quantity band in litres (from 600 L,
to a number or "no upper limit"). It holds: handling per order (naira),
margin (a percentage of water + delivery + handling, or a fixed naira
amount), and three delivery rates for road distance (base fee, rate per km,
charge for a second trip). An order uses the ONE rule that fits its area,
water and litres; a rule for one area beats "Every area", a rule for one
water beats "Every water". Two rules for the same area and water whose bands
overlap are refused. An order no rule covers goes to staff as a price request.

PILOT FACT (say it plainly): the app cannot measure road distance yet, so
delivery is the AREA'S FEE set on the Service areas screen, and the three
road-distance rates are saved but change no price. Do not hide them; mark
them "not used yet".

HONESTY RULES
- Never show or edit the water cost per litre (set per source by the
  technical lead's command-line tool), points rules, or rider/driver pay
  (out of the MVP).
- No invented prices: every sample name and amount is labelled SAMPLE DATA.
- Keep everything typed after an error (NFR-012).

SCREENS AND STATES
P0 PRICING PAGE: "How a price is made" (water / delivery / handling / margin,
which are set here and which elsewhere); the current version's rules as a
table (area + water, quantity band, handling, margin, Edit, Remove) with
"+ Add a rule"; the road-distance rates in a collapsed "not used yet" part;
a Save card: optional reason (500 characters), "Save as version N+1"
(disabled until something changed); Version history (version, reason, what
changed in words, who, when).
States: loading; not loaded (Try again); no price list yet (every order is a
price request until one is saved; "Add the first rule"); editing (changed
rows marked); saving; saved ("Saved as version N"); someone else saved
meanwhile (reload, nothing saved); nothing changed; two rules overlap (name
the rules); field errors in the rule sheet.
P1 RULE SHEET (720px side sheet; full screen on a phone): 1 Applies to
(area, water), 2 Quantity (from, to or no upper limit), 3 Handling and margin
(percentage or fixed), 4 Delivery rates for road distance (collapsed, not
used yet). Cancel / "Update rule" or "Add rule"; the rule joins the next
version, nothing is saved until "Save as version N+1".
P2 PHONE: the page stacked; rules as cards.

OUTPUT: frames at 1280px and 390px for every screen and state, exact copy,
component names as in the handoff.
```

## Field rules (from the agreed contract)

| Item | Rule | Source |
| --- | --- | --- |
| Load | `GET /admin/price-lists/current`; 404 `price_list_not_found` is the "no price list yet" state; `GET /admin/price-lists` (newest first) for the history | [Price lists, Endpoints](../../api/admin-directory.md#endpoints-3) |
| Save | `POST /admin/price-lists` with `base_version` (the version opened, `null` for the first), optional `reason`, and the **whole** set of rules | [POST /admin/price-lists](../../api/admin-directory.md#post-adminprice-lists) |
| Amounts | Integer kobo, at least 0; margin `{"type":"percentage","basis_points"}` (0-10,000) or `{"type":"fixed","amount_minor_units"}` | [Object](../../api/admin-directory.md#object-1) |
| Band | `min_litres` at least 600; `max_litres` `null` (no upper limit) or at least `min_litres`, inclusive | same |
| Errors | 409 `price_list_changed` (`details.current_version`), 409 `price_list_unchanged`, 422 `price_rules_overlap` (`loc: ["body","rules",i]`, "Overlaps rules[j]"), 422 `validation_error`, 404 `service_zone_not_found` / `water_category_not_found` | same |
| History | `changes[]`: `path`, `from`, `to` per field; the client words them | same |
| Delivery in the pilot | The zone fee replaces the whole delivery cost (base fee, distance, extra trips); a rule adds handling and margin | [order-details-and-price.md](../../api/order-details-and-price.md), "Pilot note" |

## After generating

Record the result in [`docs/design/admin-pricing.md`](../admin-pricing.md)
with the screen-to-endpoint table and the preview link; approval (G2) by one
reviewer who is not the author; then a link issue builds it.
