# Security Hardening Plan

**Purpose.** Decide what to fix next, and in what order. [`security.md`](security.md) describes the posture that exists; this file assesses it, separates real code risks from acceptable limitations, and proposes right-sized work.

Every finding below was verified by reading code, not inferred from documentation. Findings that turned out to be non-issues are recorded in §2 rather than omitted, so a reviewer can see what was checked.

---

## 1. Executive summary

**The system is already reasonably protected for its threat model.** The controls that matter most for a municipal reporting tool — office data separation, citizen data ownership, SQL injection resistance, upload validation, and a transactional audit trail — are implemented consistently and, in the case of office scoping, regression-tested in both directions. This is not a system with a gaping hole in it.

Three things are genuinely worth fixing, in this order:

1. **No failed-login throttling.** The only defenses on admin login are bcrypt's cost and a generic error message. Admin emails follow a predictable pattern that is published in the README (`meo@porac.gov.ph`), so an attacker does not need to guess the username. This is the largest real gap.
2. **No HTTP security response headers.** Neither `next.config.ts` nor the NestJS bootstrap sets any. The admin console can be framed by any origin, which makes clickjacking against destructive admin controls (status advance, reassign, deactivate) possible.
3. **Unbounded free-text on several write paths.** Report submission is properly bounded by Zod; the admin-side and dispute free-text fields are not.

Everything else is either already adequate, a documented and acceptable limitation, or correctly deferred until a hosting platform is chosen.

**What this plan deliberately does not recommend:** MFA, WAF, SIEM, SSO, per-request CSRF tokens, dedicated secret-management infrastructure, or a third-party penetration test. §5 explains why each is not justified at this stage.

---

## 2. Verified as sound — no action needed

Recorded so this ground is not re-audited later.

| Area | Finding | Evidence |
|---|---|---|
| **SQL injection** | No risk found. Zero uses of `sql.unsafe()`, zero string-concatenated queries. All ~30 raw SQL sites use `postgres.js` tagged templates, where `${}` is a bind parameter, not interpolation. Everything else goes through Drizzle. | `git grep` across `api/src/**`; `moderation.service.ts`, `tickets.service.ts`, `barangay.service.ts`, `ratelimit.service.ts` |
| **XSS** | No risk found. Exactly one `dangerouslySetInnerHTML` in the tree — stock shadcn `chart.tsx`, injecting CSS custom properties from a developer-authored config object. No user-supplied content reaches it. React escapes everything else. | `components/ui/chart.tsx:95` |
| **File upload** | Both upload paths enforce an 8 MB cap and a MIME allowlist (`image/jpeg|png|webp`) via `ParseFilePipe`. Storage is Cloudinary, not the app filesystem, so uploaded content is never served from the app origin. | `reports.controller.ts:55–66`, `tickets.controller.ts:95–101` |
| **Referential integrity** | No `onDelete: cascade` anywhere — the default restrict behavior means a citizen with reports cannot be silently deleted. Application code never deletes citizens, admins, reports, or tickets; deletes are confined to OAuth identity unlink and three expiry-driven cleanup jobs. Admin removal is soft (`is_active`). | `api/src/db/schema.ts`, `account.service.ts:129`, `ratelimit.service.ts:176` |
| **CORS** | CORS is never enabled, so NestJS's restrictive default applies: no `Access-Control-Allow-Origin` is emitted and no cross-origin credentialed read succeeds. `WEB_ORIGIN` is used only to build absolute links in emails and redirects, never to widen CORS. | `api/src/main.ts`, `git grep WEB_ORIGIN` |
| **CSRF** | Adequate as-is — see §4.1. All 33 state-changing endpoints are `POST`/`PATCH`/`DELETE`; browsers do not attach `SameSite=Lax` cookies to cross-site requests using those verbs. No `GET` performs a security-relevant mutation. | All `*.controller.ts`; `admin-cookie.util.ts`, `citizen-cookie.util.ts` |
| **Citizen object access** | Ownership and existence are checked in a single clause (`WHERE r.id = … AND r.citizen_id = …`), so a nonexistent id and another citizen's id are indistinguishable to the caller — no id-space probing. | `reports.service.ts:491, 533, 592` |
| **Citizen data exposure** | DTOs are hand-curated with explicit exclusion comments; `moderation_note`, `moderated_by`, and all work-order fields are absent by construction, and `is_merged` is derived rather than exposing ticket internals. | `reports.service.ts:51–95` |
| **Audit coverage** | Complete for admin mutations, including the one I expected to be missing: ticket status changes are audited as `ticket_status_advanced` **and** written to `status_history`. Also covers admin create/role/password/deactivate/reactivate, reassignment, moderation, and the full work-order lifecycle. All transactional. | `tickets.service.ts:536, 633`; `git grep actionType:` |
| **Report input validation** | Properly bounded: `title` 1–200, `description` ≤ 2000, category and severity as enums, lat/lng range-checked before the authoritative PostGIS containment test. | `api/src/contracts/schemas.ts` |

