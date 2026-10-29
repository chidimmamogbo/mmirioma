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

- Reviewers: @chidimmamogbo, @nnamdi-security and @Cloudcrackamara, for any
  part of the repository (`.github/CODEOWNERS`). **One approval suffices**, so
  a PR never waits on one person (owner's decision, 2026-10-27).
- An author never approves their own PR, design or contract.
- A contract is agreed (G3), and a new screen approved (G2), by one reviewer
  who is not its author; the document names who and when.

## Not in the backend yet

Everything the contracts cover is linked (see
[linking-handoff.md](linking-handoff.md)). These have no endpoint, and each
has a flag in `frontend/src/lib/features.ts`. With the real API the menu entry,
button or route is hidden, or the screen says "not connected yet"; mock mode
shows them all.

| Area | Proposal issue |
| --- | --- |
| Push notifications | #8 (not in the MVP) |
| Customer points, profile photo | #11 (out of the MVP: no endpoint, no rule in the SRS, privacy notice) |
| Partner documents upload, earnings, payouts | #14 (out of the MVP) |
| Admin stations | #18 (stations stay on the command-line tool) |
| Admin: order for a customer, mark phone verified, adjust points, add rider, payments page | #221 (no admin endpoint; the Cash page replaces payments) |
| Rider payouts, saving settings | #22 (not proposed: payouts are out of the MVP, settings come from backend configuration) |
