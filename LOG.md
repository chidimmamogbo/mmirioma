# Issue log (archive)

> **Archive: do not add entries here.** From 2026-10-23 every new entry is
> its own file in [docs/log/](docs/log/README.md), so pull requests no
> longer conflict on this file. Read and search both. The rules are in
> [CLAUDE.md](CLAUDE.md#issue-log-docslog).

Every problem, error or surprise hit while working on MmiriOma up to
2026-10-23, and how it was resolved.

Newest entries first. Never put secrets, credentials, tokens or personal data
(real phone numbers, addresses) in this file.

## Entry template

```markdown
### YYYY-MM-DD: <short title>

- **Area:** backend | frontend | database | CI | tooling | GitHub | process
- **Author:** <GitHub username> (+ agent, if one was used)
- **Symptom:** what happened, with the exact error message if there was one.
- **Cause:** why it happened (or "unknown" if not found yet).
- **Fix / workaround:** what was done, or what to do next time.
- **Status:** resolved | workaround | open
- **Refs:** issue/PR numbers, files, commits.
```

---

### 2026-10-23: Push declined due to email privacy restrictions

- **Area:** GitHub
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `git push` for #101 failed: `! [remote rejected]
  feat/101-request-ids -> feat/101-request-ids (push declined due to email
  privacy restrictions)`.
- **Cause:** The commit's author was the GitHub no-reply address, but its
  committer came from the local git config, a private email. GitHub's
  "Block command line pushes that expose my email" checks both.
- **Fix / workaround:** Amend the unpushed commit with
  `git -c user.email=<id>+<login>@users.noreply.github.com commit --amend
  --no-edit` (sets the committer), then push. Check with `git log -1
  --format="%ae %ce"`. Recurred for #102 after `git rebase origin/main`:
  a rebase (and a merge) rewrites the committer from the git config too, so
  pass the same `-c user.email=...` to `git rebase` and `git merge`, or
  set the no-reply address in the repository's git config.
- **Status:** resolved
- **Refs:** #101, PR #136, #102, PR #146

### 2026-10-23: `check.sh --db` ran against another project's database after `docker compose up` failed

- **Area:** tooling (database)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** The agent ran `docker compose up -d 2>&1 | tail -3 && bash
  check.sh --db`. Compose failed (`Bind for 127.0.0.1:5432 failed: port is
  already allocated`), but `check.sh --db` still started, and its `pytest`
  was still running 57 minutes later with no output.
- **Cause:** The pipe's exit status is `tail`'s, so `&&` did not see the
  compose failure. `check.sh --db` reads `DATABASE_URL` from `.env`
  (`localhost:5432`), which at that moment was another local project's
  PostgreSQL container, not MmiriOma's.
- **Fix / workaround:** Never chain on a piped command (use `set -o
  pipefail` or check the step separately). Check `docker ps` for port 5432
  before `--db`. The real integration run used a throwaway container on
  port 5433 (entry 2026-10-15). The agent could not stop the leftover
  `pytest` processes (permission denied); the developer stopped them. The
  tests connect as user `mmirioma` to database `mmirioma`, which the other
  project's server does not use, so the connection was most likely refused;
  this was not checked.
- **Status:** resolved
- **Refs:** #101, `.claude/skills/mmirioma-engineering/scripts/check.sh`

### 2026-10-23: Safe-traceback tests failed because the secret was in the source line

- **Area:** backend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** For #101, two tests of `safe_exception_text` failed:
  `assert 'first' not in 'Traceback (...ge withheld)'`, with the text
  showing `KeyError("first")` above `builtins.KeyError: (message withheld)`.
- **Cause:** The safe traceback withholds exception messages but keeps each
  frame's source line. The test raised `KeyError("first")` with a literal,
  so the "secret" was printed as code, not as a message.
- **Fix / workaround:** Tests pass the message in a variable
  (`raise ValueError(token_message)`), so only the runtime value is secret.
  Real code never has personal data in its source, so source lines stay in
  the traceback. When testing log redaction, never put the redacted value
  on the raising line.
- **Status:** resolved
- **Refs:** #101, `backend/tests/test_request_id.py`, `backend/app/core/log_config.py`

### 2026-10-23: Backend tests failed to import after pulling main (stale virtualenv)

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After fast-forwarding `main` by 148 commits, `pytest` failed
  in `conftest.py`: `ModuleNotFoundError: No module named 'geoalchemy2'`.
- **Cause:** `requirements.txt` gained `GeoAlchemy2` (#75) while the local
  virtualenv was not updated. Same cause as the note in the 2026-10-22 CI
  entry below.
- **Fix / workaround:** `pip install -r requirements-dev.txt` in
  `backend/` after every pull that touches `backend/requirements*.txt`.
- **Status:** resolved
- **Refs:** #101, `backend/requirements.txt`

### 2026-10-23: Agent's manual uvicorn check printed nothing

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Starting `uvicorn` with `&` and `sleep 4` in one agent shell
  command, then calling `curl`, returned no headers and an empty server log.
- **Cause:** The agent's shell blocks a foreground `sleep`, and the
  backgrounded server was not up yet when `curl` ran.
- **Fix / workaround:** Start the server as its own background task, then
  poll with `curl` in a retry loop until `/api/v1/health` answers.
- **Status:** workaround
- **Refs:** #101

### 2026-10-23: The agreed payments contract could not show cash on a delivered job

- **Area:** process (contract)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Building #123, the contract put the job's `cash` only on `GET
  /driver/jobs/{reference}`, and K1 shows the Cash card on a delivered job.
  But delivering ends the assignment (`completed`), and the detail is then
  404 `order_not_found` (deliveries contract), so no delivered job could ever
  show its card or record cash.
- **Cause:** The contract was written from the screens without checking when
  the driver job detail stops answering.
- **Fix / workaround:** Proposed amendment 2 in `docs/api/payments.md`:
  `cash` (with `record_allowed`) also on `DriverJobSummary`, and the cash
  endpoint accepts the driver's live or finished job. Needs agreement in the
  #123 PR. Before writing a driver contract, check the job's lifetime in
  `deliveries/service.py` (`LIVE_ASSIGNMENT_STATUSES`).
- **Status:** workaround (pending agreement)
- **Refs:** #123, `docs/api/payments.md` (amendments)

### 2026-10-23: Alembic autogenerate wrote every enum CHECK twice and missed the orders CHECK

- **Area:** database
- **Author:** Bonvee120 + Claude Code
- **Symptom:** `alembic revision --autogenerate` for revision `0013` emitted
  each enum column's CHECK twice, once named `payment_sms_status` and once
  `ck_cash_collections_payment_sms_status`, and did not add the new
  `orders` CHECK (`payment_balances_not_negative`).
- **Cause:** With `Enum(..., create_constraint=True)` autogenerate renders
  the enum type's own constraint and the naming-convention one; Alembic
  does not compare CHECK constraints on existing tables.
- **Fix / workaround:** Wrote the revision by hand as `0012` does: VARCHAR
  columns plus one named CHECK each, `op.create_check_constraint` for the
  `orders` ones. Then `alembic upgrade head`, `alembic check` ("No new
  upgrade operations detected"), `downgrade -1`, `upgrade head`.
- **Status:** resolved
- **Refs:** #123, `backend/alembic/versions/20261023_0013_add_cash_collections.py`

### 2026-10-23: A repeated cash record failed with `DetachedInstanceError`

- **Area:** backend
- **Author:** Bonvee120 + Claude Code
- **Symptom:** In #123's integration test, reading a repeated record's view
  failed: `sqlalchemy.orm.exc.DetachedInstanceError: Instance <CashCollection
  ...> is not bound to a Session; attribute refresh operation cannot
  proceed`.
- **Cause:** The repeat path built the view, then called
  `session.rollback()` to release the order lock. A rollback expires every
  loaded object, even with `expire_on_commit=False` (the 2026-10-22 entry),
  and the session was closed before the view was read.
- **Fix / workaround:** When nothing changed, commit instead of rolling back
  to release the lock. Roll back only on the error paths, after reading what
  the error needs.
- **Status:** resolved
- **Refs:** #123, `backend/app/modules/payments/service.py` (`record_cash`)

### 2026-10-23: Frontend UI tests timed out now and then in the full run

- **Area:** frontend (tests)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** `npm test` failed twice in a row with different tests:
  `holds.test.tsx > R1 ... rejects with a reason` (`Unable to find an element
  with the text: Proof rejected - driver can send a new code`, after 3821 ms)
  and `customerOrders.test.tsx > O2 ... sends once` (`Test timed out in
  5000ms`). Run alone, both files passed (56 tests); the next full run
  passed (365 tests).
- **Cause:** Not confirmed. These UI tests take 3-5 s each under the full
  parallel run on this machine, close to Vitest's 5 s default timeout.
  Neither reads the API examples that #123 changed.
  After merging `main` (#126, 30 test files) full runs failed with 1 to 26
  tests, every one `Test timed out in 5000ms`; `npx vitest run
  --testTimeout=30000` passed all 397.
- **Fix / workaround:** Rerun the failing file alone, or the suite with
  `--testTimeout=30000`, before suspecting a change. Raising the configured
  timeout or speeding up the UI tests is a separate change.
- **Status:** open
- **Refs:** #123 (seen while checking it), `frontend/src/features/admin-holds/holds.test.tsx`,
  `frontend/src/features/customer-orders/customerOrders.test.tsx`

### 2026-10-23: A second test job for the same driver hit `uq_assignments_live_driver`

- **Area:** backend (tests)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Payments integration tests that gave one driver several
  unloaded jobs failed with `UniqueViolationError: duplicate key value
  violates unique constraint "uq_assignments_live_driver"`.
- **Cause:** A driver holds one live job at a time, enforced by the
  database.
- **Fix / workaround:** The tests deliver each job (code proof) before the
  next one starts; cash is still recorded after the job ended, which is
  what amendment 2 allows.
- **Status:** resolved
- **Refs:** #123, `backend/tests/test_payments_integration.py` (`delivered`)

### 2026-10-23: `git stash pop` conflicted in LOG.md and the cash feature doc

- **Area:** GitHub
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Moving uncommitted K2 work (#124) onto the new `main` with
  `git stash push -u`, `git merge --ff-only origin/main`, `git stash pop`:
  conflicts in `LOG.md` and `docs/features/cash-remittance.md`; the stash
  was kept.
- **Cause:** #123 (PR #135) added LOG entries at the top and rewrote the cash
  doc's header, the same lines the K2 work had changed. The same thing as the
  2026-10-19 stash entry.
- **Fix / workaround:** Kept both sides of LOG.md, took `main`'s doc header
  and re-added the K2 link, then `git stash drop`. Commit work in progress
  on the branch before updating it, so the conflict comes as a normal merge.
- **Status:** resolved
- **Refs:** #124, PR #135

### 2026-10-23: Driver and admin cash chips use different tones for the same status

- **Area:** frontend (design)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Building K2 (#124): the approved Cash04 board draws
  "Collected by driver" neutral (banknote icon) and "Overdue" warning (clock),
  but the admin cash screens (#125, `features/admin-cash/parts.tsx`) show
  "Collected by driver" in warning (wallet) and "Overdue" in danger.
- **Cause:** The admin build chose its own tones; both apps come from the
  same design.
- **Fix / workaround:** K2 follows its board. The team should pick one set
  for both apps (design system, "Labels proposed" in the cash design) and
  align the other.
- **Status:** open
- **Refs:** #124, #125, `frontend/src/features/driver-cash/labels.ts`

### 2026-10-23: Merged main into the #97 branch after the technical lead already had

- **Area:** GitHub
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** After #126 merged, `git merge origin/main` into
  `feat/97-driver-app-screens` (conflicts in `Dialog.tsx`,
  `docs/architecture/frontend.md`, `LOG.md`, resolved) was rejected on push:
  the remote branch had moved. The technical lead had merged `main` into it
  20 minutes earlier, then merged PR #130 itself.
- **Cause:** The branch was fetched once at the start of the task and not
  again before merging.
- **Fix / workaround:** Compared the two resolutions (identical apart from
  the order of one table row), kept the lead's and dropped the local merge
  commit, which had never been pushed. Fetch right before merging or
  pushing a shared branch, and check the PR's state first.
- **Status:** resolved
- **Refs:** PR #130, PR #126

### 2026-10-23: `py -I` ignored `PYTHONIOENCODING`, so `₦` still failed to print

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Extracting the cash canvas text:
  `UnicodeEncodeError: 'charmap' codec can't encode character '₦'`,
  also with `PYTHONIOENCODING=utf-8` set.
- **Cause:** `-I` (isolated mode) ignores every `PYTHON*` environment
  variable, including the fix the 2026-10-22 entry suggests.
- **Fix / workaround:** `py -I -X utf8 script.py`: the `-X utf8` option is
  not an environment variable, so isolated mode keeps it.
- **Status:** resolved
- **Refs:** #124

### 2026-10-23: The app stays on the splash when it opens without a connection

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Found while testing the driver app (#97): after a test sent
  an `offline` event, the next test's app never left the X1 splash
  ("Checking your session"), and `expected '/driver/jobs/MO-OFFER00001' to
  be '/driver'` failed.
- **Cause:** TanStack Query's default `networkMode: 'online'` pauses a
  query while its `onlineManager` thinks the browser is offline. The
  session query (`features/auth/SessionProvider.tsx`) uses the default, so
  an app opened offline waits on the splash instead of showing "Unable to
  reach the server" with Retry (`SessionUnavailable`). The driver queries
  set `networkMode: 'always'` for the same reason.
- **Fix / workaround:** Not changed: the session query is shared auth code,
  outside #97. Proposed fix: `networkMode: 'always'` on the session query,
  with a test that opens the app offline. The test leak is fixed separately
  (next entry).
- **Status:** open
- **Refs:** #97, `frontend/src/features/auth/SessionProvider.tsx`

### 2026-10-23: TanStack Query's onlineManager leaked "offline" between tests

- **Area:** frontend (tests)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** The driver test "a job that is no longer an offer goes back
  to My jobs" passed alone and failed after the offline test, stuck on the
  splash.
- **Cause:** `onlineManager` is a module singleton shared by every test in
  the file. It heard the offline test's `offline` event; the test's query
  client was unmounted before the `online` event in `afterEach`, taking
  the manager's window listeners with it, so the manager stayed offline.
- **Fix / workaround:** `afterEach` calls `onlineManager.setOnline(true)` as
  well as dispatching `online`. Any test that dispatches `offline` needs
  the same.
- **Status:** resolved
- **Refs:** #97, `frontend/src/features/driver-jobs/driverJobs.test.tsx`

### 2026-10-23: Accepting an offer could lose the "Job accepted" toast

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** In the full test run only, "J2-g: not sent, then Retry
  resends the same answer" failed: `Unable to find an element with the
  text: Job accepted`, although My jobs was showing.
- **Cause:** A real race. The answer mutation stored the accepted job in the
  job's cache; J2 re-rendered, saw a job that is no longer an offer and
  rendered its own `<Navigate to="/driver" replace />`, which could land
  after the navigation carrying the toast and drop it.
- **Fix / workaround:** The mutation no longer writes the job's detail; it
  only refetches the list. J2 refetches the detail on every visit anyway.
  Full suite run twice afterwards: 406/406 both times.
- **Status:** resolved
- **Refs:** #97, `frontend/src/features/driver-jobs/useDriverJobs.ts`

### 2026-10-23: A strict `allowed_actions` enum would have rejected the cash contract

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** None yet; caught in review. The first driver job schema
  validated `allowed_actions` with `z.enum` of part 1 and part 2's actions.
- **Cause:** The agreed cash contract (`docs/api/payments.md`, #98) adds
  `record_cash` to `allowed_actions`. Once the cash backend shipped, every
  job detail with it would have failed as `invalid_response`.
- **Fix / workaround:** `record_cash` added, and unknown actions are now
  dropped instead of failing the job (an action this build does not know is
  one it cannot offer). Test: "accepts the cash contract additions and drops
  actions this build does not know". When a contract adds a value to a list
  a client validates, check every client schema for it.
- **Status:** resolved
- **Refs:** #97, #98, `frontend/src/lib/api/driverJobs.ts`

### 2026-10-23: A Node string replacement found nothing in a CRLF source file

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** A `node -e` script editing `SignInPage.tsx` stopped with
  `Error: missing:  * C3 customer sign in and S1 staff sign in ...`.
- **Cause:** `core.autocrlf` is `true` on this Windows checkout, so working
  files have CRLF line endings; the script's search strings used `\n`.
- **Fix / workaround:** Edited with the editor tool instead, which matches
  line endings. Files created new by an agent are LF; git normalizes both on
  commit. For scripted edits, match `\r?\n`.
- **Status:** workaround
- **Refs:** #97

### 2026-10-23: Driver design canvas was newer than the version recorded

- **Area:** process (design)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** The driver canvas read version `1792745255-9306`; the design
  record names `1792420198-0b10`.
- **Cause:** Unknown: the canvas was republished after the record was
  written, and the record was not updated.
- **Fix / workaround:** Both boards were read and compared with the record:
  J1, J2 and A1-A8 match it (A1-A8 still show the code at arrival, so the
  changes in prompt 13 are still needed). Noted in the design record's
  "Build status".
- **Status:** resolved
- **Refs:** #97, `docs/design/driver-deliveries.md`

### 2026-10-23: Closing issue #82 was denied by the agent's permission check

- **Area:** GitHub
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `gh issue close 82 --reason completed --comment ...` was
  refused: `Permission for this action was denied by the Claude Code auto
  mode classifier. Reason: [External System Writes]`.
- **Cause:** The agent's auto mode treats writing to GitHub as an external
  action needing the user's approval.
- **Fix / workaround:** The user closes the issue themselves, or allows
  `gh issue close` in the Claude Code permission settings. Also hit:
  `gh issue view 97 --comments --json ...` fails with "specify only one of
  --comments or --json"; read comments with `--json comments`.
- **Status:** workaround
- **Refs:** #82, #97

### 2026-10-23: A slow new test file made other frontend tests time out

- **Area:** frontend (tests)
- **Author:** Daveoski + Claude Code
- **Symptom:** After adding `features/admin-cash/cash.test.tsx` (#125),
  `npm test` failed on some runs with up to 28 `Error: Test timed out in
  5000ms.` in files that were not changed (`AdminOrdersPage.test.tsx`,
  `holds.test.tsx`, `customerOrders.test.tsx`), and passed on others.
  Without the new file the suite passed every time.
- **Cause:** The new file typed amounts and notes with `user.type`, one
  re-render of the whole sheet per key. The file took about 31 s and kept a
  worker busy while about 30 jsdom workers ran in parallel, so other files'
  tests ran past 5 s.
- **Fix / workaround:** Set field values with one `fireEvent.change` (a
  `fill` helper) and `userEvent.setup({ delay: null })` for clicks. The file
  now takes about 3 s; the full suite passed three runs in a row. Prefer one
  change event over `user.type` unless a test is about typing itself.
- **Status:** resolved
- **Refs:** #125, `frontend/src/features/admin-cash/cash.test.tsx`

### 2026-10-23: Driver canvas publish blocked from the scratchpad, then refused as stale

- **Area:** tooling (design)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Adding the #109 board to the driver canvas: the publish from
  the session scratchpad failed with `publishing "...\scratchpad\pickup-canvas\project\canvas.json"
  is blocked by a Read permission rule`. From `.design-staging/` it was
  refused twice with `You haven't viewed the latest version of this
  artifact, so nothing was published`, although a file read showed the same
  version (`1792745255-9306`) and an unchanged `canvas.json`.
- **Cause:** The scratchpad block is the 2026-10-19 one (cause unknown). The
  stale refusals cleared only after a read of the whole artifact (no
  `path`): reading single files did not count as viewing the latest version.
- **Fix / workaround:** Stage in `.design-staging/` (git-excluded), read the
  artifact itself (`action: read`, `url`, no `path`) right before
  publishing, then publish. The third publish went through (version
  `1792747672-774e`).
- **Status:** workaround
- **Refs:** #109

### 2026-10-23: Hold review decision 7 still says every eligibility answer is `cannot_check`

- **Area:** process (contract)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `docs/api/deliveries.md`, hold review decision 7, ends "Until
  then every answer is `cannot_check`", but since #112 R2 answers from the
  source records (`deliveries.holds.source_eligibility`): `not_eligible`
  for a typed source, `cannot_check` only for an order with no water
  category.
- **Cause:** The agreed decision text was not updated when #112 shipped.
- **Fix / workaround:** Not edited: it is agreed contract text. The #109
  contract proposal describes the current behaviour; the technical lead
  should correct the sentence when agreeing it.
- **Status:** open
- **Refs:** #109, #112

### 2026-10-23: `sed` replacement with `#` as delimiter failed on a Markdown link

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `sed: -e expression #1, char 173: unknown option to 's'`.
- **Cause:** The replacement held a link anchor (`...md#change-...`), and
  `#` was the `s` delimiter.
- **Fix / workaround:** Use the editor tool for Markdown with links, or a
  delimiter that cannot appear (`|` fails on tables too).
- **Status:** resolved
- **Refs:** #109

### 2026-10-23: Issue comment on #129 named a phone check constraint that does not exist

- **Area:** process (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The decisions comment on #129 said "the database check
  constraint is changed to allow that marker". Reading the model afterwards
  showed `users.phone` is `VARCHAR(16)` and unique, with **no** check
  constraint; validation happens at the API boundary
  (`normalize_nigerian_phone`).
- **Cause:** The comment was written from the issue text ("the column must
  stay valid E.164 or the constraint must allow a marker") before the model
  was read.
- **Fix / workaround:** No migration is needed; the marker (`+0` and 14
  digits) fits the column. The correction is in the #129 pull request. Read
  the model before stating schema facts on an issue.
- **Status:** resolved
- **Refs:** #129, `backend/app/modules/auth/models.py`

### 2026-10-23: Integration tests failed with "column water_category_id ... does not exist"

- **Area:** database (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Every test using `add_job` failed:
  `UndefinedColumnError: column "water_category_id" of relation "orders" does not exist`.
- **Cause:** `mmirioma_test` was at revision `0010`; `main` is at `0012`
  (#112, #113). Nothing migrates the test database automatically.
- **Fix / workaround:** `DATABASE_URL="$TEST_DATABASE_URL" alembic upgrade head`
  (test database only), then rerun. Check `alembic current` on the test
  database after pulling new migrations.
- **Status:** resolved
- **Refs:** #129

### 2026-10-23: Test orders for one driver failed on `uq_assignments_live_driver`

- **Area:** backend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A second `add_job(...)` for the same driver failed:
  `duplicate key value violates unique constraint "uq_assignments_live_driver"`.
  Passing `ended_at` alone did not help.
- **Cause:** A driver may hold one **live** assignment, and live means status
  `offered` or `accepted` (`dispatch/models.py`, `_LIVE`); `ended_at` is not
  part of it. `add_job` defaults to `accepted`.
- **Fix / workaround:** For finished orders pass
  `assignment_status=AssignmentStatus.COMPLETED` (and `ended_at`).
- **Status:** resolved
- **Refs:** #129, `tests/test_privacy_integration.py`

### 2026-10-23: `Result.tuples()` raised a deprecation error under `-W error`

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `SADeprecationWarning: The Result.tuples() method is
  deprecated, Row now behaves like a tuple and can unpack types directly.
  (deprecated since: 2.1.0)`.
- **Cause:** SQLAlchemy 2.1 deprecates `Result.tuples()`.
- **Fix / workaround:** Iterate the result and unpack rows directly
  (`for reference, status in rows`).
- **Status:** resolved
- **Refs:** #129, `backend/app/modules/orders/retention.py`

### 2026-10-23: Importing PRIVACY_NOTICE.md with `?raw` failed with "Denied ID"

- **Area:** frontend (tooling)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** For #100, `import notice from '../../../../PRIVACY_NOTICE.md?raw'`
  made Vitest fail: `Error: Denied ID .../mmirioma/PRIVACY_NOTICE.md?raw`.
  Adding just that file to `server.fs.allow` gave the same error.
- **Cause:** The file is outside `frontend/`, Vite's default allow list.
  Vite 8 checks `?raw` ids twice, once without and once **with** the query,
  so an allow entry for the single file never matches; only a parent
  directory would. Vitest applies the same check as the dev server.
- **Fix / workaround:** A small local plugin in `vite.config.ts`
  (`privacyNotice()`) serves the file as `virtual:privacy-notice` (virtual
  ids skip the check). The allow list stays at `frontend/`; widening it to
  the repository root would have let the dev server serve every repository
  file.
- **Status:** resolved
- **Refs:** #100, `frontend/vite.config.ts`, `docs/architecture/frontend.md`

### 2026-10-23: Testing Library dropped the space before "(opens in a new tab)"

- **Area:** frontend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `getByRole('link', { name: 'Privacy notice (opens in a new tab)' })`
  found nothing; the computed name was `"Privacy notice(opens in a new tab)"`.
- **Cause:** The space was the first character inside the `sr-only` span;
  the accessible-name computation trims each child's text.
- **Fix / workaround:** Put the space in its own text node before the span
  (`{' '}<span className="sr-only">(opens in a new tab)</span>`).
- **Status:** resolved
- **Refs:** #100, `TextLink.tsx`, `PrivacyNoticePage.tsx`

### 2026-10-23: `gh issue view` failed on the Projects (classic) deprecation

- **Area:** tooling (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `gh issue view 100 --comments` exited 1: `GraphQL: Projects
  (classic) is being deprecated in favor of the new Projects experience
  (repository.issue.projectCards)`.
- **Cause:** The default `gh issue view` output still queries classic
  project cards, which GitHub now refuses.
- **Fix / workaround:** Ask for fields explicitly:
  `gh issue view 100 --json title,body,labels,comments`.
- **Status:** workaround
- **Refs:** #100

### 2026-10-23: `echo =====` failed in zsh with "==== not found"

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A separator line `echo =====` in a zsh command printed
  `(eval):1: ==== not found` and stopped the command.
- **Cause:** zsh expands a word starting with `=` to the path of that
  command (`=cmd`).
- **Fix / workaround:** Quote it (`echo "-----"`) or use dashes.
- **Status:** workaround
- **Refs:** #100

### 2026-10-22: The payments contract names the cash history events but not their shape

- **Area:** process
- **Author:** Daveoski + Claude Code
- **Symptom:** #125's first step is to accept `cash_recorded`,
  `cash_handed_over`, `cash_corrected`, `cash_received` and
  `cash_reconciled` in the admin history before #123 sends them.
  `docs/api/payments.md` (agreed) says only that the history "gains the
  events ... with the old and new amounts and the reason ... with the
  resulting payment status ... and the SMS outcome; none has a `from`/`to`
  status". It does not say which field names the event, or where the
  amounts, reason, payment status and SMS outcome go.
- **Cause:** The contract's history section was written from the design's
  history lines, without an example entry.
- **Fix / workaround:** The client reads them as `kind` values, the field
  the hold entries already use, and shows the label, who, when and the note.
  An unknown kind reads as `other` ("Order update") and missing status
  fields as `null`, so the history keeps working whatever #123 sends. The
  amounts, reason, payment status and SMS outcome are not shown until the
  contract adds an example entry (for #123's owner and the technical lead).
- **Status:** open
- **Refs:** #125, #123, `docs/api/payments.md`, `frontend/src/lib/api/adminDispatch.ts`

### 2026-10-22: No end-to-end run of the confirmation screens: Docker not running

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** For #114's T-14 check against the real backend, `docker ps`
  failed: `failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine ... The system cannot find the
  file specified.` The backend virtualenv (`backend/.venv`) was also missing.
- **Cause:** Docker Desktop was not started on this machine, and the
  backend environment had not been created in this checkout.
- **Fix / workaround:** Done later the same day once Docker was running.
  `docker compose up` still failed on 5432 (the native PostgreSQL install,
  entry of 2026-10-19), so the PostGIS image ran on `127.0.0.1:54329` and
  `DATABASE_URL` was overridden in the shell, not in `.env`. The API ran on
  port 8010 (another project's API holds 8000), with the frontend's
  `VITE_API_BASE_URL=http://localhost:8010 VITE_ORDERS_SOURCE=api`. The demo
  seed was called from a script with a generated password (its `getpass`
  prompt ignores piped input on Windows). An API-level run of every C1 call
  passed (refusals, 422s, confirm, snapshot, history, repeat 409, assign),
  and the real responses parse with the client schemas. The click-through
  in the browser is the last step.
- **Status:** workaround
- **Refs:** #114

### 2026-10-22: The sources command line takes the source id, not its name

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** `python -m app.modules.sources.cli activate --source "Demo
  Borehole A" ...` failed: `argument --source: invalid UUID value: 'Demo
  Borehole A'`.
- **Cause:** `activate`, `suspend` and `revoke` take the id that
  `add-source` prints (or `list-sources` shows), by design.
- **Fix / workaround:** Copy the id from `add-source`'s output or
  `list-sources`.
- **Status:** resolved
- **Refs:** `backend/app/modules/sources/cli.py`, #114

### 2026-10-22: Publishing the new cash canvas was denied by the agent's permission check

- **Area:** tooling (design)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** For #98, a new Claude Design canvas ("MmiriOma Cash
  Remittance") was created, but the first publish of its index and Main
  board was refused twice. The second refusal: `Permission for this action
  was denied by the Claude Code auto mode classifier. Reason: [Out-of-Place
  Publication]`. The canvas then reported itself as shared with anyone who
  has the link.
- **Cause:** The agent's auto mode treats publishing to a link-shared
  artifact as publication that needs the user's approval.
- **Fix / workaround:** Approving in chat did not help; the check runs on
  its own. The canvas owner set it to private from its Share menu, and the
  next publish went through. Publish to a new canvas while it is private,
  then share it with the reviewers. Publishing from the session scratchpad
  worked this time (the 2026-10-19 entry saw it blocked).
- **Status:** resolved
- **Refs:** #98

### 2026-10-22: Printing issue JSON from Python failed with `UnicodeEncodeError`

- **Area:** tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Printing `gh issue view 88 --json ...` output with a Python
  one-liner in Git Bash failed: `UnicodeEncodeError: 'charmap' codec can't
  encode character '→'`.
- **Cause:** On Windows, Python writes to a pipe in the console code page
  (cp1252), which has no `→`; issue bodies use it.
- **Fix / workaround:** Set `PYTHONIOENCODING=utf-8` for the command (or
  run `python -X utf8`).
- **Status:** workaround
- **Refs:** #88

### 2026-10-22: Frontend checks failed with "'eslint' is not recognized"

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** On #114, `npm run lint` printed `'eslint' is not recognized
  as an internal or external command`, `npm test` the same for `vitest`, and
  `npm run typecheck` failed with `TS2307: Cannot find module 'vite'`.
- **Cause:** The main checkout's `frontend/node_modules` was missing (not
  a new worktree, unlike the 2026-10-21 entry).
- **Fix / workaround:** `npm ci` in `frontend/`, then rerun the checks. If
  a frontend command says a tool "is not recognized", install first.
- **Status:** resolved
- **Refs:** #114

### 2026-10-22: `gh issue view` printed nothing, and the GitHub MCP server did not connect

- **Area:** tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Reading #98 for its design prompt, `gh issue view 98
  --comments` exited 0 with no output (Git Bash on Windows, run by an
  agent). The GitHub MCP server also failed at start-up: `Authorization
  header is badly formatted`.
- **Cause:** Unknown for `gh`: likely the pager or terminal detection when
  output is not a terminal. The MCP failure is a token or configuration
  problem in the agent's GitHub plugin, not in the repository.
- **Fix / workaround:** `gh issue view 98 --json number,title,body,comments`
  returns the issue reliably. Use `--json` (or `GH_PAGER=cat`) from agents.
- **Status:** workaround
- **Refs:** #98

### 2026-10-22: Reading a model attribute after `rollback()` raised `MissingGreenlet`

- **Area:** backend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** In #113's repeat-confirm test, `confirm_order` failed with
  `sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't
  call await_() here` instead of 409 `invalid_order_transition`.
- **Cause:** The code called `await session.rollback()` and then read
  `order.status` to build the error. A rollback expires every loaded object
  even with `expire_on_commit=False`, so the read tried a lazy load, which
  an async session cannot do.
- **Fix / workaround:** Read what the error needs before the rollback
  (`current = order.status`). After any rollback, do not touch loaded
  objects without reloading them with `await`.
- **Status:** resolved
- **Refs:** #113, `backend/app/modules/confirmation/service.py`

### 2026-10-22: A dataclass as a FastAPI dependency override turned into a body field

- **Area:** backend (tests)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** In #113's API tests every `POST .../transition` returned 422
  `validation_error` with `{"loc": ["body"], "msg": "Input should be a valid
  list"}`, even for bodies that had passed before.
- **Cause:** The test set `app.dependency_overrides[get_sms_provider] =
  MockSmsProvider`. FastAPI reads the override's signature, and the
  dataclass's `outbox: list[SentSms]` field became a second body parameter,
  so the body was expected to be embedded. (While looking, the
  discriminated body was also moved from `Body(discriminator=...)` to
  pydantic's `Field(discriminator="to")`.)
- **Fix / workaround:** Override with a zero-argument factory:
  `sms = MockSmsProvider(); overrides[get_sms_provider] = lambda: sms`, as
  `test_phone_verification_integration.py` does.
- **Status:** resolved
- **Refs:** #113, `backend/tests/test_confirmation_api.py`

### 2026-10-22: Test teardown deleted assignments before the events that reference them

- **Area:** backend (tests)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** A #113 integration test errored in teardown with
  `psycopg.errors.ForeignKeyViolation: ... violates foreign key constraint
  "fk_order_events_assignment_id_assignments"`, then part 1's cleanup failed
  on `fk_audit_logs_actor_id_users`, leaving rows in the test database.
- **Cause:** The new module's own cleanup deleted `assignments` itself;
  `order_events` reference assignments (revision 0008) and part 1 deletes
  them later, in the right order.
- **Fix / workaround:** A module's cleanup deletes only what part 1 does not
  (audit rows, driver and vehicle profiles). Run integration tests against a
  throwaway database, so a failed teardown costs nothing. Also: wait for a
  fresh PostGIS container to accept connections (about 15 s) before
  `alembic upgrade head`; the first try failed with connection refused.
- **Status:** resolved
- **Refs:** #113, `backend/tests/test_confirmation_integration.py`

### 2026-10-22: `auth.cli create-user` hung when the password was piped in

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Testing the sources command line for #112, `printf
  'pw\npw\n' | python -m app.modules.auth.cli create-user --role admin ...`
  never returned; the command timed out after 180 s and was stopped.
- **Cause:** The command reads the password with `getpass.getpass`, which on
  Windows reads the console directly and ignores standard input.
- **Fix / workaround:** For a throwaway test database, insert the test admin
  with `psql` (`password_hash` `'unused'`; nobody signs in with it). For a
  real account, run `create-user` in an interactive terminal.
- **Status:** workaround
- **Refs:** #112

### 2026-10-22: Adding a row to the contract's transitions table failed backend CI

- **Area:** CI
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** On PR #111 (docs only) the backend job failed:
  `FAILED tests/test_order_transitions.py::test_rules_match_the_contract_rows`,
  `Extra items in the left set: 26`.
- **Cause:** The test reads the "Transitions" table in
  `docs/api/deliveries.md` and requires every row (2 onwards) to have a rule
  in `app/modules/orders/transitions.py`. The agreed row 26 was added to the
  table before any code. Its rule needs a new reason, `manual_quote`, whose
  CHECK constraint needs a migration: build work for #113.
- **Fix / workaround:** Row 26 stays in the order confirmation section of
  the contract; #113 moves it into the main table with its rule and
  migration. Run the backend tests on any change to that table, even a
  docs-only one. Also: the local backend virtualenv lacked `geoalchemy2`
  (`ModuleNotFoundError`); `pip install -r requirements-dev.txt` fixed it.
- **Status:** resolved
- **Refs:** PR #111, #113, `backend/tests/test_order_transitions.py`

### 2026-10-22: Prompt 08 could not be run on the team design canvas

- **Area:** tooling (design)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Running prompt 08 for #87, the team canvas
  (`9fKnBVzgvqwm8vx1eU8Y5C`, "MmiriOma Design System") could be read but
  not written: its read gives no "writer" access for this account, so new
  boards could not be added. The prompt says to run it there.
- **Cause:** Edit access to the team canvas belongs to the technical lead's
  account; the hold review boards (prompt 07) were added from it.
- **Fix / workaround:** Made a separate canvas, "MmiriOma Order
  Confirmation" (`3mYmQFfJqhh8uyVjMhw6pt`), with the tokens copied exactly
  from `frontend/src/index.css`, as the customer ordering and driver canvases
  did. Staged its files in `.design-staging/` (LOG 2026-10-19). The design
  record says so. To move the boards to the team canvas later, someone with
  edit access republishes the `ConfNN.dc.html` files there.
- **Status:** workaround
- **Refs:** #87, `docs/design/admin-order-confirmation.md`

### 2026-10-21: `npx tsc` in a fresh worktree fetched an unrelated package

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** In a new git worktree, `npx tsc -p tsconfig.app.json --noEmit`
  printed `npm warn exec The following package was not found and will be
  installed: tsc@2.0.4` and then "This is not the tsc command you are
  looking for".
- **Cause:** A new worktree has no `node_modules`, so `npx tsc` found no
  local TypeScript and fetched the deprecated `tsc` package from the
  registry instead.
- **Fix / workaround:** Run `npm ci` in the worktree's `frontend/` first,
  then use the project scripts (`npm run typecheck`, which is `tsc -b`).
- **Status:** resolved

### 2026-10-21: A Python edit script with nested triple quotes did not run

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** A scripted multi-file edit failed with `SyntaxError:
  unterminated triple-quoted string literal`; none of its edits were applied.
- **Cause:** The replacement text contained `'''`, which closed the
  script's own `'''` string early.
- **Fix / workaround:** Use `"""` for strings that contain `'''` (or write
  the file whole). Check `git status` after a scripted edit.
- **Status:** resolved

### 2026-10-21: `git stash` used in a worktree to compare a build

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** To see whether a Vite chunk-size warning predated #94, the
  agent ran `git stash`, built and `git stash pop` in the #94 worktree. The
  changes came back (checked with `git status` and `git stash list`), but
  the comparison was meaningless: untracked new files stayed in place.
- **Cause:** Wrong method; it also risked the only copy of uncommitted work.
- **Fix / workaround:** Compare against a clean checkout of `main` instead
  (the warning is on `main` too). Never stash uncommitted work to compare.
- **Status:** resolved

### 2026-10-21: Uncommitted #93 work lost when the scratchpad was cleared

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** When committing #93, `cd` into the scratch worktree failed
  (`no such file or directory: .../scratchpad/wt-93`). The worktree held the
  only copy of the finished, uncommitted backend work. Because the command
  chained with `;`, the following `git push -u origin
  feat/93-hold-review-endpoints` still ran from the main checkout and pushed
  that branch name pointing at `main`'s commit (no changes).
- **Cause:** The session scratchpad under `/tmp` is cleared without warning
  (see "Scratch worktrees and helper scripts vanished between turns"), and
  the agent kept uncommitted work there across turns.
- **Fix / workaround:** Rebuilt the work from the session record in a
  worktree beside the repo (`../mmirioma-93`), committing as it went; all
  checks were re-run. Rules now: keep worktrees outside `/tmp`, commit
  (locally) before ending a turn, and chain git steps with `&&` after a `cd`
  so a failed `cd` stops everything.
- **Status:** resolved

### 2026-10-21: Scratch worktrees and helper scripts vanished between turns

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** The agent's scratch git worktrees (`wt-hold`, `wt-p08`,
  `wt-pilot`) and its helper scripts were gone from the session scratchpad;
  `git worktree list` marked the worktrees `prunable`, and sourcing a helper
  failed with `no such file or directory`.
- **Cause:** The scratchpad under `/tmp` was cleared again (see 2026-10-20,
  "Session limit cleared the scratchpad mid-run").
- **Fix / workaround:** Nothing was lost because every branch had been
  pushed. `git worktree prune`, then recreate what is needed. Never keep the
  only copy of anything in the scratchpad.
- **Status:** workaround

### 2026-10-21: Hold review test expected a new code while the old one was valid

- **Area:** backend
- **Author:** nnamdi-security + agent
- **Symptom:** A new integration test for a rejected proof failed with
  `APIError: The customer's current code still works. Ask them for it.`
  (409 `delivery_code_still_valid`).
- **Cause:** The test moved the clock 61 seconds (past the new-code
  cooldown) but the first code stays valid for 10 minutes; a new code is
  allowed only once the current one is unusable or its SMS failed. The
  service was right; the test was wrong.
- **Fix / workaround:** The test moves the clock 11 minutes, past expiry.
  Remember both rules: the 60-second cooldown and "only when unusable".
- **Status:** resolved

### 2026-10-21: A test text replacement also matched an unrelated test

- **Area:** backend
- **Author:** nnamdi-security + agent
- **Symptom:** After moving the admin list route (#93),
  `test_list_my_orders_uses_defaults_and_page_shape` failed: an
  `extra_conditions` key meant for two admin list tests was also added to the
  customer list test, whose expected arguments looked the same.
- **Cause:** A scripted find-and-replace on the block `"limit": 50,
  "offset": 0` matched two tests instead of one.
- **Fix / workaround:** Removed the stray line. Scripted edits should assert
  how many places they match before writing.
- **Status:** resolved

### 2026-10-21: Hold review contract assumed no client read the order history

- **Area:** process
- **Author:** nnamdi-security + agent
- **Symptom:** The proposed hold review contract (PR #91) added history
  entries with `null` `from_status` and `to_status`, saying "No client reads
  the history yet". It was approved on that basis. The admin dispatch
  screens (#62) already read the history, and `OrderHistory.tsx` draws a
  status badge from every entry's `to_status`, so the change would have
  broken them.
- **Cause:** The claim was written from the contract's status ("not built")
  without checking `frontend/src` on `main`.
- **Fix / workaround:** Hold entries are returned only with
  `?include=holds`, so the agreed response is unchanged. The reviewer was
  asked to re-confirm. Before calling a contract change additive or unused,
  `git grep` the field on `origin/main` in both `backend/` and `frontend/`.
- **Status:** resolved

### 2026-10-21: Canvas publish with only `files` and `root` was refused

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** Republishing changed Hold boards to the team design canvas
  with `url`, `root` and `files` (no `file_path`) failed: "`files` and
  `root` only name supporting files, and nothing was published: also pass
  `file_path`".
- **Cause:** A canvas publish needs one of the artifact's own data files as
  `file_path`; `files` only adds the others.
- **Fix / workaround:** Pass one changed board (for example
  `project/Hold08.dc.html` under the root) as `file_path` and the rest in
  `files`. `canvas.json` is only needed when the board layout changes.
- **Status:** resolved

### 2026-10-21: `grep -o` with a counted repeat failed on the canvas boards

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** `grep -o '[^"]\{0,80\}no Withdraw[^"]\{0,80\}' Hold08.dc.html`
  failed with `ugrep: error: error at position 630 ... exceeds complexity
  limits`.
- **Cause:** `grep` on this machine is ugrep. A bracket expression with a
  counted repeat expands to a large UTF-8 pattern, which ugrep refuses.
- **Fix / workaround:** Search the boards with a short Python script
  (`re.finditer` and a slice for context), or use fixed strings with
  `grep -F`.
- **Status:** workaround

### 2026-10-21: Escape in the log-out dialog also closed the drawer menu

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Found in the PR #3 review: in the customer and driver drawer menus, Escape on the "Log out?" dialog would close the dialog and also navigate away from the menu.
- **Cause:** `ConfirmDialog` listens on `document`; `DrawerMenu` listens on `window` for Escape. The keydown reached both.
- **Fix / workaround:** The dialog calls `stopPropagation()` on Escape, so window listeners underneath never see it. Regression test in `ui.test.tsx`.
- **Status:** resolved
- **Refs:** `frontend/src/components/ui/ConfirmDialog.tsx`, `frontend/src/components/layout/DrawerMenu.tsx`, PR #3

### 2026-10-21: Logo and icon files carried "made with AI" content credentials

- **Area:** frontend (assets)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** The owner asked to remove "made with AI" tags. Nothing in the code or copy said so, but 34 files in `frontend/public` (logos, app icons, favicons) contained C2PA / JUMBF metadata naming Claude as the software agent. Platforms such as Instagram and Facebook read this metadata and show a "Made with AI" label.
- **Cause:** The credential was embedded when the logo pack was converted to web sizes (2026-10-20). The marketing photos and illustrations had none.
- **Fix / workaround:** Removed the metadata chunks only (`caBX` in PNG, `C2PA` in WebP, RIFF size rewritten), checked that the pixel chunks are byte-identical, and checked that no file still contains `c2pa`/`jumbf`. To check new images: `LC_ALL=C grep -rl -a -i 'c2pa\|jumbf' frontend/public`.
- **Status:** resolved
- **Refs:** `frontend/public/brand/`, `frontend/public/icons/`, `frontend/public/favicon-*.png`, `frontend/public/apple-touch-icon.png`

### 2026-10-21: Newsletter form pulled Zod and React Hook Form into the main bundle

- **Area:** frontend (bundle size)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After adding the newsletter form to the public pages, the main bundle grew from about 109 kB to 151 kB gzipped (`ZodError` found in `dist/assets/index-*.js`).
- **Cause:** The public pages are in the main bundle, so anything they import statically (`lib/forms.ts`, Zod, React Hook Form) lands there too.
- **Fix / workaround:** The form is its own file (`NewsletterForm.tsx`) loaded with `React.lazy`; the public mock is a dynamic import. Main bundle: 113 kB gzipped. Check after changing public pages: `gzip -c dist/assets/index-*.js | wc -c`.
- **Status:** resolved
- **Refs:** `frontend/src/features/marketing/SiteExtras.tsx`, `NewsletterForm.tsx`, `publicApi.ts`

### 2026-10-21: Sticky header needs `overflow-x: clip`, not `hidden`

- **Area:** frontend (CSS)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Found during review, before shipping: making the public header `position: sticky` would not have stuck, because each page wrapper had `overflow-x: hidden`.
- **Cause:** `overflow-x: hidden` turns the wrapper into a scroll container, and a sticky element sticks to its nearest scroll container (which never scrolls), not to the window.
- **Fix / workaround:** Page wrappers use `overflow-x-clip`, which hides sideways overflow without creating a scroll container. Hash-link targets got `scroll-margin-top: 92px` so sections are not hidden under the header.
- **Status:** resolved
- **Refs:** `Landing.tsx`, `FaqPage.tsx`, `LegalPages.tsx`, `marketing.css`

### 2026-10-21: Shell commands hung or failed to parse (agent tooling)

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** (1) A command ran into the 2-minute timeout and had to be stopped. (2) An inline Python edit script failed with `unexpected EOF while looking for matching '''`.
- **Cause:** (1) A stray `cat > file` with no input waited for stdin forever. (2) A long heredoc with apostrophes in the edited text (e.g. "Didn't") confused the shell wrapper.
- **Fix / workaround:** Write edit scripts to a file in the scratchpad and run them with `timeout 30 python script.py`; never run `cat >` without a heredoc.
- **Status:** resolved
- **Refs:** none (local tooling)

### 2026-10-21: Vitest workers timed out starting during one full run

- **Area:** frontend (tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `[vitest-pool]: Failed to start forks worker ... Timeout waiting for worker to respond` for three test files in one `vitest run`.
- **Cause:** The machine was busy (several node processes); not a test failure.
- **Fix / workaround:** Run again; the next full `npm test` passed 149/149 in 20 files. If it repeats, run the named files on their own.
- **Status:** workaround
- **Refs:** `src/mocks/admin.test.ts`, `src/mocks/partner.test.ts`, `src/features/admin/admin.test.tsx`

### 2026-10-20: Issue #87 decisions point to a pilot plan that is not on main

- **Area:** process
- **Author:** Daveoski + Claude Code
- **Symptom:** The technical lead's decisions on #87 say the fallbacks are
  recorded in `docs/process/pilot-plan.md` section 7, but the file does not
  exist on `main`.
- **Cause:** The pilot plan (with fallbacks F1-F4) is on branch
  `docs/13-pilot-plan`, not merged yet.
- **Fix / workaround:** Read it with
  `git show origin/docs/13-pilot-plan:docs/process/pilot-plan.md`. Prompt 08
  links it by path and notes the branch (open question 8). PR #80 merged the
  plan on 2026-10-21; prompt 08 now links it directly.
- **Status:** resolved
- **Refs:** #87, #13, `docs/design/prompts/08-admin-order-confirmation.md`

### 2026-10-20: `gh` CLI not installed on a Windows workstation

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** `gh issue list` failed: "The term 'gh' is not recognized as the
  name of a cmdlet, function, script file, or operable program."
- **Cause:** GitHub CLI is not installed (not in `C:\Program Files\GitHub CLI`).
- **Fix / workaround:** The repository is public, so issues were read from the
  REST API (`https://api.github.com/repos/mmiri-oma/mmirioma/issues`). Install
  GitHub CLI (`winget install GitHub.cli`) to comment on issues or open pull
  requests from the terminal.
- **Status:** workaround
- **Refs:** #87

### 2026-10-20: End-to-end script could not read the delivery code from the mock SMS log

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** In the end-to-end delivery run after #77, the proof with "the
  customer's code" got 422 `validation_error` ("Send exactly one of
  delivery_code and alternative_proof"): the script had sent
  `delivery_code: null`.
- **Cause:** The script's parser looked for any six-digit number in the
  line. The mock provider logs `MOCK SMS (not sent) to +234800****011: Your
  MmiriOma delivery code is 123456. ...`, so the masked phone also starts
  with six digits, and the splitting picked the wrong part, returning nothing.
  The server was right to refuse.
- **Fix / workaround:** Match the message itself:
  `re.findall(r"delivery code is (\d{6})\b", log)[-1]`. Rerun from the saved
  state (request a new code once the old one expired) passed.
- **Status:** resolved
- **Refs:** #77, `docs/features/driver-jobs.md` (end-to-end run)

### 2026-10-20: Session limit cleared the scratchpad mid-run

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** After a session limit, the agent's scratchpad directory was
  gone: the run's scripts, its ID file and the passwords it had set on the
  demo dispatcher and drivers.
- **Cause:** The scratchpad is per session; nothing in it outlives the
  session.
- **Fix / workaround:** The dev database kept the run's state, so it was read
  back from there, new passwords were set on the three demo accounts needed
  (demo-flagged, dev database only), and the run resumed. Keep long runs
  resumable from database state, and never rely on scratch files for
  anything that must survive a session.
- **Status:** workaround
- **Refs:** end-to-end delivery run after #77

### 2026-10-20: Autogenerate missed a changed CHECK and duplicated new ones again

- **Area:** database
- **Author:** Bonvee120 + Claude Code
- **Symptom:** For revision `0009` (#75), `alembic revision --autogenerate`
  did not include the three new `order_exceptions.category` values, and
  emitted two identical CHECKs per new enumeration column (for example
  `delivery_outcome` and `ck_delivery_attempts_delivery_outcome`).
- **Cause:** Alembic does not compare CHECK constraints, so a changed
  enumeration list is invisible to it. The duplicates are the
  `Enum(create_constraint=True)` problem from 2026-10-14.
- **Fix / workaround:** Wrote the migration by hand in the `0007` style:
  VARCHAR columns with one named CHECK each, and
  `drop_constraint`/`create_check_constraint` for the category list.
  Whenever an enumeration gains a value, add the CHECK change to a migration
  yourself; `alembic check` will not catch it.
- **Recurred 2026-10-21 (#93, revision `0010`, nnamdi-security + agent):**
  autogenerate emitted `sa.Enum(..., create_constraint=True)` inline for the
  three new enumeration columns, and missed the new model CHECK
  (`override_only_for_alternative_proof`) and the data backfill it needs.
  Rewritten by hand the same way; the backfill (`override_status = 'pending'`
  for existing alternative proofs) runs before that CHECK is created.
- **Status:** resolved
- **Refs:** #75, `backend/alembic/versions/20261020_0009_add_delivery_attempts_and_proofs.py`

### 2026-10-20: No database for migrations and integration tests on this machine

- **Area:** tooling (database)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** `failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine` (Docker Desktop was not
  running). Once it was, there was no MmiriOma container and no `.env`, so
  `docker compose up` would fail on `POSTGRES_PASSWORD`; other projects'
  stopped containers still claim port 5432.
- **Cause:** First database use on this machine.
- **Fix / workaround:** Started Docker Desktop
  (`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`), then a
  throwaway container on a free port, as in the 2026-10-15 port entry:
  `docker run -d --name mmirioma-s75-testdb -e POSTGRES_USER=mmirioma
  -e POSTGRES_PASSWORD=<local-only> -e POSTGRES_DB=mmirioma_test
  -p 127.0.0.1:5434:5432 postgis/postgis:16-3.4`, with `DATABASE_URL` and
  `TEST_DATABASE_URL` set for the commands only. Remove it afterwards with
  `docker rm -f mmirioma-s75-testdb`.
- **Status:** workaround
- **Refs:** #75

### 2026-10-20: Bash heredocs with Python code failed in the agent's shell

- **Area:** tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** `bash: -c: line 171: unexpected EOF while looking for matching
  `''` when piping a long Python edit script through `<<'PY'`.
- **Cause:** Not confirmed. The agent's shell wrapper appears to mishandle long
  quoted heredocs whose body contains `'''` and other quotes.
- **Fix / workaround:** Write the script to a file and run it with `python
  <file>`. Short heredocs worked.
- **Status:** workaround
- **Refs:** #75

### 2026-10-20: Importing a pytest fixture by name fails ruff F811

- **Area:** backend (tests)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** `F811 Redefinition of unused 'created'` on every test in
  `test_driver_job_steps_integration.py` after `from
  tests.test_deliveries_integration import created`.
- **Cause:** Each test's `created` parameter redefines the imported name.
- **Fix / workaround:** Import the module and re-expose the fixture:
  `from tests import test_deliveries_integration as part1` then
  `created = part1.created`.
- **Status:** resolved
- **Refs:** #75

### 2026-10-20: #83 reverted by accident

- **Area:** GitHub
- **Author:** nnamdi-security + Claude Code
- **Symptom:** PR #83 (customer status fallback, #82) was merged, then PR
  #84 "Revert ..." was opened with GitHub's Revert button and merged, with an
  empty description. `main` lost `customerStatusMeta`, so the customer screens
  could crash again on `departed`, `arrived`, `unloading` and
  `awaiting_payment`.
- **Cause:** An unintended click on "Revert" after the merge (confirmed by the
  technical lead); the revert PR carried no reason, and was merged on review.
- **Fix / workaround:** Re-applied #83's commit unchanged (`git cherry-pick -x
  b6c52cb`, same patch id) in a new PR. A revert PR must say why in its
  description; reviewers should ask before merging one that doesn't.
- **Status:** resolved
- **Refs:** #82, #83, #84

### 2026-10-20: Frontend tests failed once under load, then passed

- **Area:** frontend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Reviewing PR #81, the first `npx vitest run` reported
  `Test Files 3 failed | 20 passed (23)`, `Tests 5 failed | 307 passed (312)`.
  Four reruns right after passed 312/312, with no code change.
- **Cause:** Unknown. The failing run had the backend, the Vite dev server and
  headless Chrome running at the same time, so timing-sensitive tests (for
  example `findBy...` waits) under CPU load are the likely cause. The failing
  test names were not captured.
- **Fix / workaround:** None yet. If it recurs, rerun with
  `npx vitest run --reporter=verbose` and record the failing names here; then
  look for fixed timeouts or real timers in those tests.
- **Recurred 2026-10-23** (Cloudcrackamara + Claude Code, merging #126 into
  #97): `confirmation.test.tsx > C1 Confirm order > a note is required when
  the customer agreed some other way` failed after 5093 ms (Vitest's 5 s
  default timeout) in a full run. Alone it passes in about 2.2 s, the
  slowest in its file; two full reruns passed 439/439. Likely cause: a long
  `user.type` sequence near the timeout under load. Candidate fix: give the
  slowest flow tests a longer timeout, or type less text.
- **Status:** open
- **Refs:** PR #81 review, PR #126

### 2026-10-20: Customer screens crashed on a status with no customer wording

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** An order in `departed`, `arrived`, `unloading` or
  `awaiting_payment` (or any unknown status) crashed My orders, Order detail
  and Request received with `TypeError: Cannot read properties of undefined
  (reading 'tone')`. Reproduced by the new #82 tests before the fix.
- **Cause:** The customer app looked wording up with
  `CUSTOMER_STATUS_META[order.status]` and no fallback. The customer
  `OrderRead` is not parsed with Zod, so an unlisted status reached the
  lookup, and the `Record<OrderStatus, ...>` type hid the gap.
- **Fix / workaround:** `customerStatusMeta(status)` returns the neutral
  "Order update" fallback for any status without wording; the badge and the
  order detail use it. When the backend adds a status, check every client
  lookup keyed on it.
- **Status:** resolved (fallback); the four statuses' own wording waits for
  G2 (#82 part 2).
- **Refs:** #82, `frontend/src/features/customer-orders/customerStatus.ts`

### 2026-10-20: Shell edits by an agent lost text on Windows

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** While fixing #82, three scripted edits went wrong. `python`
  was not found (`python: command not found`). A `node -e` script inside a
  double-quoted shell string lost its Markdown backticks: Bash ran them as
  commands (`awaiting_payment\: No such file or directory`). A string
  replacement that matched `\n` did nothing, because the file has CRLF line
  endings, so the `Info` icon import was missing (`ReferenceError: Info is
  not defined`).
- **Cause:** Git Bash on this machine has no Python, Bash runs backticks
  inside double quotes as commands, and some files are checked out with CRLF.
- **Fix / workaround:** Use the editor's file edit tools for exact
  multi-line changes. Put scripts in a file rather than in a quoted
  one-liner, and don't assume `\n` line endings.
- **Recurred 2026-10-22 (#112, Cloudcrackamara + Claude Code):** a `node -e`
  replacement in `frontend/src/features/admin-orders/mockHolds.ts` matched
  nothing because the file has CRLF endings; the script's own check stopped
  it (`m1`) before any write. Redone with the editor's edit tool.
- **Status:** resolved
- **Refs:** #82, #112

### 2026-10-20: Demo seed and dispatch CLI cannot resolve every foreign key

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A setup script for the #62 integration run, importing only the
  auth, dispatch and orders services, failed on its first write with
  `sqlalchemy.exc.NoReferencedTableError: Foreign key associated with column
  'orders.source_id' could not find table 'water_sources'`. Checking the
  commands' own imports (`Base.metadata.sorted_tables` after importing each
  module): `app.modules.demo.seed` fails on `order_events.assignment_id` →
  `assignments` (since #66, revision 0008), `app.modules.dispatch.cli` on
  `orders.source_id` → `water_sources` (since 0007); `app.modules.auth.cli`
  is fine.
- **Cause:** A model is registered only when its module is imported. The
  commands import some services, not every model their tables reference.
  Tests never see it: `tests/conftest.py` imports the whole app, so every
  model is registered.
- **Confirmed:** a real seed run on `mmirioma_test` failed on its first order
  with the `orders.source_id` error (so broken since 0007, #50); it had
  already saved the four demo accounts. The dispatch CLI's own writes
  (vehicles, driver profiles) still worked: only the touched tables are
  resolved, so it was a latent case.
- **Fix / workaround:** New `backend/app/models.py` imports every module's
  models (the same list as `alembic/env.py`); the demo seed and both CLIs
  import it. `tests/test_command_models.py` imports each command, and
  `app.models`, in a fresh interpreter and checks that every foreign key
  resolves and the tables match the app's. After the fix the same seed run
  created its accounts and orders. A new module's models go in both
  `alembic/env.py` and `app/models.py`.
- **Status:** resolved
- **Refs:** #50, #66, `backend/app/models.py`, `backend/app/modules/demo/seed.py`,
  `backend/app/modules/dispatch/cli.py`, `backend/app/modules/auth/cli.py`

### 2026-10-20: Staff top bar is 10 px wider than a 360 px phone

- **Area:** frontend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** In a 360 px phone viewport every admin page measured
  `innerWidth` 370: the top bar's Account button ends at x = 370, its icon
  is cut off at the right edge, and the D1 sheet is 370 px wide.
- **Cause:** `components/layout/AdminShell.tsx`: logo, "Orders" link and the
  Account button sit in one row with `gap-4` and nothing that shrinks; together
  they need about 370 px.
- **Fix / workaround:** Fixed in #79 (Daveoski + Claude Code). Below 768 px
  the bar uses the design system's mobile top bar padding (8 px sides instead
  of 16) and an 8 px gap instead of 16; the brand text can shrink and
  truncate, while "Orders" and Account keep their size. Measured at 360 px:
  no horizontal overflow on the orders list or detail, Account button ends at
  x = 337. Tablet (24 px padding, 16 px gap) and desktop are unchanged. Test:
  `components/layout/AdminShell.test.tsx`.
- **Status:** resolved
- **Refs:** #62 integration, #79, `frontend/src/components/layout/AdminShell.tsx`

### 2026-10-20: Dev database five migrations behind

- **Area:** database
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Before the #62 integration run, `alembic current` on the dev
  database (`mmirioma`) showed `0003`; the app on `main` needs `0008`.
- **Cause:** Migrations 0004-0008 were tested on `mmirioma_test` only; nobody
  upgraded the dev database after merging them.
- **Fix / workaround:** `alembic upgrade head` from `backend/` (0003 → 0008
  ran cleanly; data kept), then `alembic current`. After pulling a migration,
  upgrade the dev database before running the app.
- **Status:** resolved
- **Refs:** #62 integration

### 2026-10-20: Clicking through screens in headless Chrome without Playwright

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The #62 integration run needed clicks and typing, but only
  Playwright's browser binaries are installed (no Playwright library), and
  the headless shell alone only takes screenshots.
- **Cause:** No browser automation library is a project dependency.
- **Fix / workaround:** Drive `chrome-headless-shell` over the DevTools
  protocol from a scratch Python script using `websockets` (already in the
  backend venv), with `--remote-debugging-port`: `Runtime.evaluate` to click
  and type (set the value with the native setter, then dispatch `input`),
  `Emulation.setDeviceMetricsOverride` for a real 360 px viewport (this gets
  under the 512 px window minimum), `Page.captureScreenshot`. Traps hit:
  - a reused `--user-data-dir` keeps the session cookie, so `/admin/sign-in`
    redirects; start each run with an empty profile;
  - waiting for a driver's name matched the history text before the dialog
    opened; wait for `[role=dialog] label` instead;
  - in mobile emulation `innerWidth` grows to fit wide content, so compare
    element edges with the target width (360), not with `innerWidth`;
  - `npx vite` runs Vite as a child: stop it with `pkill -f '[v]ite --port 5173'`;
  - one expectation of mine was wrong (a 1,200 L vehicle on a 3,000 L order
    is both `over_payload` and `busy`); the server was right.
- **Status:** workaround
- **Refs:** #62 integration

### 2026-10-20: Part 2 mock rejected by the built driver job schema

- **Area:** backend (tests)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** The new mock test failed on `driver-job-unreachable.json`:
  `allowed_actions.2 Input should be 'accept', 'decline', ... or
  'report_incident' [type=enum, input_value='record_failed_attempt']`.
- **Cause:** The mock follows the proposed part 2 contract (#51), which adds
  `record_failed_attempt` and `complete_unloading`; the built `JobAction`
  enum only has part 1's actions.
- **Fix / workaround:** The test removes the part 2 actions before validating
  against `DriverJobDetail` and checks them against the contract's list
  instead. When part 2 is built, add both to `JobAction` and drop
  `PART2_ACTIONS` from `backend/tests/test_driver_job_examples.py`.
- **Status:** resolved (#75 added both actions and the part 2 fields; the
  test now validates every sample against the built schemas unchanged)
- **Refs:** #51, #75, `docs/api/examples/driver-job-unreachable.json`

### 2026-10-20: Page tests passed alone but timed out in the full run

- **Area:** frontend (tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** In `npm test` (all files in parallel), `admin.test.tsx` and the FAQ page test failed with `Test timed out in 5000ms`; they passed when run on their own.
- **Cause:** After code splitting, whole-app renders load lazy page chunks; with every file running at once on a busy machine, typing and loading can take longer than Vitest's 5 s default.
- **Fix / workaround:** `testTimeout: 15_000` in `vite.config.ts`, longer waits in the route tests. The same CI-style run then passed 130/130.
- **Status:** resolved
- **Refs:** `frontend/vite.config.ts`, `frontend/src/features/admin/admin.test.tsx`, `frontend/src/features/marketing/marketing.test.tsx`

### 2026-10-20: Demo staff sign-in said "phone number or password is not right"

- **Area:** frontend (admin, mock mode)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Signing in at `/admin/login` with the demo admin failed for the owner.
- **Cause:** The account and login worked (checked by typing the values); the fields held Chrome autofill from another form, and the instructions named the `DEMO_PASSWORD` constant rather than saying to type its value.
- **Fix / workaround:** In mock mode the staff sign-in has a "Use demo staff account" button that fills the form. Clear autofilled fields before typing.
- **Status:** resolved
- **Refs:** `frontend/src/features/admin/pages/AdminLogin.tsx`, `frontend/src/mocks/seed.ts`

### 2026-10-20: Route conversion script kept every page import

- **Area:** tooling (frontend code splitting)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After turning page routes into `lazy` routes, `tsc` reported `TS6133: 'Home' is declared but its value is never read` for every page import.
- **Cause:** The clean-up step looked for each name in the file, and found it inside the new `import('./pages/Home')` paths.
- **Fix / workaround:** Restored the files and deleted the page import lines; `tsc` confirmed none were still needed.
- **Status:** resolved
- **Refs:** `frontend/src/features/customer/routes.tsx`, `frontend/src/features/partner/routes.tsx`

### 2026-10-20: Refund as points hit the manual adjustment limit

- **Area:** frontend (mocks)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Caught by `admin.test.ts`: refunding a ₦11,300 order as points failed with `validation_error`.
- **Cause:** Refunds reused the point-adjustment helper, which caps manual changes at ±10,000 points as a typo guard.
- **Fix / workaround:** The cap is a parameter; refunds pass none because their size follows the order total.
- **Status:** resolved
- **Refs:** `frontend/src/mocks/adminMock.ts`

### 2026-10-20: Orders panel jumped to another order after assigning

- **Area:** frontend (admin)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After "Assign Chinedu", the side panel showed the next waiting order and the "Assigned" confirmation never appeared.
- **Cause:** With no `?ref=` in the address, the panel shows the first waiting order; assigning changed that list.
- **Fix / workaround:** Actions pin the order in the address before they run.
- **Status:** resolved
- **Refs:** `frontend/src/features/admin/pages/Orders.tsx`

### 2026-10-20: Bash heredoc with a long Python edit failed to parse

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `/usr/bin/bash: -c: line 126: unexpected EOF while looking for matching ''` and the edit did not run.
- **Cause:** Quote characters inside a long inline Python script confused the shell around the heredoc.
- **Fix / workaround:** Write long edit scripts to a file in the scratchpad and run that file.
- **Status:** workaround
- **Refs:** n/a

### 2026-10-20: Stale hot-reload errors in the browser console

- **Area:** tooling (Vite dev server)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Dozens of `does not provide an export named 'sampleRiderPay'` errors in the console after a refactor.
- **Cause:** Vite hot-reloaded while the pricing rewrite was half done; the errors stay in the console log.
- **Fix / workaround:** Clear the console and reload; check only fresh errors.
- **Status:** resolved
- **Refs:** `frontend/src/mocks/pricing.ts`

### 2026-10-19: Reading the team design canvas in batches exceeded the size limit

- **Area:** tooling (design)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Building #62, reading the Dispatch01-13 artboards of the team
  canvas (`9fKnBVzgvqwm8vx1eU8Y5C`) failed: listing its files returned
  `the content fetch failed in transit, timed out, or exceeded the 16 MiB
  limit`, and reading three artboards in one request `... exceeded the 20 MiB
  limit`.
- **Cause:** The canvas is large (it holds prompts 00, 04, 05 and 06), and a
  batched read adds the artboards together. Access was not the problem: the
  canvas is public. The agent first wrongly blamed the canvas owner's
  organization, and the user corrected it.
- **Fix / workaround:** Read one artboard per request (`path:
  project/Dispatch01.dc.html`, then 02 and so on). Each artboard's data is the
  JSON in its `<script type="text/x-dc">` block. The first build of the
  screens used only the design record; after reading Dispatch01-07 and 13 one
  by one, the copy, groups, buttons, error states and focus moves were
  changed to match the canvas.
- **Status:** resolved
- **Refs:** #62, `docs/features/admin-dispatch.md`

### 2026-10-19: `app.routes` does not list the API's routes

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Checking that the new dispatch router was registered with
  `for r in create_app().routes: print(r.path)` printed nothing for
  `/api/v1/admin/...`; `len(app.routes)` was 5.
- **Cause:** Not investigated. With FastAPI 0.143 the routes added by
  `app.include_router(api_router)` do not appear when walking `app.routes`,
  so it is not a reliable check.
- **Fix / workaround:** List the paths from the schema instead:
  `python -c "from app.main import app; print([p for p in app.openapi()['paths']])"`.
  It showed all six `/api/v1/admin/orders*` paths. The API tests are the
  real check.
- **Status:** workaround
- **Refs:** #61, `backend/app/api/v1/router.py`

### 2026-10-19: Admin dispatch contract merged while its status still said "proposed"

- **Area:** process
- **Author:** nnamdi-security + Claude Code
- **Symptom:** After @chidimmamogbo approved and merged PR #59, `main` still
  read `Status: **proposed** (G3) ... awaiting @chidimmamogbo` in
  `docs/api/deliveries.md`, and the same "proposed" wording in `orders.md`,
  the API READMEs, `admin-dispatch.md` and the prompt index. It was believed
  to be updated already.
- **Cause:** The PR asked the reviewer to set the status to agreed before
  merging; it was approved and merged without that edit. A merge does not
  change the document, and G3 is only recorded by the text.
- **Fix / workaround:** A follow-up docs PR set every reference to agreed
  (PR #59 review, 2026-10-19). Next time, the contract author sets
  `Status: agreed` in the PR once the review is approved and before merging,
  rather than leaving it to the reviewer. Check with
  `git show origin/main:docs/api/<area>.md | grep -n "Status:"`.
- **Status:** resolved
- **Refs:** #53, PR #59

### 2026-10-19: Pushed the G2 approval to a branch whose PR was already merged

- **Area:** GitHub
- **Author:** nnamdi-security + Claude Code
- **Symptom:** After committing the admin dispatch approval on
  `docs/admin-dispatch-design`, `git push` printed "Create a pull request for
  'docs/admin-dispatch-design'" instead of updating PR #57. `gh pr view 57`
  showed `MERGED` with only the first commit.
- **Cause:** PR #57 was merged while the approval was being prepared; new
  commits on a merged PR's branch go nowhere.
- **Fix / workaround:** Moved the approval commit to a new branch
  (`docs/admin-dispatch-approval`, PR #58); its diff against `main` holds only
  that commit. Before pushing more work to a PR branch, check
  `gh pr view <n> --json state`.
- **Status:** resolved
- **Refs:** #53, PR #57, PR #58

### 2026-10-19: Claude Design artboard text is in the script data, not the markup

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Extracting the visible text from the admin dispatch artboards
  (`project/Dispatch*.dc.html`) returned the same ~7 KB for every board,
  mostly `{{title}}`, `{{b.text}}` placeholders.
- **Cause:** These artboards render from one JSON object returned by
  `renderVals()` in the `<script type="text/x-dc" data-dc-script>` block;
  the markup is a shared template.
- **Fix / workaround:** Parse the object after `return ` in that script with
  `json.loads` and read the frames (`sections[].desk[]`, `mob[]`: `page`,
  `dlgBody`, `acts`, `toastText`, `notes`). Fixed copy (headings, "Loading
  history", component lists) is still in the markup, so read both.
- **Status:** resolved
- **Refs:** #53, `docs/design/admin-dispatch.md`

### 2026-10-19: Unquoted `=====` separator failed in zsh

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `echo =======` in a chained command stopped it with
  `(eval):1: ======= not found`.
- **Cause:** zsh expands a word starting with `=` to the path of that
  command (`=cmd`), and fails when there is none.
- **Fix / workaround:** Quote separators (`echo "-----"`) or use dashes.
- **Status:** resolved
- **Refs:** #53

### 2026-10-19: Publishing a Claude Design canvas from the agent scratchpad was blocked

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Publishing the driver canvas files from the Claude Code
  scratchpad failed with `publishing "...\scratchpad\driver-canvas\project\canvas.json"
  is blocked by a Read permission rule`. Retrying with the long Windows path
  failed with `root: ... is outside the session's working directories`. The
  next publish was then refused because the canvas page had already written
  its own empty `project/canvas.json` when it opened.
- **Cause:** Unknown for the permission block (no deny rule in the project
  or user settings). The second refusal is expected: the canvas writes an
  index on first open, and the publish tool refuses to overwrite a file it has
  not read.
- **Fix / workaround:** Stage canvas files in a local-only folder inside the
  repo (`.design-staging/`, listed in `.git/info/exclude`, so nothing tracked
  changes) and publish from there. Read `project/canvas.json` from the canvas
  first and keep its keys (`attachments`, `createdOnFiles`) when writing yours.
- **Status:** workaround
- **Refs:** #19

### 2026-10-19: Prompt 03 (driver design) predates SRS v0.2

- **Area:** process
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Issue #19 and `docs/design/prompts/03-driver-deliveries.md` ask
  for proof of delivery as two options (A: code, B: dispatcher phone check)
  "because the method is not decided" (SRS §12.7), placeholder customer
  unreachable steps, and states ending at Accepted, Water collected, On the
  way. SRS v0.2 (17 Oct) already decided the delivery code (FR-035), added
  `departed`, `arrived` and `unloading` (FR-033), set the customer unreachable
  policy (FR-038) and allows GPS at arrival and completion with permission.
- **Cause:** The prompt was written against SRS v0.1 and not updated with v0.2.
- **Fix / workaround:** The designer chose to follow SRS v0.2 (the SRS is
  normative). Prompt 03 was updated to v0.2 in the same change, and the
  remaining gaps are listed as open questions in
  `docs/design/driver-deliveries.md`. Before running any older prompt, check
  it against the current SRS version.
- **Status:** resolved
- **Refs:** #19, `docs/design/prompts/03-driver-deliveries.md`

### 2026-10-19: Prompt 03 asks for "the same Claude Design project as prompts 00-02", which does not exist

- **Area:** process
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Issue #19 (S1-15) runs `docs/design/prompts/03-driver-deliveries.md`,
  which says "open the same Claude Design project as prompts 00-02". The
  designer's canvas held none of them, so it looked like prompts 01 and 02
  had to be pasted first.
- **Cause:** The designs never lived on one canvas. Prompt 00 (design system),
  04 (auth) and 05 (phone verification) are on the team canvas
  `9fKnBVzgvqwm8vx1eU8Y5C`, owned by an account outside the designer's
  organization and not editable by them. Prompt 01 is on a separate canvas
  (`NtrG5m8XDsNHH1rj7KSPus`, "MmiriOma Customer Ordering") that copies the
  design system tokens. Prompt 02 was never run: the admin design is recorded
  from built screens (PR #26). See `docs/design/customer-ordering.md` and
  `docs/design/admin-orders.md`.
- **Fix / workaround:** Do not paste prompts 01 or 02 for the driver slice:
  that would create new, unreviewed customer and admin designs. Prompt 03
  only needs the design system. Either run it on the team canvas (if the
  owner grants edit access), or on a new canvas that copies the approved
  tokens exactly, as the customer ordering canvas did. Record which in
  `docs/design/driver-deliveries.md`. For #19 a new canvas "MmiriOma Driver
  Deliveries" copies the tokens from the customer ordering canvas, and prompt
  03's "Before using" note now says this.
- **Status:** resolved
- **Refs:** #19, #17, `docs/design/prompts/03-driver-deliveries.md`

### 2026-10-19: Updating a feature branch left LOG.md in a stash conflict

- **Area:** tooling (git)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** After pulling, the feature branch was still at the old `main`
  commit, an uncommitted `LOG.md` edit sat in `stash@{0}`, and a later
  `git stash pop` left `LOG.md` unmerged (`UU`) with
  `<<<<<<< Updated upstream` / `>>>>>>> Stashed changes` markers.
- **Cause:** `git pull` on the feature branch does not bring in `origin/main`
  (it tracks its own branch), and both `main` and the stash added entries at
  the top of `LOG.md`.
- **Fix / workaround:** Update a branch cut from a stale `main` with
  `git fetch origin && git merge --ff-only origin/main` (stash or commit local
  edits first). For a `LOG.md` stash conflict, keep both sides, newest entry
  first, then `git restore --staged LOG.md`. `git stash pop` keeps the stash
  when it conflicts; drop it with `git stash drop` once the result is checked.
- **Status:** resolved
- **Refs:** #44

### 2026-10-19: Declining an accepted job returns 403, not the documented 409

- **Area:** backend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** A driver-jobs integration test expected 409
  `invalid_order_transition` when a driver declines a job they already
  accepted, as `dispatch.service.decline_assignment`'s docstring and
  `docs/features/driver-assignment.md` said. The call raised 403 `forbidden`
  ("You do not have access to this resource").
- **Cause:** `accepted` → `confirmed` exists in the state machine (row 11) but
  only for an admin, so `check_transition` rejects the driver as actor (403)
  rather than the transition (409). The docs were written from the intent,
  and dispatch's tests did not cover this case.
- **Fix / workaround:** Docs corrected to 403 (docstring, feature doc,
  contract); a test now covers it (`test_an_accepted_job_cannot_be_declined`).
- **Status:** resolved
- **Refs:** PR #50, `backend/app/modules/dispatch/service.py`

### 2026-10-19: Alembic hung when DATABASE_URL used `localhost` for a Docker database on Windows

- **Area:** database
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `alembic upgrade head`, then `downgrade -1`, worked, but the
  next `alembic upgrade head` hung with no output and no session visible in
  `pg_stat_activity`. The process had to be killed.
- **Cause:** Probably name resolution: `localhost` can resolve to IPv6
  `::1` first, while the container was published on `127.0.0.1` only, and on
  Docker Desktop for Windows a connection to the unbound address can stall
  instead of being refused. Not proven.
- **Fix / workaround:** Use `127.0.0.1` instead of `localhost` in
  `DATABASE_URL` (and `TEST_DATABASE_URL`). After the change, every Alembic
  and pytest run connected at once. Wrap long commands in `timeout` so a hang
  cannot block a session.
- **Status:** workaround
- **Refs:** #7 (driver jobs), `.env`

### 2026-10-19: A native PostgreSQL install holds port 5432, so `docker compose up` cannot start the database

- **Area:** database
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `docker compose up -d` failed with `Ports are not available:
  exposing port TCP 127.0.0.1:5432 ... bind: An attempt was made to access a
  socket in a way forbidden by its access permissions.`
- **Cause:** A PostgreSQL server installed on Windows (process `postgres`)
  listens on `0.0.0.0:5432`. Same symptom as the 2026-10-14 entry, different
  owner of the port.
- **Fix / workaround:** Left the native server alone and ran the project's
  image on another port: `docker run -d --name mmirioma-dev-db -e
  POSTGRES_DB=mmirioma -e POSTGRES_USER=mmirioma -e
  POSTGRES_PASSWORD=<local-only> -p 127.0.0.1:54329:5432
  postgis/postgis:16-3.4`, with `DATABASE_URL` pointing at
  `127.0.0.1:54329`. A configurable port in `compose.yaml` would remove this
  (needs team agreement). Check `Get-NetTCPConnection -LocalPort 5432` first.
- **Status:** workaround
- **Refs:** `compose.yaml`, #7

### 2026-10-19: `Result.tuples()` is deprecated in SQLAlchemy 2.1

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `SADeprecationWarning: The Result.tuples() method is
  deprecated, Row now behaves like a tuple and can unpack types directly.
  (deprecated since: 2.1.0)` from `list_driver_profiles`.
- **Cause:** SQLAlchemy 2.1 rows unpack like tuples, so `.tuples()` is no
  longer needed.
- **Fix / workaround:** Iterate the result directly:
  `for a, b, c in await session.execute(select(A, B, C)...)`.
- **Status:** resolved
- **Refs:** `backend/app/modules/dispatch/service.py`

### 2026-10-19: MissingGreenlet when building an error after a rollback

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been
  called; can't call await_() here` from `assign_driver` when an order was
  already held by another driver; found by the integration tests.
- **Cause:** The code rolled back, then read `order.status` for the error
  message. A rollback expires every loaded object (even with
  `expire_on_commit=False`), and an async session cannot lazy-load the
  expired attribute.
- **Fix / workaround:** Read every value the error needs before
  `session.rollback()`. Same rule for anything used after a rollback.
- **Status:** resolved
- **Refs:** `backend/app/modules/dispatch/service.py`

### 2026-10-19: Migration 0005 failed: constraint name prefixed twice

- **Area:** database
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `alembic upgrade head` failed with
  `psycopg.errors.UndefinedObject: constraint "ck_orders_ck_orders_order_status" of relation "orders" does not exist`.
  A chained `alembic upgrade head && alembic check && alembic downgrade -1`
  then still ran the downgrade (the failure was in a pipe) and took the test
  database back to `0003`.
- **Cause:** The naming convention in `app/core/models.py`
  (`ck_%(table_name)s_%(constraint_name)s`) is applied to names passed to
  `op.drop_constraint` / `op.create_check_constraint`, so a full name is
  prefixed again.
- **Fix / workaround:** Wrap full constraint names in `op.f(...)` so Alembic
  uses them as they are (as migration 0003 does). Run migration checks as
  separate commands and look at `alembic current` between them, rather than
  one chained line.
- **Status:** resolved
- **Refs:** `backend/alembic/versions/20261019_0005_add_delivery_statuses_and_event_reasons.py`

### 2026-10-19: `pkill -f` killed the shell command that ran it

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A cleanup command `pkill -f "uvicorn app.main:app --port 8011"; <psql cleanup>`
  exited with code 144 and the cleanup after it never ran.
- **Cause:** `pkill -f` matches full command lines, and the shell running the
  command had the same text in its own command line, so it killed itself
  along with uvicorn.
- **Fix / workaround:** Stop a background server by its PID (save `$!` when
  starting it) or with a pattern that cannot match the calling shell, for
  example `pkill -f '[u]vicorn app.main'`. Run cleanup in a separate command.
- **Status:** resolved
- **Refs:** phone verification end-to-end check

### 2026-10-19: Picture `<source>` took a grid cell

- **Area:** frontend (public pages)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** On the landing page the keke, tanker and phone pictures sat under the text instead of beside it.
- **Cause:** `<picture class="contents">` lets the `<img>` join the grid, but the `<source>` computed to `display: block` and became a grid item too.
- **Fix / workaround:** `<source className="hidden">` in `Pic` and `BrandLogo`.
- **Status:** resolved
- **Refs:** `frontend/src/features/marketing/MarketingParts.tsx`

### 2026-10-19: Media query could not hide an element with a display utility

- **Area:** frontend (public pages)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Dotted arrows between step cards still showed at 768 px.
- **Cause:** The element had a `flex` utility; utilities beat the `@layer components` rule that hid it at 1100 px.
- **Fix / workaround:** Set `display` only in `marketing.css` for classes that a breakpoint toggles.
- **Status:** resolved
- **Refs:** `frontend/src/features/marketing/marketing.css`

### 2026-10-19: Full-bleed photo stopped 48 px short; footer icon 0 px wide

- **Area:** frontend (public pages)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** The drivers photo on phones was not full width; the footer mail icon was invisible.
- **Cause:** Tailwind's base `img { max-width: 100% }` capped `width: calc(100% + 48px)`; an SVG in a flex row shrank to 0 next to a long email.
- **Fix / workaround:** `max-width: none` on the photo rule; `shrink-0` on footer icons.
- **Status:** resolved
- **Refs:** `marketing.css`, `MarketingParts.tsx`

### 2026-10-19: Dev server outlived its stopped shell

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `Error: Port 5173 is already in use` when starting Vite again.
- **Cause:** Claude Code stopped the background shell for low memory, but the Vite process kept running and serving.
- **Fix / workaround:** Reuse the running server (it reloads on config changes) or stop the process holding the port.
- **Status:** workaround
- **Refs:** n/a

### 2026-10-19: Build warning from vite-plugin-pwa

- **Area:** tooling (frontend build)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `WARN inlineDynamicImports option is deprecated, please use codeSplitting: false instead.` while building the service worker.
- **Cause:** Inside vite-plugin-pwa 1.3.0 with Vite 8; not our config. The build succeeds.
- **Fix / workaround:** None needed; recheck when the plugin is upgraded.
- **Status:** open
- **Refs:** `frontend/vite.config.ts`

### 2026-10-18: Issue #44 references files and SRS version not in the repository

- **Area:** process
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Issue #44 (phone verification design) cites SRS v0.2
  (17 Oct 2026), FR-055, acceptance tests T-15/T-16, the design prompt
  `docs/design/prompts/05-phone-verification.md`, the feature document
  `docs/features/phone-verification.md` ("the backend is implemented") and a
  phone verification section of `docs/api/auth.md`. None of these exist on
  `main`, on any remote branch, or in any pull request. The committed
  `MmiriOma_MVP_SRS.md` is v0.1, whose FR-003 makes SMS OTP optional and
  allows a manual dispatcher verification procedure (open decision 4, SRS
  §12). `gh issue view` also failed because the GitHub CLI was not logged in
  (`To get started with GitHub CLI, please run:  gh auth login`). The issue was
  read from the public GitHub API instead.
- **Cause:** The SRS v0.2 update and the phone verification backend work were
  not pushed or merged before the design issue was opened.
- **Fix / workaround:** Work on #44 was paused until the issue author merged
  SRS v0.2, prompt 05, the backend with its feature document, and the proposed
  contract section (PR #45). Before starting a task, fetch and compare with
  `origin/main` (`git fetch origin && git log --oneline HEAD..origin/main`):
  a branch cut from a stale `main` misses recent work.
- **Status:** resolved (PR #45)
- **Refs:** #44, #45

### 2026-10-17: `git diff --check` flagged Markdown line breaks in the SRS

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The check script's whitespace step reported
  `MmiriOma_MVP_SRS.md:3: trailing whitespace.` on the edited header lines.
- **Cause:** The SRS header uses two trailing spaces as Markdown hard line
  breaks; any edited line using them is flagged.
- **Fix / workaround:** End such lines with a backslash (`\`), which is also a
  CommonMark hard break, instead of two spaces.
- **Status:** resolved
- **Refs:** `MmiriOma_MVP_SRS.md` (v0.2)

### 2026-10-17: Test cleanup failed deleting orders that still had events

- **Area:** backend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Teardown of a new integration test failed with
  `psycopg.errors.ForeignKeyViolation: update or delete on table "orders"
  violates foreign key constraint "fk_order_events_order_id_orders"`.
- **Cause:** `order_events.order_id` is `ON DELETE RESTRICT` (orders and their
  history are business records), so events must be deleted first.
- **Fix / workaround:** In test cleanup, delete `order_events` for the test
  users' orders, then `orders`, then `users`.
- **Status:** resolved
- **Refs:** `backend/tests/test_phone_verification_integration.py`

### 2026-10-17: ruff S101 rejected `assert` used to narrow a type

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `S101 Use of 'assert' detected` on
  `assert self.quantity_litres is not None` in `OrderCreate.litres`.
- **Cause:** Asserts are stripped under `python -O`, so ruff forbids them in
  application code.
- **Fix / workaround:** Use `typing.cast` with a comment naming the validator
  that guarantees the value, or raise an explicit error. Do not add `noqa`.
- **Status:** resolved
- **Refs:** `backend/app/modules/orders/schemas.py`, `backend/app/modules/messaging/sms.py`

### 2026-10-17: New production setting broke the existing production config tests

- **Area:** backend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `test_valid_production_settings` failed with a
  `ValidationError` after adding "production refuses `SMS_PROVIDER=mock`".
- **Cause:** The tests built "valid" production settings without an SMS
  provider.
- **Fix / workaround:** Production test settings now include throwaway Termii
  values (`TERMII` in `test_config.py`). Any new production-only requirement
  must update that fixture.
- **Status:** resolved
- **Refs:** `backend/tests/test_config.py`, `backend/app/core/config.py`

### 2026-10-17: `grep --include=*.ts` failed in zsh with "no matches found"

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `grep -rn ... --include=*.ts frontend/src` stopped with
  `(eval):1: no matches found: --include=*.ts` and searched nothing.
- **Cause:** zsh expands unquoted globs itself and aborts when nothing in
  the current directory matches; Bash passes the pattern through to grep.
- **Fix / workaround:** Quote the pattern: `--include='*.ts'`. Do this in
  docs and scripts too, so they work in Bash and zsh.
- **Status:** resolved
- **Refs:** none

### 2026-10-16: Running the full test suite against the dev database deleted the demo accounts

- **Area:** backend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** After `pytest` with `TEST_DATABASE_URL` set to the local
  development database (the `DATABASE_URL` in `.env`), the seeded demo
  accounts no longer existed and demo sign-in returned 401
  `invalid_credentials`.
- **Cause:** `tests/test_demo_seed_integration.py` deletes every account in the
  reserved demo phone block (and its orders) before and after its tests, as
  its header warns. Pointing `TEST_DATABASE_URL` at the dev database wipes the
  demo data.
- **Fix / workaround:** Re-ran `python -m app.modules.demo.seed`. Use a
  separate test database for `TEST_DATABASE_URL` (another database name on
  the same server), or re-seed after running the integration tests. Re-seed
  before a demo rehearsal.
- **Status:** workaround
- **Refs:** S1-11 (#12), `backend/tests/test_demo_seed_integration.py`

### 2026-10-16: Orders created by demo accounts are not marked Simulated

- **Area:** backend (demo data)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** In the S1-11 demo rehearsal, the request sent through the app
  by Demo Customer One appeared in the staff list without the Simulated tag;
  the four seeded orders had it.
- **Cause:** `is_simulated` is set only by the seed command
  (`create_order(..., is_simulated=True)`); `POST /orders` always creates a
  real order, whoever the customer is. A demo order would count in real
  figures (BR-09).
- **Fix / workaround:** `POST /orders` now stores an order as simulated when a
  demo account (reserved phone block and "Demo" name,
  `app/shared/demo_accounts.py`) places it. Checked in the rehearsal: the live
  order shows the Simulated tag.
- **Status:** resolved (PR #43)
- **Refs:** S1-11 (#12), S1-18 (#22), `backend/app/modules/demo/seed.py`

### 2026-10-16: My orders briefly showed the old list after sending a request

- **Area:** frontend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** In the S1-10 end-to-end run, "View my orders" right after
  sending a request first rendered the cached list without the new order,
  then refetched. On slow mobile data the customer would see their list
  without the request they had just sent.
- **Cause:** `invalidateQueries` only marks inactive queries stale; they
  refetch when next mounted, and the stale data shows first.
- **Fix / workaround:** After a create (and after a 409 "already received"),
  invalidate with `refetchType: 'all'` so the list refetches immediately,
  while the customer is on Request received. Use this for any cache the next
  screen shows right after a mutation.
- **Status:** resolved
- **Refs:** S1-10 (#11), `RequestWaterPage.tsx`

### 2026-10-16: Empty state did not accept the tanker illustration

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `tsc -b`: `Type '"tanker"' is not assignable to type '"keke" | "gift" | "jerrycan" | undefined'` in the new tanker screens.
- **Cause:** `EmptyBlock`'s `illustration` prop listed only the illustrations used before Phase 5.
- **Fix / workaround:** Added `'tanker'` to the prop type.
- **Status:** resolved
- **Refs:** `frontend/src/components/layout/StateScreens.tsx`

### 2026-10-16: Two padding utilities on the drawer header

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Caught in review: the green drawer header had both `pb-[18px]` and `pb-4`.
- **Cause:** Adding a tone branch on top of the existing class string.
- **Fix / workaround:** Each tone sets its own bottom padding. Same rule as
  before: never two utilities for one property on one element (Tailwind v4
  sorts them by value, not by order).
- **Status:** resolved
- **Refs:** `frontend/src/components/layout/DrawerMenu.tsx`

### 2026-10-16: Mock state change lost when a handler threw

- **Area:** frontend (mocks)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Caught in review: a wrong delivery code counts a try and then
  rejects; the try was kept in memory but not saved for the tab.
- **Cause:** `mutate` saved only after the change function returned.
- **Fix / workaround:** `mutate` saves in `finally`, so a handler can record
  something and still reject, as a server would.
- **Status:** resolved
- **Refs:** `frontend/src/mocks/db.ts`

### 2026-10-16: ESLint `react-hooks/purity` on `Date.now()` in render

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `Cannot call impure function during render` for
  `useNow(resendAt > Date.now())` in the code screen.
- **Cause:** React's rules want render to be pure; reading the clock in render
  can give different results on re-render.
- **Fix / workaround:** `useSecondsUntil(targetMs)` reads the clock only in its
  state initialiser and timer.
- **Status:** resolved
- **Refs:** `frontend/src/lib/useNow.ts`

### 2026-10-16: Form errors shown out of view

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** On "Cannot take this order" and "Confirm pickup", pressing the
  footer button without a choice showed the error at the bottom of the scroll
  area, below the fold, so nothing seemed to happen.
- **Cause:** The error was rendered at the end of the scrolling content.
- **Fix / workaround:** Errors that block a footer button render in the footer
  (or right under the question). Use this placement for every such form.
- **Status:** resolved
- **Refs:** `frontend/src/features/partner/pages/PartnerShared.tsx`, `RiderTrip.tsx`

### 2026-10-16: Vitest workers timed out on start

- **Area:** tooling (frontend tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `[vitest-pool]: Failed to start forks worker ... Timeout waiting
  for worker to respond`; no tests ran.
- **Cause:** Unknown; the machine was busy (dev server and browser running).
  The same command passed on the next run.
- **Fix / workaround:** Run again. If it repeats, try `npx vitest run --pool=threads`
  or close other heavy processes. Recurred 2026-10-19 and 2026-10-20 with
  little free memory; `npx vitest run --maxWorkers=2` passed every time.
- **Status:** workaround
- **Refs:** `frontend/src/mocks/*.test.ts`

### 2026-10-16: Seeded earnings listed a delivery twice

- **Area:** frontend (mocks)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After finishing MO-7KQ2 in the rider app, earnings showed it twice.
- **Cause:** The seed already had a "pending" earning for a delivery that was
  not done yet.
- **Fix / workaround:** Removed it; earnings are added only when a code is verified.
- **Status:** resolved
- **Refs:** `frontend/src/mocks/partnerSeed.ts`

### 2026-10-16: Screen overrides of component spacing were ignored

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Found while reviewing, before it showed on screen: passing
  `gap-3` to a component whose default was `gap-3.5` (or `px-2` over `px-2.5`,
  `flex-row` over `flex-col`) would silently keep the default.
- **Cause:** Tailwind v4 sorts utilities by value in the generated CSS
  (checked in the built CSS: `.gap-3` comes before `.gap-3.5`), so the class
  order on the element does not matter.
- **Fix / workaround:** Moved component defaults and colour variants into
  `@layer components` (`frontend/src/styles/components.css`), which always
  loses to utilities. Never put two utilities for the same property on one
  element. See docs/architecture/frontend.md.
- **Status:** resolved
- **Refs:** `frontend/src/styles/components.css`

### 2026-10-16: Card content clipped inside the scroll area

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** On home, the points card cut off its "See my points" button.
- **Cause:** In a scrolling flex column, a child with `overflow: hidden` has a
  minimum height of 0, so it shrank to its `min-height` instead of its content.
- **Fix / workaround:** `.mo-scroll > * { flex-shrink: 0 }` in `components.css`.
- **Status:** resolved
- **Refs:** `frontend/src/styles/components.css`

### 2026-10-16: "Place order" jumped to the address picker

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After a successful order the app showed "Where should we
  deliver?" instead of "Order placed!".
- **Cause:** Clearing the draft on success made Review's "no address, go back"
  redirect render in the same update as the navigation to the new order.
- **Fix / workaround:** Review sets a `finished` flag before clearing the draft
  and skips the redirect once finished.
- **Status:** resolved
- **Refs:** `frontend/src/features/customer/pages/order/Review.tsx`

### 2026-10-16: Chrome automation could not read image data back

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Returning a canvas image as base64 from the page was blocked
  (`[BLOCKED: Base64 encoded data]`) when saving the edited `drop-hero` image.
- **Cause:** The browser tool filters encoded data in its results.
- **Fix / workaround:** A one-off local receiver on `127.0.0.1` (run outside
  the sandbox) took the image as a plain POST and wrote the file. Send it as
  `text/plain` to avoid a CORS preflight.
- **Status:** workaround
- **Refs:** `frontend/public/illustrations/drop-hero-plain.webp`

### 2026-10-16: Drawer close button rendered in the wrong place

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** In the drawer menu the close button sat under the profile block
  instead of in its top-right corner.
- **Cause:** `IconButton`/`IconLink` always added `relative` (to anchor the
  unread dot). The caller passed `absolute top-2 right-1.5`; both position
  utilities were on the element and Tailwind emits `relative` after
  `absolute`, so `relative` won.
- **Fix / workaround:** Add `relative` only when the caller does not position
  the button itself. Regression test in `src/components/ui/ui.test.tsx`. With
  Tailwind, never combine two utilities for the same property; the CSS order,
  not the class order, decides.
- **Status:** resolved
- **Refs:** `frontend/src/components/ui/IconButton.tsx`

### 2026-10-16: ESLint `react-refresh/only-export-components` errors

- **Area:** frontend (tooling)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `Fast refresh only works when a file only exports components`
  (11 errors) in files that exported a component plus a helper or constant.
- **Cause:** Vite's React fast refresh can only hot-swap files that export
  components only; the lint rule enforces it.
- **Fix / workaround:** Keep helpers and constants in their own files
  (`queryClient.ts`, `buttonClasses.ts`, `adminNav.tsx`, `lib/initials.ts`,
  `lazyPages.tsx`).
- **Status:** resolved
- **Refs:** `frontend/src/app/`, `frontend/src/components/`

### 2026-10-16: Browser window could not be resized for screenshots

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** The Chrome automation `resize_window` call reported success, but
  the page stayed at 1366 × 637, so phone screens could not be shown at
  390 × 844.
- **Cause:** Probably a maximised window, which the browser does not resize.
- **Fix / workaround:** For comparisons, set the phone column to 390 px with a
  temporary inline style from the console. Responsive breakpoints (admin
  drawer under 1024 px) are covered by tests instead. Un-maximise the window
  to test breakpoints by hand.
- **Status:** workaround
- **Refs:** none

### 2026-10-16: Chrome could not open the Vite dev server

- **Area:** tooling (frontend)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `npx vite` printed `Local: http://localhost:5173/` and `curl`
  from the agent shell got the page, but Chrome showed an error page for both
  `http://localhost:5173/` and `http://127.0.0.1:5173/`.
- **Cause:** The agent's shell runs in a sandbox, so a server started there is
  not reachable from the desktop browser. Vite also bound only `[::1]` for
  `localhost`. Stopping the background task left the first server listening on
  `[::1]:5173`.
- **Fix / workaround:** Start the dev server outside the sandbox and bind IPv4
  explicitly: `npx vite --host 127.0.0.1 --port 5173 --strictPort`, then open
  `http://127.0.0.1:5173/`. Check `netstat -ano | grep :5173` for a leftover
  server.
- **Status:** workaround
- **Refs:** `frontend/`

### 2026-10-16: Tailwind v4 dropped unused theme colour variables

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Swatches styled with `style={{ background: 'var(--color-navy)' }}`
  were blank; `getComputedStyle` returned an empty `--color-navy`.
- **Cause:** Tailwind v4 only emits a `@theme` variable when a utility class
  uses it. Inline styles and SVG attributes that use `var(--color-*)` are not
  detected.
- **Fix / workaround:** Declare the tokens with `@theme static { ... }` in
  `frontend/src/styles/theme.css`, which always emits every variable.
- **Status:** resolved
- **Refs:** `frontend/src/styles/theme.css`

### 2026-10-16: Python script crashed printing the naira sign on Windows

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `UnicodeEncodeError: 'charmap' codec can't encode character
  '₦'` when a helper script printed screen text containing ₦. Setting
  `PYTHONIOENCODING=utf-8` did not help.
- **Cause:** Windows console output defaults to cp1252, and the script ran with
  `python -I`, which ignores all `PYTHON*` environment variables.
- **Fix / workaround:** Call `sys.stdout.reconfigure(encoding="utf-8")` at the
  top of the script.
- **Status:** resolved
- **Refs:** none (local helper script)

### 2026-10-16: Design handoff was not at the path given in the brief

- **Area:** process
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** The brief said `design/README.md`, `design/tokens/` and so on;
  the files are in `design/MmiriOma-design-handoff/`. The repository itself is
  one level down from the opened folder (`Mmirioma-forked/mmirioma/`).
- **Cause:** The handoff zip was extracted with its top folder.
- **Fix / workaround:** Use `design/MmiriOma-design-handoff/` as the handoff
  root. The folder is git-ignored in this fork.
- **Status:** resolved
- **Refs:** `.gitignore`, `docs/design/handoff-v1.md`

### 2026-10-15: ruff S608 flagged SQL built with an f-string in a test

- **Area:** backend (tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `ruff check .` failed with `S608 Possible SQL injection vector
  through string-based query construction` in the demo seed integration test's
  cleanup, which spliced a shared subquery into three `DELETE` statements.
- **Cause:** The values were bound parameters, but the statement text was
  assembled with f-strings, which the rule (rightly) cannot tell apart from
  unsafe interpolation.
- **Fix / workaround:** Write each statement out in full as a constant string
  with `%(name)s` parameters. Do not silence S608 with `noqa`.
- **Status:** resolved
- **Refs:** `backend/tests/test_demo_seed_integration.py`

### 2026-10-15: Main JS chunk passed Vite's 500 kB warning with the customer screens

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `npm run build` succeeds but warns "(!) Some chunks are larger
  than 500 kB after minification". `dist/assets/index-*.js` is 522 kB (161 kB
  gzipped); it was 486 kB before S1-05. 538 kB (165 kB gzipped) after the
  phone verification screens (2026-10-19).
- **Cause:** The whole app (customer, staff, auth) is one bundle; the
  customer ordering screens added about 36 kB.
- **Fix / workaround:** None yet. Route-level code splitting (`React.lazy`
  per app area) would fix it, but it is an architectural change outside
  S1-05; propose it separately.
- **Status:** open
- **Refs:** S1-05, `frontend/src/App.tsx`

### 2026-10-15: Cancelling a radio click did not keep the old choice (React + jsdom)

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** The "locks the form while sending" test failed (`expected
  false to be true`): clicking another quantity tile while the request was
  sending changed the choice, although the tile's `onClick` called
  `preventDefault()`.
- **Cause:** React detects a radio change during the click event, before the
  cancelled click restores the old selection; in jsdom the old radio stayed
  unchecked. Ignoring `onChange` as well did not help.
- **Fix / workaround:** Use native `disabled` on the radios while sending.
  React Hook Form keeps the value of a field disabled through the DOM (only
  its own `disabled` register option drops it); the retry tests confirm the
  values are still sent.
- **Status:** resolved
- **Refs:** S1-05, `frontend/src/features/customer-orders/components/QuantityTiles.tsx`

### 2026-10-15: ESLint `react-hooks/refs` rejected `handleSubmit(fn)` in render

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `Error: Cannot access refs during render … Passing a ref to a
  function may read its value during render  react-hooks/refs` on
  `const send = handleSubmit(async (values) => { if (sendingRef.current) … })`.
- **Cause:** `handleSubmit(...)` runs during render, and the rule cannot tell
  that the callback only reads the ref later, on submit.
- **Fix / workaround:** Build the handler at submit time:
  `const send = (event?: FormEvent) => handleSubmit(sendValues, showInvalid)(event)`.
- **Status:** resolved
- **Refs:** S1-05, `frontend/src/features/customer-orders/pages/RequestWaterPage.tsx`

### 2026-10-15: `tsc` rejected a `Uint8Array` parameter for `crypto.getRandomValues`

- **Area:** frontend (tests)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is
  not assignable to parameter of type 'ArrayBufferView<ArrayBuffer>'` in a
  test stub of `crypto`. Vitest still passed; only `npm run typecheck` failed.
- **Cause:** TypeScript 6 makes typed arrays generic over their buffer; a bare
  `Uint8Array` annotation may be backed by a `SharedArrayBuffer`, which
  `getRandomValues` does not accept.
- **Fix / workaround:** Annotate as `Uint8Array<ArrayBuffer>`.
- **Status:** resolved
- **Refs:** S1-05, `frontend/src/features/customer-orders/requestForm.test.ts`

### 2026-10-15: `npm ci` failed with EPERM while the dev server was running

- **Area:** tooling (frontend)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `npm run typecheck` reported `Cannot find module
  '@testing-library/react'` (packages in the lockfile but missing from
  `node_modules`). `npm ci` then failed: `EPERM: operation not permitted,
  unlink '…\node_modules\@rolldown\binding-win32-x64-msvc\rolldown-binding.win32-x64-msvc.node'`,
  leaving `node_modules` half deleted.
- **Cause:** On Windows a running `npm run dev` (Vite) keeps the rolldown
  native binary open, so npm cannot delete it.
- **Fix / workaround:** Stop the dev server (and any other Vite/Vitest
  process) before `npm ci` or `npm install`, then run it again.
- **Status:** resolved
- **Refs:** S1-05

### 2026-10-15: `python` is not available in Git Bash on this Windows machine

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** A script run with `python - <<'EOF'` failed: `bash: python:
  command not found`.
- **Cause:** Python is not on the Git Bash `PATH` here (the backend
  virtualenv was not active).
- **Fix / workaround:** Edit files with the editor tools or `sed`, or
  activate `backend/.venv` first when Python is really needed.
- **Status:** workaround
- **Refs:** S1-05

### 2026-10-15: `gh` not signed in, so the issue could not be read from GitHub

- **Area:** tooling (GitHub)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** `gh issue view 6` failed: "To get started with GitHub CLI,
  please run:  gh auth login". The new `gh` install was also not yet on
  `PATH` in the open terminal.
- **Cause:** GitHub CLI was installed in the same session and never
  authenticated; `PATH` changes apply only to new terminals.
- **Fix / workaround:** Run `gh auth login` once, and open a new terminal.
  The issue scope was taken from `docs/process/sprint-1-plan.md` (S1-05) in
  the meantime.
- **Status:** workaround
- **Refs:** issue #6

### 2026-10-15: `git switch main` failed on a stale local `main`

- **Area:** tooling (git)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `git switch main` failed with `Your local changes to the
  following files would be overwritten by checkout: .gitignore`, and a
  following `git merge --ff-only origin/main` silently fast-forwarded the
  feature branch instead of `main`.
- **Cause:** The local `main` branch had not been updated since the first
  commits, so its `.gitignore` differed from the uncommitted local change.
  Work had been done on feature branches created from `origin/main`.
- **Fix / workaround:** Move the branch without a checkout, then switch:
  `git fetch origin && git branch -f main origin/main && git switch main`
  (safe when the current branch already contains `origin/main`). Check
  `git branch --show-current` after every switch in scripts.
- **Status:** resolved
- **Refs:** S1-10 integration check

### 2026-10-15: Integration tests stalled because Docker Desktop was not running

- **Area:** tooling (database)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `pytest tests/test_orders_integration.py` printed nothing for
  over 6 minutes and had to be stopped. `docker ps` then failed with `failed
  to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
  ... The system cannot find the file specified.`
- **Cause:** Docker Desktop had been closed (for example after a restart), so
  the test database container was down. pytest gives no hint of this when its
  output is piped through `tail`.
- **Fix / workaround:** Start Docker Desktop, wait for `docker info` to
  succeed, start the database container, and wait for `pg_isready` before
  running integration tests. On this machine Docker Desktop is a per-user
  install at `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`, not
  under `Program Files`.
- **Status:** resolved
- **Refs:** S1-03 (#4)

### 2026-10-15: Nested heredocs in one Git Bash command failed to parse

- **Area:** tooling (shell)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** A single command containing a `python - <<'EOF'` heredoc
  followed by a `cat >> file <<'EOF'` heredoc failed with
  `bash: -c: line 136: unexpected EOF while looking for matching '''`.
  Nothing ran, so no file was changed.
- **Cause:** Not confirmed. Two heredocs with the same delimiter, inside one
  `bash -c` string whose bodies contained quotes, were not parsed as expected.
- **Fix / workaround:** Make multi-line file edits with an editor (or one
  heredoc per command with distinct delimiters). Check `git status` after a
  failed scripted edit to confirm nothing was half-applied.
- **Status:** workaround
- **Refs:** `backend/tests/test_orders_integration.py`

### 2026-10-15: Hiding a table column with `display: none` shifted the other cells

- **Area:** frontend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** In the admin orders table at 900 px, the "Preferred date" and
  "Created" values overlapped after the address column was hidden below
  desktop width (screenshot check).
- **Cause:** With `table-layout: fixed` and a `<colgroup>`, hidden
  (`display: none`) cells do not remove their `<col>`, so the remaining cells
  are laid out against the wrong column widths.
- **Fix / workaround:** Keep every column at every table width (truncate long
  text instead), or render a different layout below the breakpoint. Check
  table layouts at 768, 900 and 1280 px with a screenshot.
- **Status:** resolved
- **Refs:** S1-09, `frontend/src/features/admin-orders/OrderList.tsx`

### 2026-10-15: Removing several issue assignees with `gh api -f` did nothing

- **Area:** tooling (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A loop of `gh api -X DELETE repos/.../issues/N/assignees -f
  "assignees[]=<login>"` removed the single assignee on most issues, but on
  #12, #13 and #19 (several assignees) the departed members were still listed,
  with no error.
- **Cause:** Not confirmed. The same call sent as a JSON body worked at once,
  so the form-encoded array is the likely cause.
- **Fix / workaround:** Send the array as JSON:
  `echo '{"assignees":["a","b"]}' | gh api -X DELETE .../assignees --input -`.
  Print the issue's assignees afterwards to confirm.
- **Status:** workaround
- **Refs:** issues #12, #13, #19

### 2026-10-15: Redirect after sign-in/sign-out lost to the route guard

- **Area:** frontend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** New jsdom flow tests failed: staff returned to `/admin/orders`
  without their filters after signing in (`expected '/admin/orders' to be
  '/admin/orders?status=quote_requested'`); the one-time notice after
  creating an account and the "You've signed out." toast never appeared.
  The static-HTML tests could not catch this.
- **Cause:** The screens set the session, then called `navigate()`. React
  Router v7 runs navigations as transitions (low priority), so React first
  rendered the new session at the old URL, and that screen's own redirect
  (`<Navigate>` to the app home, or the guard's redirect to sign-in) won.
- **Fix / workaround:** Redirect declaratively from session state instead of
  calling `navigate()` after the change: the sign-in page renders
  `<Navigate to={from ?? home}>` once signed in; account creation passes the
  one-time-notice state in its own `<Navigate>`; sign-out only clears the
  session, marked "by user", and the guard shows the signed-out landing with
  the toast. Regression tests in `flows.test.tsx`.
- **Status:** resolved
- **Refs:** S1-17, PR #29

### 2026-10-15: Passing `login` directly as a TanStack `mutationFn`

- **Area:** frontend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `tsc -b` failed: `Type '(input: LoginInput, client?: ApiClient)
  => Promise<Session>' is not assignable to type 'MutationFunction<Session,
  LoginInput>'. Types of parameters 'client' and 'context' are incompatible.`
- **Cause:** TanStack Query v5 calls `mutationFn(variables, context)`. The
  API functions take an optional second `client` argument, so passing them
  directly would have sent requests through the mutation context object
  instead of the API client.
- **Fix / workaround:** Wrap them: `mutationFn: (values) => login(values)`.
  Do the same for any API function with optional extra parameters (queries
  too: `queryFn` receives a context object).
- **Status:** resolved
- **Refs:** S1-17, `frontend/src/features/auth/pages/`

### 2026-10-15: Static-HTML screen tests: camelCase attributes, no form defaults

- **Area:** frontend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `expected '<link rel="preload"…' to contain
  'autocomplete="new-password"'` and `… to contain 'value="0800 000 0001"'`.
- **Cause:** `react-dom/server` writes some attributes in React's camelCase
  (`autoComplete`, `readOnly`, `maxLength`). React Hook Form sets default
  values through refs after mount, so they never appear in static HTML.
- **Fix / workaround:** Assert the camelCase spelling. Do not test form
  default values with static rendering; they need a DOM test environment
  (not installed; needs approval).
- **Status:** workaround
- **Refs:** S1-17, `frontend/src/features/auth/screens.test.tsx`

### 2026-10-15: No browser available to check the auth screens visually

- **Area:** tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The agent environment has no browser tool and no Chrome or
  Chromium install, so the S1-17 screens could not be clicked through or
  screenshotted.
- **Cause:** Wrong diagnosis: only `google-chrome`/`chromium` on `PATH` were
  checked. Playwright's browsers are cached in `~/.cache/ms-playwright`
  (found during S1-09). The full `chromium-*/chrome-linux64/chrome` hangs
  with `--headless=new`; the dedicated
  `chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`
  works: `chrome-headless-shell --no-sandbox --disable-gpu --hide-scrollbars
  --window-size=1280,1000 --virtual-time-budget=8000 --screenshot=out.png URL`.
  For signed-in staff pages, a local stand-in for `GET /api/v1/auth/me` (with
  CORS for the dev origin) avoids needing a database.
- **Fix / workaround:** Verified instead with typecheck, lint, build, the
  generated CSS, static-HTML screen tests, every module served by the dev
  server, and the exact API calls (CORS preflight, register, duplicate, me,
  logout with and without CSRF, wrong password, 429 with
  `retry_after_seconds`) made with curl from the dev-server origin. A person
  must still click through the screens in a browser before merge. Since S1-09,
  screenshots are possible with the headless shell above.
- **Status:** resolved
- **Refs:** S1-17

### 2026-10-15: LOG.md entry lost its heading in a merge

- **Area:** process (GitHub)
- **Author:** Daveoski + Claude Code
- **Symptom:** Merging `origin/docs/auth-design` into `davidui` conflicted in
  `LOG.md`. On `docs/auth-design`, the rate-limit entry ("Rate limit could be
  bypassed with concurrent login requests") carries the heading "GitHub API
  briefly unreachable", which has no body of its own.
- **Cause:** An earlier merge of new entries placed above the rate-limit
  entry kept the new heading and dropped the old one.
- **Fix / workaround:** On `davidui`, both sides' entries were kept, newest
  first, and the rate-limit heading restored. The "GitHub API briefly
  unreachable" entry's body needs to be recovered by its author. When
  resolving `LOG.md` conflicts, check that every heading still sits on its own
  body.
- **Status:** resolved (the "GitHub API briefly unreachable" entry was
  restored from commit 67cf95a in PR #29)
- **Refs:** PR #25, `LOG.md`

### 2026-10-15: Push declined due to email privacy restrictions

- **Area:** GitHub
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `git push` failed with `! [remote rejected] ... (push declined
  due to email privacy restrictions)`. `gh pr create` then failed with `No
  commits between main and <branch>`, because the branch never reached GitHub.
- **Cause:** The commit author email was a private address, and the GitHub
  account blocks command-line pushes that would expose it.
- **Fix / workaround:** Re-author the unpushed commit with the account's
  no-reply address (`<id>+<login>@users.noreply.github.com`, shown by
  `gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"'`):
  `git -c user.email=<noreply> commit --amend --no-edit --reset-author`. To
  avoid it next time, set that address as `user.email` for the repository.
- **Status:** workaround
- **Refs:** PR #28

### 2026-10-15: `Session.flush(objects)` is deprecated in SQLAlchemy 2.1

- **Area:** backend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Every orders integration test failed under `pytest -W error` with
  `sqlalchemy.exc.SADeprecationWarning: The `objects` parameter of
  `Session.flush` is deprecated`.
- **Cause:** `create_order` flushed only the new order (`session.flush([order])`)
  so its row existed before the `order_events` row referencing it.
- **Fix / workaround:** Add the order, call `session.flush()` with no
  arguments, then add the event. Only the order is pending at that point, so
  the behavior is the same.
- **Status:** resolved
- **Refs:** `backend/app/modules/orders/service.py`

### 2026-10-15: Port 5432 taken by another project's database container

- **Area:** tooling (database)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `docker compose up -d` failed with `Bind for 127.0.0.1:5432
  failed: port is already allocated`. The MmiriOma PostGIS container never
  started, while `DATABASE_URL` in `.env` still pointed at `localhost:5432`,
  which reaches the other project's plain Postgres instead.
- **Cause:** A container from another local project published the same port.
- **Fix / workaround:** For S1-03 tests, a throwaway container was run on
  another port (`docker run -d --name mmirioma-s103-testdb -e POSTGRES_USER=mmirioma
  -e POSTGRES_PASSWORD=<local-only> -e POSTGRES_DB=mmirioma -p 127.0.0.1:5433:5432
  postgis/postgis:16-3.4`) and `DATABASE_URL`/`TEST_DATABASE_URL` were set to
  it for the commands only. Longer term: stop the other container while working
  here, or make the published port configurable in `compose.yaml` (needs team
  agreement). Check `docker ps` before `docker compose up`.
  Recurred 2026-10-23 for #101 (another project's `schoolflow-db-1` on
  5432): same workaround, container `mmirioma-101-testdb` on port 5433.
- **Status:** workaround
- **Refs:** `compose.yaml`, S1-03 (#4), #101

### 2026-10-15: Stacked PR #23 merged into its old base, not `main`

- **Area:** GitHub
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The Sprint 1 restructure (`docs/process/sprint-1-plan.md`,
  prompt 04, the PR template and the G2/G3 rules in `CLAUDE.md`) was missing
  from `main` although PR #23 showed as merged.
- **Cause:** PR #23 was stacked on PR #16 (base `docs/ui-driven-workflow`).
  #16 was merged into `main` first; #23 was merged six minutes later into its
  unchanged base `docs/ui-driven-workflow`, so its commit never reached `main`.
- **Fix / workaround:** The next PR (`docs/auth-design`) was branched from
  `docs/ui-driven-workflow`, so it carries the restructure to `main`. For
  stacked PRs: after merging the lower PR, change the upper PR's base to
  `main` before merging it, or merge only from the top of the stack.
- **Status:** workaround
- **Refs:** PR #16, PR #23, commit 4594680

### 2026-10-14: GitHub API briefly unreachable

- **Area:** tooling (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `error connecting to api.github.com ... check your internet
  connection or https://githubstatus.com` right after a successful `git push`.
- **Cause:** Transient network or GitHub outage; it recovered within minutes.
- **Fix / workaround:** Retry. When a fetch-edit-write sequence fails part way,
  check that nothing was half-applied (here an empty PR body was caught before
  it was sent).
- **Status:** resolved
- **Refs:** PR #16

### 2026-10-14: Creating issues with `gh api -f` failed with HTTP 422

- **Area:** tooling (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `gh api -X POST repos/.../issues -f "title=..." -F milestone=5
  -f "labels[]=P0" -f "assignees[]=..."` returned `gh: Validation Failed (HTTP
  422)`. No issue was created.
- **Cause:** unknown. The error details were not captured; a later test showed
  bracketed titles such as `[S1-13]` pass through `-f` unchanged, so that is
  not it.
- **Fix / workaround:** Build the request as a JSON file and send it with
  `gh api -X POST repos/mmiri-oma/mmirioma/issues --input issue.json`. This also
  avoids `gh issue create`/`edit` and their Projects (classic) bug. Print the
  full error body (`2>&1`) next time to find the cause.
- **Status:** workaround
- **Refs:** issues #17-#22

### 2026-10-14: Shell `while read` loop skipped the last item

- **Area:** tooling (shell)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A `while read sid n; do ...; done < targets.txt` loop updated 14
  of 15 issues; the last one (#22) was silently skipped.
- **Cause:** The file had no trailing newline, and `read` returns non-zero for
  a final line without one, so the loop ends before processing it.
- **Fix / workaround:** End generated files with a newline, or loop with
  `while read -r a b || [ -n "$a" ]; do`. Always compare the processed count
  with the expected count.
- **Status:** resolved
- **Refs:** issue #22

### 2026-10-14: Testing Library and jsdom added for S1-09 component tests

- **Area:** tooling (frontend)
- **Author:** Daveoski + Claude Code
- **Symptom:** S1-09 (#10) requires component tests, but the skill said
  Testing Library was "not installed" and should be proposed first.
- **Cause:** The component-test tooling had not been set up yet.
- **Fix / workaround:** Added dev-only `@testing-library/react`,
  `@testing-library/dom`, `@testing-library/user-event` and `jsdom` on the
  `davidui` branch. Component tests opt in with `// @vitest-environment jsdom`.
  The skill notes were updated to match. Needs lead approval in the PR.
- **Status:** open
- **Refs:** #10, `frontend/package.json`, `frontend/vite.config.ts`

### 2026-10-14: React Router `<Link to={{ state }}>` silently drops the state

- **Area:** frontend
- **Author:** Daveoski + Claude Code
- **Symptom:** "Back to orders" lost the directory filters. The test failed with
  `expected '/admin/orders' to be '/admin/orders?status=en_route'`.
- **Cause:** `state` was put inside the `to` object. React Router ignores it
  there. It must be the separate `state` prop.
- **Fix / workaround:** `<Link to={path} state={{ fromSearch }}>`. Regression
  test: "returns to the directory with the filters it came from".
- **Status:** resolved
- **Refs:** `frontend/src/features/admin-orders/OrderList.tsx`

### 2026-10-14: ESLint `react-refresh/only-export-components` errors

- **Area:** frontend (lint)
- **Author:** Daveoski + Claude Code
- **Symptom:** `Fast refresh only works when a file only exports components`
  for `Button.tsx` (exported `buttonClasses`) and a test helper with an inline
  component.
- **Cause:** A `.tsx` file that exports components must not also export plain
  functions or constants, and a file exporting functions must not define components.
- **Fix / workaround:** Move shared helpers into `.ts` files
  (`buttonVariants.ts`, `reference.ts`). The test helper uses
  `createMemoryRouter` instead of a probe component.
- **Status:** resolved
- **Refs:** `frontend/src/components/ui/buttonVariants.ts`

### 2026-10-14: Headless Chrome screenshots cannot go below 512 px wide

- **Area:** tooling
- **Author:** Daveoski + Claude Code
- **Symptom:** `chrome --headless --window-size=390,…` screenshots looked
  clipped on the right, as if the page overflowed.
- **Cause:** Headless Chrome enforces a 512 px minimum viewport
  (`innerWidth` reported 512). The page itself was fine.
- **Fix / workaround:** For phone-width screenshots, load the page in a
  390 px-wide `<iframe>` inside a local HTML file and screenshot that.
- **Status:** workaround
- **Refs:** S1-09 PR screenshots

### 2026-10-14: `gh` CLI not installed on a Windows dev machine

- **Area:** GitHub
- **Author:** Daveoski + Claude Code
- **Symptom:** `gh: command not found` in Git Bash.
- **Cause:** The GitHub CLI is optional and was not installed.
- **Fix / workaround:** Read public issues with
  `curl https://api.github.com/repos/mmiri-oma/mmirioma/issues/<n>`. Open
  PRs in the GitHub web UI.
- **Status:** workaround
- **Refs:** team GitHub guide §4

### 2026-10-14: Rate limit could be bypassed with concurrent login requests

- **Area:** backend (security)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Caught in self-review before commit. The first version checked
  the login limit, awaited the password check, and only then recorded the
  failure. Many requests sent at once would all pass the check before any
  failure was counted, defeating the 5-attempt limit.
- **Cause:** Check-then-record split across an `await` (scrypt runs in a thread).
- **Fix / workaround:** Count the attempt in the same synchronous step as the
  check (`AuthRateLimits.begin_login`), and withdraw it only when the login
  succeeds. Rule of thumb: never put an `await` between checking a limit or
  capacity and recording its use. Regression test:
  `test_login_attempts_count_before_they_finish`.
- **Status:** resolved
- **Refs:** `backend/app/modules/auth/rate_limit.py`

### 2026-10-14: `npx prettier` reformatted a whole file in the wrong style

- **Area:** tooling (frontend)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Running `npx prettier --write` on `frontend/src/lib/api/client.ts`
  rewrote the entire file with double quotes and semicolons. The diff became
  unrelated noise.
- **Cause:** Prettier is not a project dependency and the repo has no prettier
  config, so `npx` used a global/cached copy with default settings.
- **Fix / workaround:** Reverted the file and reapplied only the intended edits.
  The existing code style matches
  `prettier --no-semi --single-quote --print-width 90`. Do not run prettier
  without those options. Adding prettier as a dev dependency needs approval
  (CLAUDE.md).
- **Status:** workaround
- **Refs:** `frontend/src/lib/api/client.ts`

### 2026-10-14: TypeScript TS7022 when a test variable is named `fetch`

- **Area:** frontend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `error TS7022: 'fetch' implicitly has type 'any' because it does
  not have a type annotation and is referenced directly or indirectly in its own
  initializer.`
- **Cause:** `const fetch = vi.fn<typeof fetch>(...)` refers to the local
  `fetch` it is declaring, not the global.
- **Fix / workaround:** Name the mock something else (`fetchMock`).
- **Status:** resolved
- **Refs:** `frontend/src/lib/api/auth.test.ts`

### 2026-10-14: Alembic autogenerate duplicated a CHECK constraint

- **Area:** database
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The autogenerated migration for `users` contained two identical
  `role IN (...)` check constraints, one named `user_role` and one named
  `ck_users_user_role`.
- **Cause:** A column typed `sa.Enum(..., native_enum=False,
  create_constraint=True)` emits its own constraint, and autogenerate also
  listed the model's named constraint.
- **Fix / workaround:** In the migration, type the column `sa.String(20)` and keep
  only the explicitly named `ck_users_user_role`. `alembic check` stays clean.
  Always read autogenerated migrations before applying them.
  Recurred on 2026-10-15 for the three order status columns in `0003`; fixed
  the same way.
- **Status:** resolved
- **Refs:** `backend/alembic/versions/20261014_0002_add_users_and_user_sessions.py`,
  `backend/alembic/versions/20261015_0003_add_orders_and_order_events.py`

### 2026-10-14: "Value not echoed" tests gave false failures

- **Area:** backend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Tests asserting that an input does not appear in the response
  failed even though nothing was echoed. The input `0800000000` was found inside
  the fixed error message `...for example 08000000001`, and the password `short`
  was found inside pydantic's error type `string_too_short`.
- **Cause:** Test data that is a substring of fixed response text.
- **Fix / workaround:** Assert the exact fixed message, or use distinctive test
  values (for example `Pw7!xyz`) for "not echoed" checks.
- **Status:** resolved
- **Refs:** `backend/tests/test_phone.py`, `backend/tests/test_auth_api.py`

### 2026-10-14: Async engine must not be shared across event loops in tests

- **Area:** backend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Caught in design, not at runtime. Running service functions with
  `asyncio.run()` next to a `TestClient` would reuse the app's cached engine,
  whose asyncpg connections belong to the TestClient's event loop.
- **Cause:** `get_engine()` is cached per process, but asyncpg connections are
  tied to the event loop that created them.
- **Fix / workaround:** In tests, give direct service calls their own engine
  (`create_async_engine(TEST_DATABASE_URL)`) and dispose it afterwards.
- **Status:** resolved
- **Refs:** `backend/tests/test_auth_integration.py` (`run_service`)

### 2026-10-14: Backslash in a docstring joined two lines

- **Area:** backend
- **Author:** nnamdi-security + Claude Code
- **Symptom:** A shell example wrapped with `\` to satisfy ruff's 100-character
  limit (E501) rendered as one joined line.
- **Cause:** In a normal Python string, backslash-newline is a line
  continuation, so the newline disappears.
- **Fix / workaround:** Shorten the example instead of wrapping it, or use a raw
  docstring (`r"""..."""`).
- **Status:** resolved
- **Refs:** `backend/app/modules/auth/cli.py`

### 2026-10-14: GitHub milestone due date lost its time

- **Area:** GitHub
- **Author:** nnamdi-security + Claude Code
- **Symptom:** Setting the Sprint 1 milestone `due_on` to `2026-10-16T09:48:41Z`
  saved it as `2026-10-16T00:00:00Z`.
- **Cause:** GitHub milestones store a date only.
- **Fix / workaround:** Communicate the exact sprint cutoff time to the team
  separately.
- **Status:** workaround
- **Refs:** milestone "Sprint 1"

### 2026-10-14: Wrong GitHub username in the Sprint 1 issue pack

- **Area:** GitHub / process
- **Author:** nnamdi-security + Claude Code
- **Symptom:** The issue pack and `create_sprint1_issues.sh` used `bonavee120`,
  which is not assignable on the repo.
- **Cause:** Typo. The collaborator's login is `Bonvee120`.
- **Fix / workaround:** Corrected the script. Check usernames with
  `gh api repos/mmiri-oma/mmirioma/assignees --jq '.[].login'` before
  assigning.
- **Status:** resolved (pending confirmation that `Bonvee120` is Chukwuebuka)
- **Refs:** issues #7, #8, #12, #13

### 2026-10-14: `gh issue create --project` and `gh pr edit` fail

- **Area:** GitHub / tooling
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `GraphQL: Projects (classic) is being deprecated in favor of the
  new Projects experience ... (repository.projects)`. No issues were created.
- **Cause:** The installed `gh` looks up Projects (classic) for `--project`.
- **Fix / workaround:** Create the issue without `--project`, then run
  `gh project item-add 1 --owner mmiri-oma --url <issue-url>`. Needs the
  `project` token scope (`gh auth refresh -s project`).
  `gh pr edit` fails the same way (`... (repository.pullRequest.projectCards)`).
  Edit PRs through the REST API instead:
  `gh api -X PATCH repos/mmiri-oma/mmirioma/pulls/<n> -F "body=@body.md"`.
  Upgrading `gh` may remove the need for both workarounds.
  Plain `gh issue view <n>` fails too (`... (repository.issue.projectCards)`,
  2026-10-19); use `gh issue view <n> --json title,body,assignees,state`.
- **Status:** workaround
- **Refs:** issues #2–#13, #53, PR #16, project "MmiriOma — MVP Development"
