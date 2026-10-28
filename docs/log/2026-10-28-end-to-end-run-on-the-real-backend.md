# 2026-10-28: End-to-end run on the real backend (#23)

- **Area:** process
- **Author:** chidimmamogbo (+ Claude Code)
- **Symptom:** none (a planned run). #23 asks for the linked journey across
  lanes to be run against the real backend, every step's result recorded here,
  and an issue for each failure.
- **Cause:** not applicable.
- **Fix / workaround:** the run below. The priced order went from the
  customer's order to reconciled cash; the only step with no screen is the
  driver's cash record and handover (#20, not built yet), which was done
  through the API so the admin cash steps could be checked.
- **Status:** resolved (run recorded; follow-ups are issues)
- **Refs:** #23, #152; #9, #121, #136, #16, #12, #13, #19, #20, #113; `main`
  at `5334e98`

## Setup

- Local database migrated `0018` to `0022`; demo seed loaded by the owner.
- Two simulated water sources added and activated for Utility Water with the
  sources command-line tool (`docs/process/local-quote-setup.md`, step 2).
- A zone with a ₦3,000 Utility Water fee and a price list (₦500 handling,
  10 % margin) created through the admin API (steps 5 and 6: the Service areas
  and Pricing screens are not linked yet, #110 and #44). Quote check: ₦8,800.
- Backend with `SMS_PROVIDER=mock` (nothing sent; messages read from the log).
  Frontend with `VITE_USE_MOCKS=false`, real Chrome at 1366 px, signed in as the
  demo customer, dispatcher and driver in turn.

## Steps

| # | Step | Result |
| --- | --- | --- |
| 1 | Customer signs in | Pass |
| 2 | Customer orders a Tanker, 750 gal of borehole water, new address in "Demo Independence Layout", saved as Home | Pass. No price on the quantity screen; area picker lists the server's zones and "My area is not listed"; Review shows **₦8,800**, Utility Water, "Price valid until", and the F3/F4/F5 lines; placed MO-W9NW6ZPCZV, "Order received", **Awaiting confirmation** |
| 3 | Dispatcher signs in, opens Orders | Pass. "Awaiting confirmation (5)", "Confirm this order" with "Server price ₦8,800"; no assign panel before confirmation |
| 4 | Dispatcher confirms the priced order | Pass. Price and category read-only; only borehole sources listed (the customer's kind); the sheet refused an unticked disclosure box; dialog summary as designed; Confirmed summary and history ("Order placed", "Confirmed") |
| 5 | Dispatcher assigns Demo Driver | Pass. "Assigned to Demo Driver · Waiting for them to start"; payment chip "Cash to collect" |
| 6 | Driver signs in | Pass. "New order for you · Assigned by admin" |
| 7 | Driver accepts | Pass. Active delivery "Load at Demo Borehole A" |
| 8 | Pickup: arrived at station, loaded 750 gal, valves and receipt | Pass. Moved to the customer step |
| 9 | Arrived, "Unloading done, send the code" | Pass. Waiting state had no Verify button (#133); then keypad and "Code sent to customer" |
| 10 | Driver enters the customer's code | Pass. "3,000 litres (750 gallons) delivered!" |
| 11 | Driver records the cash and hands it over | **Not possible in the app**: the driver app has no cash screen (#20 open). Done through the API as the driver: `POST /driver/jobs/{ref}/cash-collection` (201, ₦8,800 = due) and `POST /driver/cash/handover` (200, awaiting remittance) |
| 12 | Dispatcher opens Cash | Pass. ₦8,800 recorded by drivers, Demo Driver ready to hand over |
| 13 | Dispatcher receives ₦8,800 | Pass. "Counted matches the recorded total"; MO-W9NW6ZPCZV "Paid · Matches the amount due" |
| 14 | Dispatcher reconciles | Pass. ₦8,800 reconciled, ₦0 with drivers, 0 differences |
| 15 | Dispatcher confirms a price request (MO-RM06X5ZVXG) with a manual price | Pass. Both source kinds offered; "Manual price ₦45,000"; history "Order placed", "Awaiting confirmation · Manual price agreed with the customer", "Confirmed" |
| 16 | Customer views the delivered order | **Partial**: "✓ Delivered" and the total show, but the timeline lists only "Order placed" (see findings). Notifications list every step: received, confirmed, driver assigned, on the way, delivered |
| 17 | Customer rates the delivery | Pass. 5 stars and "Yes, no lifting" saved (`rating: 5`, `poured_by_partner: true`); no points shown (#107) |

Customer SMS (mock), in order: confirmation (window, total, cash after
unloading, support number), dispatched, delivery code, cash received; the
second customer got the manual-price confirmation. No server errors (no 5xx).

## Findings

Filed:

- **Before confirmation, the admin order details say "Station: Chosen when a
  rider accepts"**; the dispatcher chooses the source when confirming: #152.
- **No driver cash screen** (step 11): #20 (open).

Not filed (owner's decision, 2026-10-28; recorded here so they are not lost):

- **The customer's order timeline shows only "Order placed"** for a delivered
  order, although the server's notifications have every step (FR-037).
- **The driver dashboard's "Today", "Trips" and "Wallet" tiles stay at "…"** in
  real-API mode, and "Wallet" and "View earnings" open "Earnings is not
  connected to the server yet." (partner pay is out of the MVP, partners.md
  decision 7). The trip screens' static maps also carry sample place names
  ("Ogui", "New Haven") unrelated to the order.
- The admin sidebar still lists "Loyalty points" and "Rider earnings" (out of
  the MVP); #107 hid points in the customer app only.

Other observations:

- After the cash is received the customer still sees "Pay on delivery": the
  customer payment status has no contract yet (`orders.md`, decided
  question 3).
- Small polish: Review shows the receiver's phone as typed ("08000090011");
  SMS amounts read "N8,800.00"; six empty code boxes show while the driver
  waits for the code; the admin header says "Staff", not the name.
- The browser's saved login for the owner's own local account was autofilled
  into the demo sign-in forms; clear the fields before typing.