---

## 3. Risk table

| ID | Area | Risk | Current control | Sev | Like. | Recommended action | Right-sized scope | Files | Test needed |
|---|---|---|---|---|---|---|---|---|---|
| **R1** | Auth | Online password guessing against a known admin email. Admin address format is published in README §G. | bcrypt cost; generic error message. **No attempt counter, no backoff, no lockout.** | High | Medium | Per-account failed-attempt throttling with a temporary cooldown. Count **failures only**, reset on success. | Reuse the existing Postgres rate-limit pattern. No new service, no MFA. ~1 migration + ~40 lines. | `api/src/auth/auth.service.ts`, `api/src/domain/ratelimit.service.ts`, one migration, `docs/database.md`, `docs/security.md` | API test: N failures → cooldown; success resets. Must not break E2E (see §4.2) |
| **R2** | Transport | No security response headers. Admin console is framable by any origin → clickjacking against destructive controls. | None. | Medium | Medium | Add `headers()` to `next.config.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. **Defer CSP** to R7. | ~12 lines of config, no runtime code, no new dependency. | `next.config.ts` | E2E: assert the four headers on an admin route |
| **R3** | Validation | Unbounded free-text lets an authenticated user write arbitrarily large strings: `work_orders.title`/`notes`, `tickets.resolution_notes`, `tickets.dispute_reason`, moderation `note`. | Type and non-empty checks, `.trim()`. **No maximum length.** | Medium | Low | Add `.max()` bounds matching `reportSchema`'s existing style. | A handful of guard lines in existing validation blocks. No schema change needed. | `work-orders.service.ts`, `tickets.service.ts`, `reports.service.ts`, `moderation.controller.ts` | Unit test: over-length input → 400 |
| **R4** | Auth audit | Login events — successful or failed — are not audited. A compromised admin account leaves no authentication trail. | `admin_audit_events` covers mutations only. | Medium | Low | Add an `admin_login` / `admin_login_failed` audit action. Natural companion to R1, which already computes the signal. | One new action type on the existing table. No new table, no new endpoint. | `api/src/auth/auth.service.ts`, `admin-audit.service.ts`, `docs/database.md` | API test: failed then successful login both produce rows |
| **R5** | Rate limiting | `app.set('trust proxy', 1)` is correct for exactly one hop (the Next rewrite). Behind an additional CDN or load balancer the hop count changes, and a forged `X-Forwarded-For` could then spoof the client IP — defeating the IP-keyed report and password-reset limits. | Correct today; fragile under a deployment topology that does not exist yet. | Medium | Low *(today)* | **Defer to deployment.** Re-derive the trust depth once hosting is chosen, and record it in the runbook. Do not guess now. | Zero code now. One config line plus a runbook note later. | `api/src/main.ts`, future runbook | Deployment smoke check that the observed client IP is real |
| **R6** | Rate limiting | OAuth limiter is in-memory: per-process, resets on restart, ineffective across instances. | 10/min per IP, single-instance assumption, marked in code. | Low | Low | **Leave as-is for now.** OAuth abuse is additionally bounded by Google's own limits, and the app is single-instance. If it ever runs multi-instance, port it to the existing `rate_limit_events` pattern — the table and service already exist. | Zero now; ~20 lines later, reusing existing infrastructure. | `oauth-rate-limit.guard.ts` | Only if ported |
| **R7** | Transport | No Content-Security-Policy. | None. | Low | Low | Add CSP **in `Report-Only` mode first**, after R2. Leaflet tiles, Cloudinary images, and Next's inline styles all need allowances, so a blocking CSP shipped blind will break the map. | Deliberately a separate, later task from R2 — this is the part that breaks things. | `next.config.ts` | Manual: map, report form, and image rendering still work |
| **R8** | Testing | No E2E asserts that citizen A cannot read citizen B's report. The control is correct in code but has no regression test. | Single-clause ownership check (§2). | Low | Low | Add one API-level test to an existing citizen spec. | ~15 lines in an existing file. No new fixture strategy. | `e2e/citizen-reports.spec.ts` | Is the test |
| **R9** | Availability | The API binds `0.0.0.0`, so it is reachable independently of the Next proxy. Locally harmless; in production the API must not be publicly exposed. | None — appropriate for local dev. | Medium *(prod only)* | N/A today | **Defer to deployment.** Network-level concern, resolved by the hosting topology, not by app code. | Zero code. A runbook requirement. | `api/src/main.ts`, future runbook | Deployment check |
| **R10** | Resilience | Admin SSR error boundary — **done.** A transient Next → NestJS failure no longer replaces the admin app, including the login form, with the framework error screen. | `app/error.tsx` (root, catches layout throws) and `app/admin/error.tsx` (page-level, parity with the citizen side), both using `unstable_retry()`. `settleAdminPage` stays as defense-in-depth. | Medium | Medium | Shipped — see [`project-status.md`](project-status.md) §3. | Small; see the roadmap entry. | `app/error.tsx`, `app/admin/error.tsx` | Manual: API stopped, then restarted, retry recovers without reload |

---

## 4. Priority phases

### Phase 1 — fix soon (high value, low/medium complexity)

| | | |
|---|---|---|
| **R1** | Failed-login throttling | The one gap a security reviewer will find first |
| **R2** | Four security headers | Best value-to-effort ratio in the entire plan |
| **R3** | Free-text length bounds | Cheap, and prevents a whole class of nuisance |
| **R4** | Login audit events | Natural companion to R1; the signal is already computed |

All four are small, self-contained, and carry no deployment dependency. R1 and R4 are best done together.

### Phase 2 — important, can wait

| | | |
|---|---|---|
| **R8** | Citizen cross-account access test | Control is already correct; this locks it in |
| **R7** | CSP, `Report-Only` first | Do only after R2, and expect iteration |
| **R10** | Admin SSR error boundary | Done — see §3 of `project-status.md` |

### Phase 3 — after a hosting decision

Do not start these before a platform is chosen; every one of them depends on the topology. These items are also tracked, alongside the non-security deployment work, in [`deployment-readiness.md`](deployment-readiness.md).

- **R5** — re-derive `trust proxy` depth for the real hop count.
- **R9** — ensure the API is not publicly reachable independent of the proxy.
- TLS/HSTS termination, and `secure` cookies verified in the live environment.
- Credential rotation (`JWT_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `CLOUDINARY_URL`).
- Neon-specific posture: connection limits, IP allowlisting, PITR/backup verification. **Deliberately not designed now** — Neon is what development uses, but no hosting commitment exists in this repo.
- Monitoring, alerting, and a written deployment runbook.

