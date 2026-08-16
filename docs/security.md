# Security Model

**The security posture that exists today**, with a source citation for each control so a reviewer can verify rather than take it on faith. §8 lists what is *not* implemented — read it before treating this document as a clean bill of health.

Table and column detail is not repeated here; see [`database.md`](database.md). For what the system does functionally, see [`features.md`](features.md). For architectural rationale, see [`CLAUDE.md`](../CLAUDE.md).

---

## 1. Scope and threat model

PORAC-SDSS is a municipal operations tool with two structurally separate audiences and real data-integrity stakes: a ticket queue that drives dispatch decisions, a per-office data boundary between MEO and MDRRMO, and an audit trail intended to survive scrutiny.

The threats actually designed against, in rough priority order:

1. **Cross-office data leakage** — an MEO admin reading or acting on MDRRMO's tickets or work orders.
2. **Privilege escalation** — a non-System-Administrator reaching admin management, the activity log, or another admin's data.
3. **Cross-audience confusion** — a citizen session reaching admin routes, or admin-internal content (work-order notes, moderation notes, dispute reasons) leaking into a citizen response.
4. **Report spam and fraud** — flooding submissions, or faking location/photo evidence to misdirect municipal resources.
5. **Account enumeration and credential attacks** on login and password reset.
6. **Stale sessions after a credential change or account deactivation.**

Explicitly **out of scope for now**: nation-state adversaries, DDoS resilience, and multi-tenant isolation (one municipality per deployment).

---

## 2. Authentication

### 2.1 Two independent session systems

Admin and citizen sessions are separate JWTs (`jose`, HS256), signed with an **`aud` claim** — `'admin'` or `'citizen'`. A token minted for one audience can never half-verify as the other, even though both share `JWT_SECRET`. This is the primary structural defense for threat #3.

`api/src/auth/session.service.ts`.

### 2.2 Cookie shape

Both cookies use the same hardened shape (`admin-cookie.util.ts`, `citizen-cookie.util.ts`):

| Attribute | Value |
|---|---|
| `httpOnly` | `true` — never readable from JavaScript |
| `secure` | `true` in production (`NODE_ENV`), off locally so HTTP dev works |
| `sameSite` | `lax` |
| `path` | scoped |

The browser reaches the API through a same-origin `/api/*` rewrite (`next.config.ts`), so session cookies stay first-party. Server Components forward the incoming `Cookie` header explicitly (`lib/api-client.ts`), because server-to-server `fetch` does not carry it automatically.

### 2.3 Session lifetimes

| Session | TTL | Rationale |
|---|---|---|
| Admin | **8 hours** | Roughly one shift; a shared municipal desk shouldn't hold a session overnight |
| Citizen | **30 days** | Infrequent, mobile, outdoor use — re-login friction would suppress reporting |
| Re-authentication | **10 minutes** | Step-up window only (§4.3) |

### 2.4 Passwords

bcrypt hashing. Login failures return a **single generic error** regardless of cause — wrong password, nonexistent account, or a *deactivated* admin all produce the same message, so a login attempt cannot be used to probe whether an email exists or has been deactivated (`api/src/auth/auth.service.ts`).

### 2.5 Google OAuth

Optional (`api/src/auth/oauth/`). Omitting the Google env vars disables the option entirely — no other feature depends on it. Includes signed OAuth state (`oauth-state.service.ts`) against CSRF on the callback, and an explicit conflict path when a Google email collides with an existing local account, recorded in `citizen_audit_events` rather than silently merging identities.

### 2.6 Password reset

- Emailed token with a **30-minute default TTL** (`RESET_TOKEN_TTL_MINUTES`).
- **Enumeration-resistant:** `POST /citizens/forgot-password` always returns the same response for any well-formed email, whether or not an account exists. Unit-tested (`password-reset.controller.spec.ts`, `password-reset.service.spec.ts`). A rate-limit rejection is the one response allowed to differ.
- Expired tokens are pruned by a cleanup cron.
- Completing a reset invalidates existing sessions (§4).

---

## 3. Authorization

### 3.1 Guards

| Guard | Protects |
|---|---|
| `AdminSessionGuard` | Every `/admin/*` API route |
| `CitizenSessionGuard` | Every citizen route (`/reports/mine`, account, etc.) |
| `SystemAdminGuard` | Admin management and the activity log — System Administrator only |
| `CronSecretGuard` | All six `/cron/*` routes, via a shared bearer secret |
| `RecentReauthGuard` | Step-up-sensitive citizen actions (§4.3) |
| `OAuthRateLimitGuard` | OAuth start/callback, 10/min per IP |

`api/src/common/guards/`.

The guards are the real gate. `proxy.ts` on the Next.js side performs page-level redirects (`/admin/*` → `/admin/login`, citizen pages → `/login`) purely for UX — it is **not** the security boundary, and the API rejects independently of it.

