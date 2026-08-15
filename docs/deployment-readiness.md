# Deployment Readiness

**A checklist of what must be true before PORAC-SDSS can be considered production-ready — not a record that it has been deployed.**

Nothing in this repository has been deployed. No hosting platform is chosen, no production database exists, no domain is registered, and no sending domain is verified. This document separates what the codebase already handles from the decisions and operational work that remain, so the gap is visible rather than assumed.

**Read this alongside:** [`README.md`](../README.md) §C–§E (setup and env vars — not repeated here), [`security.md`](security.md) (controls that exist), [`security-hardening-plan.md`](security-hardening-plan.md) (what to fix and in what order), [`testing.md`](testing.md) (how to verify), [`database.md`](database.md) (schema).

---

## 1. Status

| | |
|---|---|
| **Application code** | Feature-complete for the current roadmap; see [`features.md`](features.md) |
| **Hosting platform** | **Not decided.** No `Dockerfile`, no `vercel.json`, no `render.yaml`, nothing |
| **Production database** | Not provisioned |
| **Domain** | Not registered |
| **Email sending domain** | Not verified |
| **Monitoring** | Not selected |
| **Backups** | Not configured or tested |
| **Runbook** | Not written |

`PLAN.md`'s references to Render are historical prototype-era notes, not a current decision. This document deliberately does not invent a platform — several items below (proxy trust depth, network exposure, TLS termination) cannot be resolved correctly until one is chosen, and guessing would produce a runbook for infrastructure that may never exist.

---

## 2. Required runtime services

Six things must exist and be reachable. Only the first three are strictly required for the app to function at all.

| Service | Required? | Notes |
|---|---|---|
| **Next.js frontend** | Yes | Serves all UI. Proxies `/api/*` to the API via `next.config.ts`'s rewrite, which is what keeps session cookies first-party. `API_ORIGIN` must point at the deployed API. |
| **NestJS API** | Yes | Owns the database, auth, PostGIS, and triage. Binds `0.0.0.0:PORT` (default 3001). **Must not be publicly reachable independently of the frontend proxy** — see §7. |
| **PostgreSQL with PostGIS** | Yes | PostGIS is not optional; geometry columns, `ST_*` functions, and GiST indexes are core to barangay resolution, deduplication, and elevation lookup. |
| **Cloudinary** | Yes, in practice | All report and resolution photos. `CLOUDINARY_URL` is validated at boot, so the API will not start without it. |
| **Email provider (Resend)** | No | Optional. Without `RESEND_API_KEY` the app falls back to `ConsoleEmailService`, which logs a masked confirmation instead of sending. Password reset then works but delivers nothing. See §5. |
| **Scheduler** | Yes, for correctness | GitHub Actions today (`.github/workflows/cron.yml`). Any scheduler that can issue authenticated POSTs would do. See §6. |

---

## 3. Environment variables

**Do not duplicate the tables** — [`README.md`](../README.md) §C Step 4 lists every variable for both env files, matching `api/src/config/env.ts`'s Zod schema. The API validates at **boot**, so a missing or malformed required variable fails startup immediately rather than at first request.

Production-specific concerns, beyond simply setting the values:

| Variable | Production concern |
|---|---|
| `JWT_SECRET` | Must be a strong random value of at least 32 characters, and **byte-identical in both env files** — the Next proxy and the API verify the same cookies. Never reuse the development value. A rotation invalidates every active session, which is acceptable but should be timed. |
| `CRON_SECRET` | At least 16 characters. Must match the value in GitHub Actions secrets exactly, or every scheduled job fails (§6). |
| `DATABASE_URL` | The API uses the **direct/unpooled** endpoint, not a pooled one. Advisory locks in the merge transaction and long-lived connections do not behave correctly through a transaction pooler. |
| `CLOUDINARY_URL` | Contains the API secret. Rotate the development credential before production — the same account should not serve both. |
| `RESEND_API_KEY` + `EMAIL_FROM` | **Both or neither.** The service factory constructs `ResendEmailService` when `RESEND_API_KEY` is present, and that constructor throws if `EMAIL_FROM` is missing — so setting the key alone is a startup failure. See §5. |
| `WEB_ORIGIN` | Used to build absolute URLs in password-reset emails, OAuth redirects, and notification links. Wrong value means users receive links pointing at the wrong host. Not a CORS setting. |
| `API_ORIGIN` / `INTERNAL_API_URL` | Frontend → API origins. Both default to `http://127.0.0.1:3001` and **must** be changed for any non-local deployment. |
| `NODE_ENV=production` | Gates the `secure` flag on session cookies. Without it, cookies are issued without `Secure` over HTTPS. |
| OAuth (`GOOGLE_*`, `OAUTH_STATE_SECRET`) | Optional. If enabled, the redirect URI must be registered with Google for the production domain. Omit all of them to disable Google login entirely. |
| `TARGET_*` | Municipality config. Porac defaults are correct; only change to target a different LGU, and set identically in both env files. |

