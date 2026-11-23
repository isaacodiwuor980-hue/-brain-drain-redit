# Browser smoke test plan

Status: UNVERIFIED for production. Run only on an approved isolated environment with two synthetic accounts and no personal content. Never enable experimental ranking, staking or penalties for this test.

- Sign in and out, refresh, and confirm one account cannot see or modify the other's private data.
- Check home and following feeds, and verify that a failed follow is shown as a failure rather than as a successful follow. Current live schema mismatch is a known blocker; do not assume following works.
- Exercise privacy opt-out and clearing saved interests, including a reload and queued requests. Inspect only synthetic traffic and avoid recording tokens or personal data.
- Check basic posting, reactions and profile operations with both accounts; verify persistence and isolation. UUID identity handling is not yet consistent, so failures must be reported rather than worked around by inventing mappings.
- Inspect the browser console and network status for failures without copying credentials or sensitive payloads. Record environment, date, aggregate results and any issue; do not call an isolated smoke test proof of live RLS.
