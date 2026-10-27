# 2026-10-27: the FAQ copy guard failed on "works for 10 minutes"

- **Area:** frontend
- **Author:** chidimmamogbo (+ Claude Code)
- **Symptom:** `npx vitest run` failed two tests in `src/features/marketing/marketing.test.tsx` after the #107 FAQ rewrite: `expected 'how do i place an order? open the cus…' not to match /sealed|track your rider live|schedule…/`, and `filterFaqs('PAYSTACK', 'All')` returned `[]`.
- **Cause:** the guard bans "minutes" (no delivery-time promises), and the new delivery-code answer said the code "works for 10 minutes". The search test used "Paystack", which the FAQ no longer mentions.
- **Fix / workaround:** the FAQ says the code "is valid for a short time only" (the Terms keep the exact 10 minutes, from FR-035 and the privacy notice). The search test uses "cash on delivery", and the guard now also bans "paystack", "points" and "payout".
- **Status:** resolved
- **Refs:** #107