**Never commit any of these.** Both `.env.example` files document the shape without real values, and should stay that way.

---

## 4. Database readiness

**Done in the codebase:**

- Migrations exist and are documented in dependency order — [`README.md`](../README.md) §D. Order is load-bearing: `import:barangays` must precede `migrate:geometry`, and `seed:dem` must precede `migrate:config`.
- Schema is documented table by table in [`database.md`](database.md).
- Application-layer safety is sound: all queries parameterized, no cascade deletes, no destructive application deletes outside expiry-driven cleanup jobs (verified in [`security-hardening-plan.md`](security-hardening-plan.md) §2).

**Pending:**

- [ ] Provision a production PostGIS database and run the full migration sequence in the documented order.
- [ ] Seed reference data: barangay polygons, DEM points, city boundary. These are not optional — barangay resolution and elevation scoring fail without them. Run `verify:config` and `verify:city-boundary` afterward.
- [ ] Create the first `system_admin` via `seed:admin`. **Do not use demo credentials.**
- [ ] Configure automated backups.
- [ ] **Verify a restore actually works.** An untested backup is not a backup — this is the single most commonly skipped item on this page.
- [ ] Decide a retention and point-in-time-recovery window.

**Deferred until hosting is chosen:** connection limits and pooling strategy, IP allowlisting, and any Neon-specific configuration. Neon is what development uses; nothing commits production to it.

**Never run the test suite against a production database.** The E2E suite writes real reports, tickets, and accounts, and `seed:diverse-reports` `TRUNCATE`s `reports` and `tickets`. See [`testing.md`](testing.md).

---

## 5. Email readiness

**How it behaves today:** the provider is chosen at startup — `ResendEmailService` if `RESEND_API_KEY` is set, otherwise `ConsoleEmailService`. Password reset, and any other email path, works either way; only actual delivery differs.

**`ResendEmailService` never throws on a send failure.** It logs the provider's error name and message — never the reset URL or token — and returns. This is deliberate: a provider outage must not break the password-reset flow's enumeration-resistant response, and must not leak whether an address exists.

**Consequence for development:** Resend rejects sending to addresses outside the account owner's until a domain is verified. Local attempts to email fabricated `@porac.ph` addresses will return a provider error (typically 403) that is **logged, not thrown**. That is the provider declining, not an application failure, and no code change is warranted.

**Pending:**

- [ ] Register a domain and verify it with Resend (DNS: SPF, DKIM).
- [ ] Set `EMAIL_FROM` to an address on that verified domain — and set it **together with** `RESEND_API_KEY` (§3).
- [ ] Set `WEB_ORIGIN` to the production frontend origin so reset links resolve.
- [ ] Send one real end-to-end password reset to a non-owner address and confirm delivery, including that the link works.
- [ ] Decide whether notification emails beyond password reset are in scope. **Undecided.**

---

## 6. Scheduled jobs

`.github/workflows/cron.yml` runs daily at **18:00 UTC (02:00 Asia/Manila)** — deliberately low-traffic hours for this system's users — and can also be triggered manually via `workflow_dispatch`. One schedule covers all six jobs; each is cheap and idempotent, so splitting them buys nothing.

| Endpoint | What it does |
|---|---|
| `POST /cron/recompute-urgency` | Recomputes urgency for active tickets. A safety net — this also happens inline on dashboard/ticket loads. |
| `POST /cron/recompute-weather` | Refreshes the cached precipitation reading that feeds urgency. Also a safety net. |
| `POST /cron/cleanup-password-reset-tokens` | Deletes expired reset tokens. **No other trigger.** |
| `POST /cron/cleanup-notifications` | Prunes read notifications past retention; unread are kept regardless of age. **No other trigger.** |
| `POST /cron/cleanup-rate-limit-events` | Prunes both rate-limit tables past 30 days. **No other trigger.** |
| `POST /cron/check-ticket-escalations` | Flags active tickets older than 7 days with no work order that ever reached in-progress or completed, and notifies the office once per ticket. **No other trigger.** |

