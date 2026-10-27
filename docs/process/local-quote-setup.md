# Set up local data for quotes

How to give a local backend what `POST /quotes` needs (water sources, vehicles,
a service zone and a price list), so you can try quotes and ordering with a
quote (#21) against the real API. Everything here is **demo data** on your own
machine; never run it against a shared or pilot database.

The admin Service areas and Pricing screens are not linked to the backend
yet (#44), so zones and price lists are created through the API with `curl`.
Sources and vehicles use the command-line tools (pilot fallback F1).

**Before you start:** the database is running and up to date
(`alembic upgrade head`), and the demo seed is loaded
(`python -m app.modules.demo.seed`, which prompts for the demo password).
Run every command from `backend/` in Git Bash. `<admin phone>` is the demo
admin's phone from `DEMO_ACCOUNTS` in `backend/app/modules/demo/seed.py`.

If commands stall or fail with `WinError 1225` / connection refused, use
`127.0.0.1` instead of `localhost` in `DATABASE_URL` (see `docs/log/`), and
check that `docker ps` shows `127.0.0.1:5432->5432/tcp` for the MmiriOma
container: another project's database on port 5432 stops it from publishing
the port.

## 0. Start the backend

```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --reload    # http://localhost:8000
```

Leave it running and use a second terminal.

## 1. Get the Utility Water category id

The pilot prices Utility Water only (`PILOT_WATER_CATEGORY`, default
`utility`). The zone fee needs its id:

```bash
docker compose exec -T postgres psql -U <db user> -d mmirioma -tAc \
  "select id from water_categories where code = 'utility';"
```

`<db user>` is the user in your `DATABASE_URL`. Keep the result as
`CATEGORY_ID`.

## 2. Add water sources and activate them for Utility

A Tanker customer picks Ninth Mile or borehole (`water_source`), so add one
of each kind:

```bash
.venv/Scripts/python.exe -m app.modules.sources.cli add-source --by <admin phone> \
  --name "Demo Borehole A" --location "Demo area, Enugu" --kind borehole --simulated
.venv/Scripts/python.exe -m app.modules.sources.cli add-source --by <admin phone> \
  --name "Demo Ninth Mile A" --location "Demo area, Ninth Mile" --kind ninth_mile --simulated
.venv/Scripts/python.exe -m app.modules.sources.cli list-sources      # copy both source ids
```

Only an activated source can price a quote (FR-012). The cost per litre is in
kobo:

```bash
.venv/Scripts/python.exe -m app.modules.sources.cli activate --by <admin phone> \
  --source <borehole id> --category utility --report DEMO-LR-0001 \
  --approved-until 2027-01-31 --cost-per-litre-kobo 150
.venv/Scripts/python.exe -m app.modules.sources.cli activate --by <admin phone> \
  --source <ninth mile id> --category utility --report DEMO-LR-0002 \
  --approved-until 2027-01-31 --cost-per-litre-kobo 200
```

A source added before #21 has no kind and never matches a Tanker preference;
give it one with `set-kind --by <admin phone> --source <id> --kind borehole` (or `ninth_mile`).

## 3. Add vehicles

A quote needs a vehicle that carries the order in at most two trips (FR-013),
otherwise it answers `no_vehicle_plan`:

```bash
.venv/Scripts/python.exe -m app.modules.dispatch.cli add-vehicle --type "Demo tricycle, 1,000 L tank" --payload-litres 1000
.venv/Scripts/python.exe -m app.modules.dispatch.cli add-vehicle --type "Demo tanker truck" --payload-litres 12000
```

## 4. Sign in as the demo admin

```bash
API=http://localhost:8000/api/v1
curl -s -c admin.txt -H 'Content-Type: application/json' \
  -d '{"phone":"<admin phone>","password":"<demo password>"}' $API/auth/login
```

Copy `csrf_token` from the answer into `CSRF`. `admin.txt` holds the session
cookie; delete it when you are done.

## 5. Create a service zone with a delivery fee

```bash
curl -s -b admin.txt -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Demo Independence Layout","is_active":true,
       "centre":{"latitude":6.4447,"longitude":7.5108},"boundary":null,
       "fallback_delivery_fees":[{"water_category_id":"'$CATEGORY_ID'","fee_minor_units":300000}]}' \
  $API/admin/service-zones
```

That is a ₦3,000 delivery fee per order for Utility Water
(`docs/api/admin-directory.md`, "Service zones"). Keep the zone `id` from the
answer as `ZONE_ID`.

## 6. Save a price list

One rule for every zone, every category and every quantity from 600 L.
`base_version` is `null` for the first list:

```bash
curl -s -b admin.txt -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"base_version":null,"reason":"Demo prices",
       "rules":[{"zone_id":null,"water_category_id":null,"min_litres":600,"max_litres":null,
                 "base_delivery_fee_minor_units":0,"distance_rate_minor_units_per_km":0,
                 "additional_trip_minor_units":0,"handling_minor_units":50000,
                 "margin":{"type":"percentage","basis_points":1000}}]}' \
  $API/admin/price-lists
```

That is ₦500 handling per order and a 10 % margin. The delivery amounts are 0
because, until a road-distance service exists, the zone fee is the whole
delivery cost (`docs/api/order-details-and-price.md`, "How the total is
computed").

## 7. Check it works

Sign in as a demo customer the same way as step 4 (save the cookie as
`customer.txt` and take its `csrf_token`), then:

```bash
curl -s $API/service-zones                      # your zone; no sign-in needed
curl -s -b customer.txt -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"delivery_type":"tanker","tanker":{"tank_type":"ground","quantity_local_gallons":750},
       "water_source":"borehole","delivery_address":"12 Demo Close, Independence Layout, Enugu",
       "service_zone_id":"'$ZONE_ID'"}' \
  $API/quotes
```

Expect `"status": "quote_available"`. For 750 gallons (3,000 L) of borehole
water: water ₦4,500 + delivery ₦3,000 + handling ₦500 = ₦8,000, plus 10 % =
**₦8,800** (`total_minor_units` 880000). If the answer is
`manual_quote_required`, its `reason` names the missing piece:

| `reason` | Missing piece |
| --- | --- |
| `category_unavailable`, `no_eligible_source` | Step 2 (activated source of the chosen kind) |
| `no_vehicle_plan` | Step 3 |
| `outside_service_zone` | Step 5, or `service_zone_id` not sent |
| `delivery_cost_unavailable` | Step 5's fee for Utility Water |
| `no_price_rule` | Step 6 |

## Clean up

Delete `admin.txt` and `customer.txt`. To start again from nothing, drop the
local database volume (`docker compose down -v`), then run `alembic upgrade
head` and the demo seed again.