### 3.2 Office scoping

Two helpers in `api/src/common/authz/admin-scope.ts`, used everywhere and never reimplemented inline:

- **`resolveOfficeScope`** — derives the effective office **from the session**, not from the request. For an MEO or MDRRMO admin it silently clamps to their own office regardless of what `?office=` asks for. A System Administrator may legitimately request either office or city-wide. Used on list endpoints, where silently narrowing is better UX than a 403.
- **`assertOfficeAccess`** — hard-rejects with **403** when a single resource belongs to another office. Used on reads and writes of individual tickets and work orders, where silence would be wrong.

Two properties worth stating explicitly:

- **A query parameter can never widen scope.** `GET /admin/tickets/geo`, for instance, re-derives office from the session independently of whatever the client sends, so URL-synced map filters are a UX convenience, not a trust boundary.
- **Exports reuse the list endpoints' own filter parsers** rather than a second copy. `ReportsService` calls `TicketsService.parseTicketQuery` / `WorkOrdersService.parseQuery` directly, so a CSV export cannot diverge from the equivalent list view's authorization. Only the export-specific date range is parsed separately.

Work orders are scoped by the **work order's own** `assigned_office`, not the caller's — and the assignee validation checks the target admin against that office too.

`assignedAdminId=me` on work orders resolves server-side from the caller's session, so it can't be used to enumerate another admin's assignments by id.

### 3.3 Verified by tests

Office scoping is regression-tested rather than assumed:

- A hand-crafted `?office=MDRRMO` from an MEO session returns only MEO rows — asserted for tickets, work orders, and barangay insights.
- Cross-office single-resource access returns **403** on read, update, and status change — asserted in **both** directions (MEO→MDRRMO and MDRRMO→MEO), so the enforcement isn't one-sided.
- Combining `assignedAdminId=me` with `?office=MDRRMO` still clamps to MEO.
- Unauthenticated requests to admin API routes return **401**.

`e2e/admin-rbac.spec.ts`, `e2e/admin-tickets.spec.ts`, `e2e/admin-work-orders.spec.ts`, `e2e/admin-barangay-insights.spec.ts`.

---

## 4. Session security

A stateless JWT normally cannot be revoked before it expires. Three mechanisms close that gap.

### 4.1 `session_valid_after`

Both `admins` and `citizens` carry `password_changed_at` and `session_valid_after`. On any password change or reset, `session_valid_after` is bumped to `now()`, and `SessionService` **rejects any JWT whose `iat` predates it**. This is the one place a stateless session is genuinely invalidated server-side after a credential change. `null` means "never invalidated."

### 4.2 Admin deactivation

Setting `admins.is_active = false` does two things in the **same write**: it blocks future logins, and it bumps `session_valid_after` — so an already-issued token dies within the request cycle rather than lingering up to 8 hours. Reactivation only flips the flag back; the admin logs in fresh.

A lockout guard prevents deactivating the last active System Administrator, so the system cannot be locked out of its own administration.

There is deliberately **no** `citizens.is_active` equivalent — citizens are self-service accounts and no staff-style deactivation workflow exists in the product.

### 4.3 Step-up re-authentication

`RecentReauthGuard` gates the citizen actions where a stolen live session would be most damaging — unlinking an OAuth provider, and setting a first password on an OAuth-only account. These require a **short-lived (10-minute) reauth cookie** issued moments earlier by either a fresh current-password check or a fresh provider round-trip. A valid session alone is not sufficient.

---

## 5. Rate limiting

Postgres-backed rather than in-memory, so limits survive process restarts and are shared across instances. `api/src/domain/ratelimit.service.ts`; storage tables documented in [`database.md`](database.md).

### 5.1 Report submission

Account identity is the **primary** control — it can't be evaded by switching networks the way an IP can.

| Limit | Value | Key |
|---|---|---|
| Hourly per account | **5 / hour** | `citizen_id` |
| Spatial per account | **3 within 25m / 24 hours** | `citizen_id` + PostGIS `ST_DWithin` |
| IP backstop | **20 / hour** | `ip` |

The spatial limit specifically targets the same-pothole-reported-repeatedly pattern. The IP backstop is secondary: it catches one network spinning up many accounts to route around the per-account limits.

Events are recorded **inside the same transaction** as the report insert, so only submissions that actually succeed count against the limit.

### 5.2 Admin login

| Limit | Value | Key |
|---|---|---|
| Failed attempts | **10 within 15 minutes** | normalized account email — never IP |