All six sit behind `CronSecretGuard` and are called with `Authorization: Bearer $CRON_SECRET`. The workflow uses `curl -sf`, so an HTTP error fails the step visibly rather than passing silently.

**Pending:**

- [ ] Set repository variable `PORAC_API_BASE_URL` to the deployed API origin (**no trailing slash**).
- [ ] Set repository secret `CRON_SECRET` to the exact value of the deployed API's `CRON_SECRET`.
- [ ] Trigger the workflow manually once after deploying and confirm all six steps pass.
- [ ] Decide whether a failed run should alert anyone. Today it fails silently apart from the Actions UI — see §9.

Until the API is deployed and reachable, this workflow runs on schedule and fails on every step with a connection error. **That is expected, not a bug to fix locally.**

---

## 7. Security readiness

**Already implemented** — full detail in [`security.md`](security.md): separate admin/citizen JWT systems with audience separation; httpOnly/SameSite cookies with `secure` in production; server-side session invalidation via `session_valid_after`; admin deactivation that kills live sessions in the same write; six guards including office scoping enforced from the session rather than query parameters; three layers of Postgres-backed rate limiting; a transactional admin audit trail; and curated citizen DTOs that exclude internal content.

**Shipped** — tracked with severity and scope in [`security-hardening-plan.md`](security-hardening-plan.md); all five are done, not pending:

