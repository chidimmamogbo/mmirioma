# 2026-10-30: Order draft survived sign-out and hid the address field

- **Area:** frontend
- **Author:** Cloudcrackamara + agent
- **Symptom:** After customer A signed out and customer B signed in, in the same tab, B's delivery details showed A's receiver name and phone. With no saved addresses, B saw no address field, and "Continue" did nothing and showed no error.
- **Cause:** `features/customer/order/draft.ts` keeps the draft in `sessionStorage` (`mmirioma.orderDraft.v1`) with no account id, and only `reset()` after a successful order cleared it. `DeliveryDetails` trusted `draft.address_id` even when it was not one of the account's addresses.
- **Fix / workaround:** `useLogout`, `useLogin` and `useRegister` call `clearDraft()`. `DeliveryDetails` replaces a draft `address_id` that is not in the account's saved addresses with the default address, or the new-address form. Option A from the issue; no draft format change.
- **Status:** resolved
- **Refs:** #272, `frontend/src/features/auth/useSession.ts`, `frontend/src/features/customer/pages/order/DeliveryDetails.tsx`