Counts **failed attempts only** — a successful login deletes that email's failure rows outright, rather than waiting for them to age out of the window. Keyed on email, not IP, because an IP-based total-login limit would break the E2E suite, which authenticates from one IP nearly 200 times per run (§5.6). The throttled response is the exact same generic `Invalid email or password` `401` as a normal wrong-password rejection — no distinct status, message, or header — and a failure is recorded for every rejection reason (nonexistent email, deactivated admin, wrong password), never only for real/active accounts, so the throttle itself can't become a second enumeration side-channel alongside §2.4's generic error. Checked before the admins table is even queried, so continued attempts during an active cooldown never extend it — it clears ~15 minutes after the failure that tripped it.

### 5.3 Citizen login

| Limit | Value | Key |
|---|---|---|
| Failed attempts | **10 within 15 minutes** | normalized account email — never IP |

Same shape as admin login (§5.2), for the same reasons: keyed on normalized email only (an IP-based limit would break the E2E suite's `signupCitizen()` fixtures, which log in from one shared local IP across specs), a successful login resets the counter outright, checked before the `citizens` table is even queried, and a failure is recorded for **every** rejection reason (nonexistent email, OAuth-only account with no password hash, wrong password) — never only for real accounts. Unlike admin login, the throttled response is a distinct `429` (`HttpException`/`HttpStatus.TOO_MANY_REQUESTS`, the same shape §5.1's report submission and §5.4's password reset already use) rather than a repeated `401` — this is still enumeration-safe: the record-on-every-failure symmetry means the per-email counter accumulates identically whether or not the account exists, so a `429` reveals request volume against that address, not account existence.

### 5.4 Citizen signup

| Limit | Value | Key |
|---|---|---|
| IP backstop | **20 / hour** | `ip` |

A different threat shape from login — an attacker can't repeat-attempt signup against one target email (duplicate email is already rejected by the existing account-conflict check, unrelated to rate limiting), so the control is IP-only, no email component. The threshold intentionally mirrors §5.1's report-submission IP backstop (same value, same reasoning): the E2E suite creates roughly 17 disposable citizen accounts from one IP in a full run (one per disposable-ticket fixture across several specs), so a materially lower threshold would break the suite before its own report-limit backstop ever would. An attempt is recorded for every request that clears the check itself, regardless of whether it goes on to hit the duplicate-email conflict or succeed.

### 5.5 Password reset

| Limit | Value | Key |
|---|---|---|
| Per email | **3 / hour** | normalized email |
| Per IP | **10 / hour** | `ip` |

Both must pass. Crucially, an attempt is recorded **for every request, including emails with no account** — otherwise the enumeration-resistant identical response would let an attacker probe many addresses without ever consuming the email limit.

### 5.6 OAuth

**10 requests/minute per IP** on OAuth start/callback (`OAuthRateLimitGuard`). This one is **in-memory, not Postgres-backed** — a deliberate, marked tradeoff: OAuth abuse doesn't need to survive a restart the way report spam does. It assumes a single instance; see §8.

### 5.7 Retention

`POST /cron/cleanup-rate-limit-events` prunes all five rate-limit tables past a 30-day window. Safe because the longest window any live check consults is 24 hours.

### 5.8 The E2E caveat

A full Playwright run posts roughly 17 real reports (and creates a similar number of disposable citizen accounts, §5.4) and will exhaust the 20/hour IP backstops if repeated within the hour. **This is the control working correctly.** There is deliberately **no test-only bypass, env flag, or relaxed limit** — the documented workaround is targeted spec runs. See [`README.md`](../README.md) §I.

---

## 6. Audit logging

### 6.1 `admin_audit_events`

An append-only trail of administrative actions: account create / role change / deactivate / reactivate, ticket status changes and reassignments, report moderation, work-order create / update / status change, and admin login/failed-login (`admin_login` / `admin_login_failed`).

Three properties that matter:

- **Transactional for mutations, best-effort for login events.** Every mutation action type is written via `AdminAuditService.logInTx` / `logInPgTx` in the same transaction as the state change — a failed audit insert rolls back the whole action, and the trail is treated as load-bearing. `admin_login` / `admin_login_failed` are the one exception: written via `AdminAuditService.logBestEffort`, outside any transaction, because a login has no accompanying state-change transaction to join. Errors are caught and logged (never rethrown), so a broken audit insert can never block a legitimate admin login.
- **Actor snapshot at write time.** `actor_name` / `actor_role` / `actor_office` are copied in, so history reads correctly even after the admin row is later edited.
- **Field names, never contents.** Updates log *which* fields changed — e.g. `notes`, `dueDate`, `assignedAdminId` with `{from, to}` ids — never note bodies. Login events never record the password, any part of it, its length, the session token, or any cookie value.

A failed login against a **nonexistent email** is deliberately **not** audited: there is no admin row to attribute an `actor_admin_id` to (that column is `NOT NULL`), and inventing a synthetic id was rejected as the same schema-shape hack disallowed for export audit logging (§6.3). Only failed attempts against an existing admin account are recorded. See `AuthService.adminLogin` for the exact decision and reasoning.

Visible only to System Administrators, via `/admin/activity-log` behind `SystemAdminGuard`. Covered by `e2e/admin-activity-log.spec.ts` and asserted for work orders in `e2e/admin-work-orders.spec.ts`.

### 6.2 `citizen_audit_events`

A separate trail for the citizen's own Account & Security actions: provider linked/unlinked, password set/changed, and rejected link attempts due to email collision. Deliberately **not** merged with the admin trail — different actors, different event vocabularies, different audiences (this one is citizen-self-service; the other is System-Administrator-only).

### 6.3 Not audited

Read-only CSV exports are **not** audited. This was evaluated and skipped: the audit schema requires a concrete `targetId`/`targetType` per event, and a filter-driven export has no single target to attach one to. Revisit if a real "who exported what" compliance requirement appears.

---

## 7. Data separation and privacy

### 7.1 Internal content never reaches citizens

Work-order fields — **especially `notes`** — moderation notes, and citizen dispute *reasons* are staff-only. Enforcement is structural rather than presentational:

- No `api/src/citizens/*` response type includes any work-order field.
- The work-order CSV export **excludes `notes` at the query level**, not by filtering after selection.
- `e2e/admin-work-orders.spec.ts` creates a work order with a sentinel note and asserts it never appears anywhere on the citizen's report page.
- `e2e/citizen-dispute.spec.ts` asserts the citizen's own dispute reason is not rendered back to them, and that no `work_order` / `moderation_note` text leaks onto the page.

### 7.2 Citizens see only their own reports

`GET /reports/mine` and every per-report route check ownership and existence in a **single clause** (`WHERE r.id = ... AND r.citizen_id = ...`), so a wrong id and someone else's id are indistinguishable to the caller — no probing an id space for existence.

### 7.3 Server-computed values are never client-trusted

Elevation is always computed server-side from the DEM by nearest-neighbour lookup, never accepted from the request. Barangay is resolved server-side from geometry. Urgency and priority are computed server-side; client-side copies of the scoring math exist only for badge display and are never authoritative.

### 7.4 Admin directory exposure is minimal

`GET /admin/admins/directory` — reachable by MEO/MDRRMO so an assignee picker can be populated — returns only `{id, name, email, office, role}` for **active**, **officer/supervisor** accounts. Never password or session-security columns, never inactive rows, never System Administrator rows. The stricter `SystemAdminGuard` on `AdminsController` is unchanged.

---

## 8. Known limitations and pending hardening

Stated plainly. None of the following is implemented. For an assessed, prioritized plan of what to fix and in what order, see [`security-hardening-plan.md`](security-hardening-plan.md).

### 8.1 Pending

- **Monitoring and alerting** — none. No error tracking, no uptime checks, no alert routing.
- **Backup verification** — no tested restore procedure.
- **Load and performance validation** — no load testing has been performed.
- **Credential rotation** — deliberately gated on an actual deployment decision.
- **Deployment runbook** — no hosting platform is committed anywhere in this repo.

### 8.2 Accepted limitations

- **The OAuth rate limiter is in-memory** and therefore per-process. It assumes a single instance and resets on restart — marked as a known ceiling in the code. The report and password-reset limiters do not share this weakness.
- **Ticket escalation fires once per ticket, ever.** Re-escalation after a stall recurs is a deliberate non-goal for now.
- **No per-request CSRF token.** Defense rests on `sameSite=lax` cookies plus the same-origin `/api/*` rewrite. Adequate for the current shape; worth revisiting if a cross-origin client is ever added.
- **`JWT_SECRET` is shared** between the Next.js and NestJS apps by necessity — both verify the same cookies. Compromise of either app's environment compromises both. The `aud` claim limits blast radius across audiences but not across apps.
- **One municipality per deployment.** There is no tenant isolation; office scoping is the only data boundary.

### 8.3 Standing rules

Two constraints that must survive future changes:

- **No test-only security bypass, ever.** Rate limits, guards, and scoping behave identically under test. When the E2E suite trips a limit, the suite changes — not the control.
- **Any new endpoint must use the scope helpers.** An `/admin/*` route that forgets `resolveOfficeScope` or `assertOfficeAccess` is a cross-office data leak, not a UI bug.

---

## 9. Transport

`next.config.ts`'s `headers()` applies four static response headers to every route (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`) — closing the clickjacking gap against destructive single-click admin controls (status advance, office reassignment, deactivation). The permissions denied are ones the app never calls (verified against the app source; the report form's pin comes from EXIF GPS or a manual map click, never `navigator.geolocation`). Set on the Next.js side only, since it serves the HTML — the API returns JSON to a same-origin proxy and needs no `helmet`. **No Content-Security-Policy yet** — deliberately staged separately in `Report-Only` mode first, since a blocking CSP would break Leaflet tiles, Cloudinary images, and Next's inline styles if shipped blind.
