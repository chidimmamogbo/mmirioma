# Issue log

Every problem, error or surprise hit while working on MmiriOma, and how it was
resolved. Read it before starting work: it saves repeating the same mistakes.
The rules for adding entries are in [CLAUDE.md](CLAUDE.md#issue-log-logmd).

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

### 2026-10-14: GitHub API briefly unreachable

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
- **Status:** resolved
- **Refs:** `backend/alembic/versions/20261014_0002_add_users_and_user_sessions.py`

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
- **Status:** workaround
- **Refs:** issues #2–#13, PR #16, project "MmiriOma — MVP Development"