### Explicitly deferred — not worth doing now

- **R6** OAuth limiter persistence — the existing constraint is honest and the impact is minimal at single-instance scale.
- Per-request CSRF tokens — see §5.1.
- MFA/2FA, SSO/SAML, WAF, SIEM, secret-management infrastructure, third-party penetration testing, rate-limit dashboards, anomaly detection. See §5.5.

---

## 5. Why these recommendations are right-sized

### 5.1 CSRF: `SameSite=Lax` is sufficient — no token needed

`security.md` lists "no per-request CSRF token" as a limitation. Having inventoried all 33 state-changing endpoints, **that limitation is acceptable and needs no fix**:

- Every state-changing endpoint uses `POST`, `PATCH`, or `DELETE`. Browsers do not attach `SameSite=Lax` cookies to cross-site requests with those methods, so a cross-origin forgery arrives unauthenticated and is rejected by the session guard.
- The one case `Lax` permits — top-level cross-site `GET` navigation — reaches no endpoint that mutates security-relevant state. Urgency recompute does fire on some `GET`s, but it is idempotent and destroys nothing.
- CORS is not enabled, so no cross-origin script can read a response even if it could send one.

Adding double-submit tokens would mean touching every mutating form and fetch, plus special handling for the OAuth callback and multipart uploads — real ongoing maintenance for no marginal protection. **Recommendation: document the reasoning and move on.** Revisit only if a `GET` mutation or a cross-origin client is ever introduced.

