# Phase 19A–C QA checkpoint — 25 November 2026

## Staging
- Source branch: phase-1; deployed application commit: 5fceeb253f4754c995520ec6e1c17f2a9ecd668e.
- Cloudflare Worker: crc-moh-os-staging.
- URL: https://crc-moh-os-staging.kazadijoel36.workers.dev
- Remote browser health endpoint returned status ok, matching source commit and branch.
- Root page browser check rate-limited (HTTP 429); full rendering not verified.
- Publicly reachable unindexed demo; live records require Supabase authentication. This is not an access-gated private preview.
- Snapshot deployment; redeploy manually after code changes until CI is configured. Main branch untouched.

## Permission fixture
Actual Supabase SQL functions executed under authenticated role with synthetic JWT subjects in a single rolled-back transaction:
- Platform operator detection and verified-account-only administrator bootstrap: pass.
- Second administrator bootstrap rejected: pass.
- Separate fictional campus provisioning: pass.
- Administrator permissions local to their campus: pass.
- Invitation rejected for wrong recipient; intended recipient accepted: pass.
- Ordinary member denied attendance management and self-appointment: pass.
- Group leader appointment permits own group but not another group: pass.
- Cross-campus permission and membership reads denied: pass.
- Role revocation immediately removes group permission: pass.

Post-rollback query: zero Auth users, memberships, operators, invitations and role assignments; one original church remains. No permanent fixture data or schema changes.

## Remaining before closing Phase 19A–C
- Confirm root page renders and usable on phone.
- Create verified test accounts via supported Supabase Auth interface (not SQL fixture identities).
- Authorize intended platform operator and bootstrap intended church administrator; do not assign real leadership without approval.
- Test real password authentication, invitation acceptance, sign-out and session behavior via hosted browser.
- Preserve invitation-only membership and backend authorization. No service role key in frontend.
- Full operational workflows, visual parity and production release remain pending.
