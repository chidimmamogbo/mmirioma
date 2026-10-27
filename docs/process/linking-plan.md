# Linking plan (team fork)

How five developers link the new-design frontend to this fork's backend in
parallel. Rules that apply to every task are in
[CLAUDE.md](../../CLAUDE.md#team-fork-workflow-read-first); this file holds
the lanes. Every task is an issue in the
[Linking MVP milestone](https://github.com/chidimmamogbo/mmirioma/milestone/1).

## Lanes

Each lane follows one backend module from start to finish, so no two
developers need the same endpoint. #5 comes first: it sets up the mapping
guide and the example adapter every link issue copies.

| Lane | Owner | Issues | Fork functions | Client in `frontend/src/lib/api/` | Files the lane owns |
| --- | --- | --- | --- | --- | --- |
| A. Auth and account | @chidimmamogbo | #5 setup, #6 link, #7 design, #8 contracts | `features/auth/authApi.ts`, phone verification | `auth.ts`, `phoneVerification.ts` | `features/auth/*`, `docs/architecture/api-mapping.md`, `features/customer/real/auth*.ts` |
| B. Customer orders | @Daveoski | #9 link, #10 price contract, #11 contracts | `customerApi.ts`: `createOrder`, `listOrders`, `getOrder` | `orders.ts` | order lines of `customerApi.ts`, `features/customer/real/*` |
| C. Rider and driver jobs | @Bonvee120 | #12 link, #13 link, #14 contracts | `partnerApi.ts`: job functions | `driverJobs.ts` | job lines of `partnerApi.ts`, `features/partner/real/*` (except `cash*`) |
| D. Admin orders and dispatch | @Cloudcrackamara | #15 link, #16 link, #17 link, #18 contracts | `adminApi.ts`: order and dispatch functions | `adminOrders.ts`, `adminDispatch.ts`, `adminHolds.ts`, `adminConfirmation.ts` | order lines of `adminApi.ts`, `features/admin/real/orders*.ts` |
| E. Cash and payments | @nnamdi-security | #19 link, #20 link, #21 backend price, #22 contracts | `adminApi.ts`: payment functions; driver cash | `adminCash.ts`, `driverCash.ts` | payment lines of `adminApi.ts`, `features/admin/real/cash*.ts`, `features/partner/real/cash*.ts`, `backend/app/modules/pricing/` |
| All | @chidimmamogbo | #23 end-to-end run | | | |

Lanes D and E both edit `adminApi.ts`, but different lines, so their merges
stay clean. A change to a shared file (`frontend/src/domain/*.ts`,
`docs/architecture/api-mapping.md`, `docs/api/*`) goes in its own small PR.

## Dependencies

| Issue | Waits for | Why |
| --- | --- | --- |
| Every link issue | #5 | One mapping guide and adapter pattern for all lanes |
| #13 job steps | #12 | Steps act on jobs loaded by #12 |
| #16, #17 | #15 | Dispatch and holds open from the order detail |
| #20 driver cash | #7 | The screens do not exist until #7 is approved (G2) |
| #21 backend price | #10 | The contract must be agreed (G3) first |
| `getQuote` in #9 | #21 | The backend returns no price until then |
| #23 end-to-end | #9, #13, #16, #19 | Runs the whole journey |

An issue labelled `blocked` waits on its "Depends on" line; remove the label
when those issues close.

## Review

- `frontend/`: @chidimmamogbo, backup @nnamdi-security.
- `backend/` and `docs/api/`: @nnamdi-security, backup @chidimmamogbo.
- A contract is agreed when both have approved it. A new screen is approved
  (G2) by @chidimmamogbo.
- The technical lead (@nnamdi-security) may also agree a contract (G3) or
  approve a design (G2) alone. The pull request that records it still needs
  a code owner other than its author (branch protection).

## Not in the backend yet

These screens keep their mocks and show "not connected yet" against the
real API until a contract is agreed and the endpoint is built in this fork.

| Area | Proposal issue |
| --- | --- |
| Change password, push notifications, public site | #8 |
| Order price | #10 (built in #21) |
| Customer profile, addresses, notifications, support, feedback, account deletion | #11 (backend in #82, PRs #87, #91, #96, #100; screens to be linked in #103) |
| Customer points | #11 (out of the MVP: no endpoint, the screen stays "not connected yet") |
| Partner profile, going online, documents, sign-up, earnings, payouts | #14 |
| Admin customers, riders, stations | #18 (customers and drivers to be built in #45; stations stay on the command-line tool) |
| Admin service areas | #18 (built in #30; screen linked in #74) |
| Admin price lists | #18 (built in #37; screen needs the redesign in #44 first) |
| Dashboard, live map, reports, support, audit log, notifications, settings | #22 (contract agreed; backend to be built in #102) |
| Rider payouts, saving settings | #22 (not proposed: payouts are out of the MVP, settings come from backend configuration) |