- [x] **Failed-login throttling (R1, High).** Per-account cooldown backed by `admin_login_rate_limit_events` — see [`security.md`](security.md) §5.2.
- [x] **HTTP security headers (R2, Medium).** `next.config.ts` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` — see [`security.md`](security.md) §9.
- [x] **Free-text length bounds (R3, Medium).** Admin notes, resolution notes, dispute/rejection/referral reasons all carry length caps in `api/src/contracts/schemas.ts`, matching the pattern already used for report submission.
- [x] **Login audit events (R4, Medium).** `admin_login`/`admin_login_failed` action types write to `admin_audit_events` — see [`security.md`](security.md) §6.
- [x] **Admin SSR error boundary (R10).** `app/admin/error.tsx` — see §3/§4.2 of [`project-status.md`](project-status.md). Not deployment-gated; this shipped independently of any hosting decision.

**Deployment-topology dependent — cannot be resolved before a platform is chosen:**

- [ ] **Review `trust proxy` depth.** `api/src/main.ts` sets `trust proxy: 1`, correct for exactly one hop (the Next rewrite). Adding a CDN or load balancer changes the hop count, and a wrong depth lets a forged `X-Forwarded-For` spoof the client IP — defeating the IP-keyed report and password-reset limits. Re-derive it against the real topology and record the reasoning.
- [ ] **Ensure the API is not publicly reachable** independently of the frontend proxy. It binds `0.0.0.0`, which is correct for local development and must be constrained at the network layer in production.
- [ ] **TLS termination and HSTS**, and confirm session cookies carry `Secure` in the live environment.
- [ ] **Rotate every credential** away from development values (§3).

---

## 8. Testing before deployment

Full reference: [`testing.md`](testing.md).

- [ ] `pnpm --prefix api test` — 36 unit spec files, no database needed.
- [ ] `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm --prefix api build`. These five are what CI already gates on; **CI does not run Playwright.**
- [ ] Targeted E2E on anything the change touched, especially `admin-rbac.spec.ts` and `admin-password.spec.ts` for auth work — neither creates reports, so both are safe to repeat.
- [ ] **One** full Playwright run before deploying: `pnpm exec playwright test -- --workers=1`.

**Do not run the full suite back-to-back.** It posts ~17 real reports against a 20/hour per-IP backstop, so a second run within the hour fails with 429 on report creation. Wait out the hour or run targeted specs. **Do not add a test-only bypass** — that prohibition holds through deployment.

- [ ] Run against a staging database, never production (§4).
- [ ] After deploying, manually verify the flows E2E cannot reach in production: a real password-reset email, Google OAuth against the production redirect URI, and one real photo upload to Cloudinary.

---

## 9. Monitoring and operations

**Nothing here exists yet.** This is the least-developed area of the project, and honestly so.

- [ ] **Error tracking** — no service is integrated. Today a server-side failure surfaces only in whatever log stream the host provides.
- [ ] **Uptime monitoring** for both the frontend and the API.
- [ ] **Alerting** — including for failed cron runs (§6), which currently fail silently outside the Actions UI.
- [ ] **Log retention and access** — decide what is kept, for how long, and who can read it. Note that audit trails live in the database, not in logs, and inherit the database's backup policy.
- [ ] **Backup verification** — a scheduled, *tested* restore (§4).
- [ ] **Credential rotation procedure** — which secrets, how often, and the session-invalidation impact of rotating `JWT_SECRET`.
- [ ] **Written deployment runbook** — deploy steps, rollback, migration procedure against a live database. Deliberately not written yet; it cannot be accurate before a platform exists. Do not create `docs/runbook.md` until then.
- [ ] **Incident response** — who is contacted, and how a citizen-data issue would be handled. Undefined.

---

## 10. Production readiness checklist

Consolidated. Checked boxes reflect application-level work already shipped (§7's R1–R4/R10); everything else — infrastructure, secrets, cron, and topology-dependent items — has not been done and needs an actual deployment target first.

**Database**
- [ ] PostGIS-enabled production database provisioned
- [ ] Full migration sequence run in documented order
- [ ] Reference data seeded (barangays, DEM, city boundary) and verified
- [ ] First `system_admin` created with non-demo credentials
- [ ] Automated backups configured
- [ ] **Restore tested**
- [ ] Retention and PITR window decided

**Secrets**
- [ ] `JWT_SECRET` strong, byte-identical across both env files, not the dev value
- [ ] `CRON_SECRET` set and matching GitHub Actions
- [ ] `DATABASE_URL` using the direct/unpooled endpoint
- [ ] Cloudinary credentials rotated for production
- [ ] `NODE_ENV=production` set
- [ ] `API_ORIGIN` / `INTERNAL_API_URL` / `WEB_ORIGIN` set to real origins
- [ ] No secret committed to the repository

**Email**
- [ ] Sending domain registered and verified (SPF, DKIM)
- [ ] `EMAIL_FROM` on the verified domain, set together with `RESEND_API_KEY`
- [ ] One real password reset delivered and the link confirmed working

**Cron**
- [ ] `vars.PORAC_API_BASE_URL` set, no trailing slash
- [ ] `secrets.CRON_SECRET` matches the API
- [ ] Manual `workflow_dispatch` run passes all six steps
- [ ] Failure alerting decided

**Security**
- [x] Failed-login throttling implemented (R1)
- [x] HTTP security headers added (R2)
- [x] Free-text length bounds added (R3)
- [x] Login audit events added (R4)
- [x] Admin SSR error boundary implemented (R10)
- [ ] `trust proxy` depth re-derived for the real topology
- [ ] API not publicly reachable independently of the proxy
- [ ] TLS/HSTS configured; `Secure` cookies confirmed live
- [ ] All development credentials rotated

**Testing**
- [ ] Unit tests, typecheck, lint, and both builds pass
- [ ] One full Playwright run passes against a staging database
- [ ] Post-deploy manual verification: email, OAuth, photo upload

**Monitoring**
- [ ] Error tracking integrated
- [ ] Uptime monitoring for frontend and API
- [ ] Alerting configured, including cron failures
- [ ] Log retention decided
- [ ] Runbook written
- [ ] Incident response process defined

---

## 11. Explicitly not decided

Open decisions. Each blocks part of the checklist above, and none should be guessed at in documentation.

| Decision | Blocks |
|---|---|
| **Hosting platform** (frontend, API, or both) | Nearly everything in §7 and §9 |
| **Production database provider and plan** | §4 backups, connection limits, PITR |
| **Domain name** | Email verification, OAuth redirect URI, `WEB_ORIGIN` |
| **Email sending domain and address** | §5 in full |
| **Monitoring and error-tracking provider** | §9 |
| **Backup and restore schedule** | §4 |
| **Whether notification emails ship beyond password reset** | §5 scope |
| **Who operates this after handoff** | §9 incident response, credential rotation ownership |

---

## 12. Maintenance

Update this file as items are completed or decisions are made — check boxes rather than deleting lines, so the trail of what was decided and when stays visible. When a hosting platform is chosen, this document is the input to the runbook, not a replacement for it.
