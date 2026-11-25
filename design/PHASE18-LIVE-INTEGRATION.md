# CRC Potchefstroom — Phase 18 Supabase staging integration

## Immutable design baseline
- Approved user-facing master: `design/potch-master.html`, initially committed as `0fec7d481540f45d87bc951d5a859ff565e6bdf7`.
- The original master markup/CSS/animations/screens were preserved. Exactly one external script loader was appended before `</body>`.
- Adapter: `design/potch-live.js`, which activates ONLY when the URL includes `?live=1`.
- Default URL without `live=1` is the original **fictional offline preview**, not a production ministry app.

## Backend
- Existing Supabase project: `tkiwlptybfmaduulovbg` (`CRC MoH OS`).
- Potchefstroom church ID: `debd20d7-ab61-490e-ab73-1d37b55cb389` (currently draft).
- Uses public Supabase publishable key only, **never** the service-role/secret key.
- Real data comes from `moh16_*` tables / existing `moh16_*` RPC endpoints. Authorization remains at backend RLS / RPC checks.

## Live staging: connected workflows
- Supabase Auth: sign-in, sign-up, reset email and persisted session.
- Requires active `moh16_memberships` row before entering live dashboard. An authenticated but unapproved user sees an access-pending state.
- Loads `moh16_dashboard` and `moh16_get_configuration`. Uses the real account display name, placement, assigned roles and service schedule. Fake roster is cleared for live mode.
- Sunday poll: real `moh16_availability` reads and `moh16_submit_availability` writes. Both AM and PM values are submitted separately through their existing validated RPC; recheck each outcome.
- Academy: published course and unit reads, verified attempt records, secure server-generated questions from `moh16_start_assessment`, server grading via `moh16_submit_assessment`.
- Notifications: own `moh16_notifications`, marking read via `moh16_read_notification`.
- Display name editing: `moh16_save_identity`, with Supabase identity re-read on subsequent login.

## Deliberate non-production gates
- Untouched demo mode remains a demo. Do not claim demo analytics, allocations, identities or campus setup are live.
- In `?live=1`, unsupported routes (reports, attendance, duties, uniform checkout, leadership management, other campuses, etc.) are **blocked** instead of writing fake or local-only data.
- Potchefstroom real membership and placements still need to be provisioned through authorized onboarding; do not automatically self-assign a church or leadership role.
- Original hard-coded visual history is neutralized in live mode until verified records are available.
- No staging deploy, production release, or authenticated end-to-end test has been claimed.

## QA and remaining work
1. Verify the site is serving the current `phase-1` branch's `design/` folder. The GitHub commit alone is not a deployment.
2. Add the deployed staging origin and exact `?live=1` redirect URL to Supabase Auth redirect allowlist for email confirmations and password resets.
3. Provision a real test account and approved membership/placement through authorized ministry administration; verify sign-in, session restore, RLS tenant isolation and role restrictions on two devices.
4. Test all poll scenarios (AM, PM, both, unavailable), closed windows, cancellations and partial multi-service failures.
5. Test Academy assessment start, submit, retry cooldown, final prerequisites and valid published course content.
6. Integrate remaining verified role-scoped modules, remove demo placeholders from live views, and run desktop/mobile regression checks.
7. Only after real account QA should live staging replace the demo entry point.
