# 2026-10-30: Customer support screens showed the [SUPPORT HOURS] placeholder

- **Area:** frontend
- **Author:** Cloudcrackamara + agent
- **Symptom:** `/support` read "Call, WhatsApp or chat with our team. Hours: [SUPPORT HOURS]" and `/support/contact` read "Our team answers during [SUPPORT HOURS]." to a real customer.
- **Cause:** The design's placeholder was copied into the screens. Support hours have no SRS rule (open question in `docs/api/admin-operations.md` 4 and `docs/api/public-site.md` 3). The admin screens had already dropped it (#217).
- **Fix / workaround:** Technical lead chose option A with new wording (G2, comment on #270): `/support` says "Call or message our team." and the line is deleted from `/support/contact`, which keeps the notice "Our support hours will be added once they are agreed." The proposed wording in the issue was not used because it claimed phone, WhatsApp and chat, and chat is not available.
- **Status:** resolved
- **Refs:** #270, `frontend/src/features/customer/pages/Support.tsx`, `frontend/src/features/customer/pages/SupportContact.tsx`
