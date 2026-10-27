# Privacy tool (deletion, correction, retention review)

Issue: [#129](https://github.com/mmiri-oma/mmirioma/issues/129) (Phase 2,
follows #100) · Requirements: NFR-005, NFR-003, NFR-004 · Pilot condition: G7 ·
Decisions: technical lead, 2026-10-23 (on #129) · Procedure:
[privacy-retention.md](../process/privacy-retention.md)

## 1. Overview and purpose

The privacy notice (`PRIVACY_NOTICE.md`, #100) promises that a verified
deletion request is completed within 14 days and that stored data is
reviewed every month against its retention table (section 8). Customer
records are protected by `ON DELETE RESTRICT` foreign keys and must not be
edited by hand in production, so the technical lead (the privacy contact)
uses this command-line tool. There are no screens and no API endpoints.

Three commands:

- `anonymize-customer`: remove a customer's personal details after a
  verified deletion request (procedure, "Deletion" steps 1-3).
- `correct-name`: correct a customer's account name (procedure,
  "Correction").
- `retention-review`: the database part of the monthly review (procedure,
  "Monthly retention review").

## 2. Feature workflow

```bash
cd backend   # virtualenv active, DATABASE_URL set to production
python -m app.modules.privacy.cli anonymize-customer --by <admin phone> --customer <customer phone>
# read the report (dry run), then:
python -m app.modules.privacy.cli anonymize-customer --by <admin phone> --customer <customer phone> --apply

python -m app.modules.privacy.cli correct-name --by <admin phone> --customer <customer phone> --name "New Name"

python -m app.modules.privacy.cli retention-review --by <admin phone>           # dry run
python -m app.modules.privacy.cli retention-review --by <admin phone> --apply
```

1. `--by` must be an active admin account; it becomes the audit row's actor.
2. `anonymize-customer` and `retention-review` are **dry runs** unless
   `--apply` is given: the same steps run inside a transaction that is then
   rolled back, so the report is exactly what applying would do.
3. Output names the account by id and orders by reference, never by name or
   phone, so it can be copied into the request register.
4. Exit code 0 on success, 1 when refused (unknown admin or customer,
   customer not ready).

## 3. Important files and their responsibilities

| File | Responsibility |
| --- | --- |
| `backend/app/modules/privacy/cli.py` | Arguments, output, exit codes, the manual checklist |
| `backend/app/modules/privacy/service.py` | Orchestrates the steps, refusals, dry run, audit rows, retention periods |
| `backend/app/modules/auth/retention.py` | Account anonymization and phone marker, name correction, phone codes, sessions, never-verified accounts |
| `backend/app/modules/orders/retention.py` | Finished/unfinished orders, order anonymization, orders due after 3 years, disputed orders, note count |
| `backend/app/modules/deliveries/retention.py` | Open holds and reviews, GPS clearing, delivery codes, note count |
| `backend/app/modules/payments/retention.py` | Unsettled cash (refusals), part payments and overpayments (warnings), cash note count |
| `backend/app/modules/customers/retention.py` | Saved addresses deleted with the account (#82) |
| `backend/app/modules/audit/service.py` | `actors_with_rows`: which never-verified accounts audit rows name, so they are anonymized, not deleted (#82) |
| `backend/tests/test_privacy.py` | Arguments, output and helpers (no database) |
| `backend/tests/test_privacy_integration.py` | Every step against a real database |

## 4. Database models and relationships

No tables of its own. The tool changes rows of other modules:

| Table | Anonymize customer | Retention review |
| --- | --- | --- |
| `users` | Name "Deleted customer", phone marker, unknown password, inactive, not verified; row kept | Never-verified customers created over 30 days ago and without orders are deleted; those that audit rows name as the actor are anonymized as in the first column instead (#82) |
| `customer_addresses` | Deleted | Deleted for every never-verified account the review deletes or anonymizes |
| `user_sessions` | Deleted | Ended (expired or revoked) sessions deleted |
| `phone_verifications` | Deleted | `code_hash` blanked on expired codes; rows kept |
| `orders` | Contact name and phone, address replaced; landmark and instructions cleared | Same, for orders finished over 3 years ago |
| `delivery_attempts`, `delivery_proofs` | GPS point and accuracy cleared | GPS over 90 days old cleared, except disputed orders and open holds or reviews |
| `delivery_codes` | Kept | `code_hash` blanked on expired codes; rows kept (proofs point at them) |
| `audit_logs` | `customer_anonymized` (counts, including `addresses_removed`) | `retention_review_applied` (counts, including `unverified_accounts_anonymized`) |

`correct-name` changes `users.name` and writes `account_name_corrected`.
Audit details hold ids and counts only.

## 5. API endpoints and request/response behavior

None.

## 6. Important business rules

- **Finished orders** are `delivered` and `cancelled` only. A `failed`
  order may be rescheduled and a `disputed` one is open: staff cancel a
  failed order that will not be rescheduled before anonymizing (technical
  lead, 2026-10-23).
- **Refusal:** anonymizing is refused, changing nothing, while any of the
  customer's orders is unfinished, has an unresolved hold or admin review,
  or has cash not settled in the app:
  - a cash collection not `reconciled` (with the driver, handed over, or
    received but not reconciled);
  - a `delivered` order still `pending_collection` with no cash recorded.
    A cancelled order also stays `pending_collection`, but no cash is ever
    recorded on it, so it does not block.
- **Warnings, not refusals:** `partially_paid` orders (the balance is
  collected outside the app, F9) and overpaid orders (any refund is outside
  the app, F7) keep those values in the app for good, so refusing would
  block forever. The report prints a `Check:` line for each, with the
  amount, and the privacy contact checks the outside record before
  applying.
- **Cash records are never changed**; they are kept 6 years (notice
  section 8). Cash notes (driver note, correction reason, reconciliation
  note) are counted with the staff notes.
- **The customer row is kept** and deactivated so orders and audit rows
  stay valid (technical lead, 2026-10-23).
- **Phone marker:** `+0` and 14 random digits, unique per account. No E.164
  number starts with `+0`, and sign-in accepts only Nigerian numbers, so it
  can never be typed or receive an SMS. `users.phone` has no check
  constraint, so no migration is needed. Anonymized orders use the fixed
  `+0` and 14 zeros.
- **Code records:** expired phone and delivery codes keep their rows (the
  verification and phone-change record, NFR-004; proofs reference delivery
  codes); only the hash is blanked (technical lead, 2026-10-23).
- **Staff notes are kept** as incident and safety records; the anonymize
  report counts them so the privacy contact can check them for personal
  details (technical lead, 2026-10-23).
- **Never-verified accounts with audit rows are anonymized, not deleted**
  (technical lead, 2026-10-27, #82). A customer who changed their password
  or saved an address is the actor of audit rows, and
  `audit_logs.actor_id` is RESTRICT: deleting the account would lose those
  NFR-004 records and fail the whole review. The account is anonymized and
  deactivated exactly as `anonymize-customer` does, so no personal data
  remains; an already anonymized account is left alone. Saved addresses
  are deleted in both cases (notice section 8: profile data goes with the
  account).
- **Retention periods** (notice section 8): never-verified accounts 30 days,
  GPS 90 days, orders 3 years after their last status change.
- **Idempotent:** every step is selected by time or by "not yet done", so a
  second run changes nothing.

## 7. Authentication and authorization requirements

Run only by someone with production server access (deployment doc); each
command names an active admin account, recorded as the audit actor. The
tool acts on customer accounts only.

## 8. Error handling and edge cases

- Unknown or inactive admin, or a phone that is not a customer's:
  `Error: ...`, exit 1, nothing changed.
- Customer not ready: `Refused: ...` with one line per blocking order
  reference, exit 1, nothing changed.
- Running anonymize again for the same phone fails: the phone no longer
  identifies the account. The account id is in the first run's output and
  audit row.
- A never-verified customer with orders (for example an anonymized one) is
  never deleted by the review.
- A never-verified customer with audit rows is anonymized once; later runs
  count it neither as deleted nor as anonymized.

## 9. Testing instructions

```bash
cd backend
pytest tests/test_privacy.py tests/test_command_models.py
# with the test database (never the dev database; see LOG.md):
TEST_DATABASE_URL=<mmirioma_test URL> pytest tests/test_privacy_integration.py
```

The review acts on the whole database, so the integration tests date their
rows 2017-2021 and run it with `now` in 2021, before any other test row.

## 10. Known limitations

- Balances settled outside the app (F9, F7) are not recorded in the app,
  so the tool can only point at them; the privacy contact checks them.
- Support-line messages, server logs, backups and the request register are
  outside the database; the review prints them as a manual checklist.
- Staff, driver and admin accounts are out of scope.
- `PRIVACY_NOTICE.md` section 8 says a never-verified account "is deleted".
  An account with audit rows is anonymized instead (#82): no personal data
  remains, but the row stays. Whether the notice wording should say so is
  for the privacy contact to decide (NFR-005).