### 5.2 Login throttling: per-account failure counting, not enterprise auth

The right-sized fix is a **failed-attempt counter per account with a temporary cooldown**, reusing the Postgres-backed pattern that already exists for reports and password resets. No MFA, no CAPTCHA, no device fingerprinting, no lockout requiring administrator intervention (which is itself a denial-of-service vector against a municipality's own staff).

Three design constraints that keep it right-sized and safe:

1. **Count failures only, and reset on success.** A per-IP limit on *total* logins would break the E2E suite, which authenticates in nearly every one of ~200 tests from a single IP. Counting only failures leaves a green suite untouched — **no test bypass, no weakened control**, which is the standing rule in `security.md` §8.3.
2. **Temporary cooldown, self-clearing.** Minutes, not a permanent lock. Availability for municipal staff matters as much as attacker friction.
3. **Preserve enumeration resistance.** The throttled response must not reveal whether the account exists. Keep the existing generic message.

### 5.3 Security headers: ship the safe four, defer CSP

`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` are static values that cannot break Leaflet, Cloudinary, or file uploads. A Content-Security-Policy *can* break all three, which is exactly why it is split into R7 and staged through `Report-Only` first. Shipping a blocking CSP in the same change would be the over-engineered move — and the one most likely to be hastily reverted.

No `helmet` dependency is needed on the API: it serves JSON to a same-origin proxy, and the headers that matter belong on the Next.js responses that actually render HTML.

### 5.4 Database security is mostly a deployment question

The application-layer database posture is already sound (§2): parameterized queries throughout, no cascade deletes, no application-initiated destructive deletes. What remains — connection limits, IP allowlisting, backup verification, PITR, credential rotation — is **entirely a function of where this is hosted**, and nothing in this repo commits to a platform. Designing a Neon-specific hardening procedure now would mean writing a runbook for infrastructure that may never exist. **Deferred to Phase 3, deliberately.**

### 5.5 What is explicitly not needed now

| Not recommended | Why |
|---|---|
| **MFA / 2FA** | Meaningful only once R1 exists and passwords are the proven weak point. Adds enrollment, recovery, and lockout flows — substantial ongoing complexity for a small, known set of staff accounts. Revisit if the system handles a real citizen population in production. |
| **WAF** | Nothing to put it in front of yet, and it would mask rather than fix R1/R2. |
| **SIEM / centralized log aggregation** | `admin_audit_events` already provides the queryable trail for this scale. Basic monitoring (Phase 3) comes long before this. |
| **SSO / SAML** | Would require an LGU identity provider that has not been specified. |
| **Secret-management infrastructure** | Two `.env` files with one shared value is manageable. Rotation procedure (Phase 3) matters more than tooling. |
| **Penetration test** | Fix Phase 1 first; a test now would report R1 and R2 and little else. |

---

## 6. Next recommended implementation task

### Failed-login throttling for admin accounts (R1), with login audit events (R4)

**Why this first.** It is the only High-severity item in the table, and the one a reviewer or panel is most likely to probe. The attack needs no username discovery — README §G publishes the `meo@porac.gov.ph` / `mdrrmo@porac.gov.ph` pattern, and a deployed instance would use the same convention. Today, nothing but bcrypt's cost stands between an attacker and unlimited guesses against a known address. Every other finding is Medium or lower, deferred to deployment, or already correct.

It is also right-sized rather than novel: `RateLimitService` already implements exactly this shape twice (report submission, password reset), with a table, a retention policy, and a cleanup cron. This extends a proven pattern instead of introducing a mechanism.

R4 rides along because the failure signal it needs is computed by R1 anyway — writing it to the existing audit table is a few extra lines, not a second project.

**Out of scope:** MFA, CAPTCHA, permanent lockout requiring admin intervention, citizen-side login throttling (citizens have no privileged access and no published address convention), IP-based *total* login limits, any change to the generic-error enumeration resistance, and any test-only bypass.

**Exact implementation prompt:**

```
Add failed-login throttling for admin accounts, plus login audit events.

Do not edit unrelated app code. Do not weaken any existing control. Do not
add a test-only bypass or env flag. Do not commit or push. Do not run the
full Playwright suite.

Read first: api/src/auth/auth.service.ts, api/src/domain/ratelimit.service.ts,
api/src/admin/admin-audit.service.ts, docs/security.md §2/§5, docs/database.md.

Implement:

1. Failed-login throttling, following the existing RateLimitService pattern
   (Postgres-backed, not in-memory — same reasoning as the report limiter).
   - Key on the normalized account email, NOT on IP. Count FAILED attempts
     only; a successful login must clear/reset the counter.
     This is deliberate: the E2E suite authenticates in nearly every one of
     ~200 tests from a single IP, and an IP-based total-login limit would
     break it. Counting only failures leaves the suite green with no bypass.
   - Suggested starting values (state them in the code as tunable, and
     document them): 10 failures within 15 minutes triggers a 15-minute
     cooldown. Pick the final numbers deliberately and justify them in a
     comment.
   - The cooldown response MUST preserve enumeration resistance: it must not
     reveal whether the account exists. Match the existing generic message
     shape in auth.service.ts, which already returns the same error for a
     wrong password, a nonexistent account, and a deactivated admin.
   - Reuse the existing table if its columns fit; add a migration for a new
     table only if they genuinely do not. If you add one, follow
     api/scripts/migrations/ conventions, add the pnpm script, and update
     BOTH README §D and CLAUDE.md's setup order — those lists must stay
     complete.
   - Extend the existing cleanup cron (POST /cron/cleanup-rate-limit-events)
     to prune the new rows, matching the current 30-day retention rationale.

2. Login audit events on the existing admin_audit_events table.
   - Add admin_login and admin_login_failed action types.
   - Follow the existing AdminAuditService conventions exactly: actor
     snapshot at write time, field names never secret values, and never log
     the attempted password or any part of it.
   - A failed login for a NONEXISTENT email has no admin row to attribute an
     actor to. Decide how to handle that (skip the event, or record it
     without an actor) and state the reasoning in a comment — do not invent
     a synthetic admin id.

3. Tests (API/unit level, not full Playwright):
   - N failed attempts trigger the cooldown.
   - A successful login before the threshold resets the counter.
   - The cooldown response is indistinguishable from a normal failure.
   - Audit rows are written for both outcomes.
   Then run ONLY e2e/admin-password.spec.ts and e2e/admin-rbac.spec.ts to
   confirm existing auth behavior still passes. Do not run the full suite.

4. Documentation, in the same change:
   - docs/security.md: add the control to §5 (Rate limiting) and the audit
     types to §6; REMOVE "no failed-login lockout" from §8.2, since it will
     no longer be true.
   - docs/security-hardening-plan.md: mark R1 and R4 done.
   - docs/database.md: only if a table or column was added.

Constraints:
- Do not mark the admin SSR error boundary (R10) as completed; still pending.
- Do not touch office scoping, the guards, or citizen auth.
- Keep the diff proportionate — this extends an existing pattern, it is not
  a new subsystem.

Verify with: git diff --check, plus pnpm --prefix api test.
```

---

## 7. Maintenance

Update this file when a risk is resolved, re-scoped, or newly discovered. A hardening plan that lags the code is worse than none — mark items done rather than deleting them, so the reasoning stays auditable.
