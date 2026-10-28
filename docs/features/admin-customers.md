# Admin customer directory

Requirements: FR-001, FR-002, FR-003, FR-020, NFR-003, NFR-004, BR-01, BR-07,
BR-09 · Contract:
[admin-directory.md](../api/admin-directory.md#customers), "Customers" (agreed,
G3, 2026-10-28, #43) · Issue: #45 (the customers part; the drivers part
follows) · Related: [customer-account.md](../api/customer-account.md) (the
customer's own saved addresses), [service-zones.md](service-zones.md) (the
zone an address belongs to)

## 1. Overview and purpose

Staff need to find a customer, see their orders and money, and record an
address when a customer phones one in. This feature adds three admin
endpoints under `/api/v1/admin/customers`: the customer list, one customer's
detail, and saving an address on an existing customer. It lets the admin
Customers screen leave its mock (linked in a later issue, lane D).

Staff do **not** create customer accounts (decided 2026-10-26): customers
register themselves, so there is no create endpoint.

## 2. Feature workflow

1. A dispatcher opens the Customers page. The page asks for the list
   (`GET /admin/customers`), newest customers first, with a search box.
2. The search matches a part of the name, or, once 4 or more digits are
   typed, a part of the phone number in `+234…` or `0…` form.
3. Opening a customer asks for the detail (`GET /admin/customers/{id}`):
   the account, the number of orders, the total of the paid orders, the saved
   addresses and the five newest orders.
4. When a customer phones in an address, the dispatcher saves it with
   `POST /admin/customers/{id}/addresses` and the page redraws from the
   customer the call returns.

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app/modules/customers/directory.py` | The queries and the address write: search, paging, counts, detail, the default rule, the audit row |
| `backend/app/modules/customers/admin_directory_router.py` | The three endpoints; translates between HTTP and the service |
| `backend/app/modules/customers/admin_directory_schemas.py` | Query and body validation, and the response objects |
| `backend/app/modules/orders/service.py` | The order figures the directory shows (`count_orders_by_customer`, `count_customers_ordered_since`, `recent_orders_of_customer`, `paid_total_of_customer`); the orders module owns the orders table |
| `backend/app/api/v1/router.py` | Registers the router |
| `backend/tests/test_admin_customers_api.py` | Roles, CSRF, query and body rules, and the bodies against the contract examples (no database) |
| `backend/tests/test_admin_customers_integration.py` | The queries and the address write against a real database |

## 4. Database models and relationships

No new table, column or migration. The feature reads `users` (role
`customer`), `orders`, `order_price_snapshots` (the price frozen at
confirmation, FR-024), `customer_addresses` and `service_zones`, and writes
`customer_addresses` and `audit_logs`. A customer's saved addresses are one
table for both the customer's own `/me/addresses` and the staff write.

## 5. API endpoints and request/response behavior

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/admin/customers` | 200 `AdminCustomerPage` | 401, 403, 422 `validation_error` |
| GET | `/admin/customers/{id}` | 200 `AdminCustomer` | 401, 403, 404 `customer_not_found` |
| POST | `/admin/customers/{id}/addresses` | 201 `AdminCustomer` | 401, 403 (`forbidden`, `csrf_failed`), 404 `customer_not_found`, 404 `service_zone_not_found`, 422 `validation_error` |

- **List:** `q` (optional, trimmed, 1-100 characters), `limit` (1-100,
  default 50) and `offset`. The page has `items`, `total` (the matches),
  `limit`, `offset` and `ordered_last_7_days`.
- **Detail:** the list row plus `paid_total_minor_units`, `addresses` (default
  first, then newest) and `recent_orders` (the 5 newest, any status).
- **Address write:** `label` (1-50), `address` (5-500), optional `landmark`
  (up to 200) and a required `zone_id`; unknown fields are refused. It returns
  the whole customer.

Examples: [admin-customers-page.json](../api/examples/admin-customers-page.json),
[admin-customer.json](../api/examples/admin-customer.json),
[admin-customer-address-request.json](../api/examples/admin-customer-address-request.json).
The API tests check each response body equals its example.

## 6. Important business rules

- **Only customers.** An id that belongs to a driver or an admin is 404
  `customer_not_found`, so a staff page cannot read other roles through this
  directory.
- **`orders_count`** counts every order of the customer, any status,
  including simulated ones. **`ordered_last_7_days`** counts every customer
  (not only the matches of `q`) with at least one **real** order created in
  the last 7 × 24 hours; simulated orders are left out (BR-09).
- **`paid_total_minor_units`** is the sum of the price snapshot totals
  (FR-024) of the orders whose `payment_status` is `paid`, in integer kobo
  (BR-01). Payment is recorded by staff or a provider, never by the
  customer's word (BR-07).
- **Default address.** The first address a customer has becomes the default;
  later ones never change it. Changing the default is the customer's own
  action.
- **Inactive zones are allowed** on a saved address. Ordering checks the zone
  (FR-010); `zone.is_active` is read live.
- **Phone search** matches the stored `+234…` form and the local `0…` form, only
  with 4 or more digits; fewer digits search the name only. `%` and `_` in
  the text are literal.
- **Audit (NFR-004).** Each address write records `customer_address_added`
  with the administrator as the actor and the address as the target; `details`
  holds the customer's id only, never the address text.

## 7. Authentication and authorization requirements

Every endpoint needs a signed-in, active `admin` (`CurrentAdmin`); customers
and drivers get 403 `forbidden` (FR-001), signed-out callers 401
`not_authenticated`. The `POST` also needs the `X-CSRF-Token` header (403
`csrf_failed`). Responses carry phones and addresses, which only staff may see
(NFR-003).

## 8. Error handling and edge cases

- A malformed id in the path, a blank or over-long `q`, a `limit` outside
  1-100, a negative `offset`, or a bad address body is 422 `validation_error`
  and nothing is called or saved.
- An unknown customer is 404 `customer_not_found` before the zone is checked;
  an unknown zone is 404 `service_zone_not_found` and nothing is saved.
- A customer with no orders shows `orders_count: 0`, `paid_total_minor_units:
  0` and an empty `recent_orders`.
- An address write locks the customer's row, as the customer's own address
  writes do, so a staff write and a customer write cannot both decide "the
  first address" at once.

## 9. Testing instructions

```bash
cd backend
.venv/bin/pytest tests/test_admin_customers_api.py            # no database
# With a migrated throwaway database (never the dev one):
TEST_DATABASE_URL=postgresql+asyncpg://... .venv/bin/pytest tests/test_admin_customers_integration.py
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

## 10. Known limitations

- No edit, delete or change-default of an address, and no customer create:
  none is in the contract.
- `points`, `complaints` and `email` from the design's mock have no source
  yet (points #11, support tickets #22, no email column).
- The contract sets no limit on the number of addresses for the staff write,
  so it does not apply the customer's own limit of 20. A customer who has more
  than 20 saved addresses cannot add another themselves until they remove one.
- The phone search is a substring match without an index, which is fine for
  the pilot's customer count; revisit it if the list grows large.
- `paid_total_minor_units` includes a customer's simulated orders if they have
  any (a demo account's orders are all simulated); the contract does not
  exclude them.
