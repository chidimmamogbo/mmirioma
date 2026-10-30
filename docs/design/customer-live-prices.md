# Customer live prices design

<!-- Workflow: docs/process/ui-driven-development.md. Fork gates: CLAUDE.md,
"Team workflow". -->

Issue: [#79](https://github.com/mmiri-oma/mmirioma/issues/79) ·
Requirements: FR-010, FR-012, FR-014, FR-020, FR-021, FR-022, FR-023,
FR-024, FR-026, FR-027, NFR-002, NFR-012, NFR-020, NFR-021, NFR-022 ·
Prompt: [prompts/13-customer-live-prices.md](prompts/13-customer-live-prices.md)
(approved as a brief in PR #83) · Contracts (agreed):
[order-details-and-price.md](../api/order-details-and-price.md),
[admin-directory.md](../api/admin-directory.md#get-service-zones),
[customer-account.md](../api/customer-account.md#saved-addresses)
Designer: @Daveoski + Claude Code · Reviewed by: @chidimmamogbo on 2026-10-27 · Status: approved

Customers see a real server price before they order. Before Review the app
shows no price and asks for the area (service zone); Review shows the total,
or the reason there is no price in the app, with "Send request" as the way
on. Wording and behaviour follow @chidimmamogbo's answers to the brief's
open questions on #79 (2026-10-27).

## Design link

Clickable preview: https://claude.ai/artifact/ETUqwPQdujh4psAeLhM1ew
(version `1793103271-a331`). Six phone artboards (390 px) in the handoff v1
look; every amount is labelled "Sample". Review (5), Save address (4),
Delivery details (2) and Order placed (6) switch states with their Tweaks
button; the area picker (2) is clickable in Play.

## Screens and states

All build now; nothing is design ahead.

| Screen | States designed |
| --- | --- |
| 1 Keke quantity (`c-keke`), Tanker quantity (`c-tanker`) | No price or total; one line: the price comes on Review, after the address and area |
| 2 Delivery details (`c-details`) | Area picker: list loaded (an area chosen), loading, failed to load (Try again, details kept), empty (only "My area is not listed"); "My area is not listed" with its notice |
| 3 Saved addresses (`c-address-pick`) | Each address with its area; an address in an area no longer served marked "No longer served" (icon and words), still selectable |
| 4 Save address (`c-save`) | With an area: name it and save; area not listed: cannot be saved, "Continue without saving" |
| 5 Review (`c-review`) | Getting the price; price available; price expired (button "Get a new price"); no price in the app, one message per reason and the unknown fallback (button "Send request"); every error when placing (below) |
| 6 Order placed (`c-confirmed`) | Priced order ("Order received", status "Awaiting confirmation", total, water category); request ("Request received", "We're preparing your price.") |

### Review: no price in the app

Button "Send request"; the order goes without a price (a quote request).

| Reason | Message |
| --- | --- |
| `outside_service_zone` | We don't deliver to this area yet. Send your request and our team will call you about it. |
| `category_unavailable` | This water isn't available right now. Send your request and we'll call you. |
| `no_eligible_source` | No water source can take this order today. Send your request and we'll call you with a price. |
| `no_vehicle_plan` | This is more water than one delivery can carry. Send your request and we'll call you to plan it. |
| `delivery_cost_unavailable` | We can't price delivery to this area in the app yet. Send your request and we'll call you with a price. |
| `no_price_rule` | We can't price this order in the app yet. Send your request and we'll call you with a price. |
| any unknown code | We can't show a price for this order in the app. Send your request and we'll call you with a price. |

### Review: errors when placing

Everything typed is kept.

| Error | Message | Then |
| --- | --- | --- |
| 409 `quote_expired` | Your price has expired. Here's the new price: check it and place your order again. | The new price is fetched straight away and shown |
| 422 `quote_mismatch` | Your order changed after we priced it. Here's the updated price. | The updated price is shown |
| 409 `no_eligible_source` | The water for this order isn't available any more. Send your request and we'll call you. | Button "Send request" |
| 404 `service_zone_not_found` | This area isn't on our list any more. Choose your area again. | Button "Choose your area" |
| 429 `too_many_attempts` | Too many price checks. Wait N minutes, then try again. | Button disabled until the wait is over |
| 403 `phone_not_verified` | The existing "Verify your phone number first" banner and disabled buttons (design E3, unchanged) | |
| network | We couldn't reach MmiriOma. Check your connection and try again. Trying again won't place a second order. | Retry reuses the idempotency key (FR-026); never "Nothing was ordered" |

## Screen-to-endpoint table

| Screen | Element / action | Endpoint | Fields used |
| --- | --- | --- | --- |
| 2 Delivery details | Area list | `GET /service-zones` ([admin-directory.md](../api/admin-directory.md#get-service-zones)) | `items[].id`, `items[].name` |
| 3 Saved addresses | List, area, "No longer served" | `GET /me/addresses` ([customer-account.md](../api/customer-account.md#saved-addresses)) | `label`, `address`, `zone.name`, `zone.is_active`, `is_default` |
| 4 Save address | Save | `POST /me/addresses` | `label`, `address`, `landmark`, `zone_id` (required), `make_default`; 404 `service_zone_not_found`, 409 `address_limit_reached` |
| 5 Review | Price | `POST /quotes` ([order-details-and-price.md](../api/order-details-and-price.md#post-quotes)) | Request: delivery details, `delivery_address`, `service_zone_id`. Response: `status`, `quote_id`, `quantity_litres`, `water_category.label`, `water_category.supported_uses`, `total_minor_units`, `price_valid_until`, `reason`; 429 `too_many_attempts` |
| 5 Review | Place order / Send request | `POST /orders` ([order-details-and-price.md](../api/order-details-and-price.md#post-orders-changes)) | Same details and zone, `quote_id` (none for a request), `idempotency_key`; 409 `quote_expired`, 422 `quote_mismatch`, 409 `no_eligible_source`, 404 `service_zone_not_found`, 403 `phone_not_verified` |
| 6 Order placed | Summary | The `POST /orders` response, `OrderRead` | `reference`, `status`, `quantity_litres`, `quote.total_minor_units`, `quote.water_category.label` |

No row needs a contract change.

## Decisions

1. **Customer wording** for every reason and error: the tables above
   (@chidimmamogbo, #79, question 1).
2. **A saved address in an area no longer served** is marked "No longer
   served" (icon and words, never colour alone) and stays selectable;
   choosing it shows the `outside_service_zone` message at Review with "Send
   request" (question 2).
3. **Stage labels:** a priced order shows "Awaiting confirmation" (the agreed
   label in `orders.md`, FR-027); a quote request shows "Request received"
   with "We're preparing your price.", not "Waiting for rider". The matching
   `api-mapping.md` change goes in the link issue (question 3).
4. **Price expiry:** a new price only on the "Get a new price" button, no
   automatic refresh; each check counts toward the limit of 30 per 10
   minutes. Exception: after 409 `quote_expired` on placing, the new price is
   fetched straight away (question 4).
5. **No supported-uses text:** the category label alone, with no placeholder
   and no invented uses (FR-014, question 5).
6. **No price before the address** (#42): the quantity screens show quantity
   only.
7. **Total only:** never a water, delivery, handling or margin line
   (order-details-and-price.md, decision 6).

**Approved (G2)** by @chidimmamogbo on 2026-10-27, at preview version
`1793103271-a331`, including the three lines below.

## Wording decided at review

Wording the brief's questions did not cover, drafted in the preview and kept
as written (@chidimmamogbo, 2026-10-27):

1. Keke and Tanker screens: "You'll see your price on the review screen, after
   you add the delivery address and your area."
2. "My area is not listed" notice: "We can't price this address in the app.
   You can still send a request, and our team will call you with a price."
3. Save address with no area: "This address can't be saved yet, because it is
   outside the areas we serve. Your order still goes through as a request."

## Changes to the design system

None. The "No longer served" chip reuses the amber chip with an icon.
