# Security Model

## Current safety boundaries

Audit is append-only; `actor_role`/`admin_role` remain permanently. Account/office/Focal fields authorize access, never the role mirror. Preserve eligible Reported-ticket Focal grouping, tested public-map fields and citizen/internal separation. Focal and System Admin have no assessment/Work Order authority. Production inventory is not deletion permission: real migration/archive/seed operations are owner-only; standard Playwright setup/teardown on the verified copy is the sole agent seed exception. Never expose credentials or edit the owner's api/.env.

[Known limitations](known-limitations.md) covers context-refresh audit gaps, same-office Work Order CSV assignee email, lock-order risks and unverified connection recovery. A green suite does not prove multi-session concurrency or outage recovery.

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

Because the two systems are independent, **one browser can legitimately hold both cookies at once** — a staff member signed into `/admin` who then signs into the citizen portal in the same browser. `GET /auth/me` (`api/src/auth/auth.controller.ts`) therefore resolves each cookie separately and returns `{ admin, citizen }`, either side nullable, 401 only when neither resolves. It must never collapse to a single "admin first, else citizen" principal: `lib/api-client.ts`'s `getAdminSessionFromApi()`/`getCitizenSessionFromApi()` each read their own field, and an admin-first response made the citizen field unreachable — every citizen page (`/dashboard`, `/map`, `/reports`) rendered "Sign in to continue" for a dual-cookie browser even though `proxy.ts` (which checks only the citizen cookie) had already admitted the request. Note that `NotificationsController.resolvePrincipal` still does resolve admin-first, deliberately — it serves one notification feed and has no second field to return; a dual-cookie browser sees the admin feed in both shells.

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
| `OperationalStaffGuard` | Every operational controller (Tickets, Work Orders, Dashboard, Map, Moderation, Reports) — operational Personnel only (`PERSONNEL`, not Focal); rejects both Focal Personnel and the System Administrator |
| `FocalGuard` | The Focal Intake surface (`admin/intake/*`) — Focal Personnel only (`PERSONNEL` with `is_focal`); rejects operational Personnel and the System Administrator alike |
| `PersonnelGuard` | The staff Merge / Remove / Regroup actions (`admin/ticket-grouping/*`, manuscript revision Phase 3, step 3d) and category / location correction (`admin/ticket-corrections/*`, step 3e) — operational Personnel **and** Focal Personnel; rejects the System Administrator. Per-ticket rules stay in `api/src/admin/ticket-grouping.rules.ts` and `ticket-corrections.rules.ts`: operational Personnel only on their own office's tickets, Focal only while every ticket involved is `Reported` with no active Work Order |
| `CronSecretGuard` | All six `/cron/*` routes, via a shared bearer secret |
| `RecentReauthGuard` | Step-up-sensitive citizen actions (§4.3) |
| `OAuthRateLimitGuard` | OAuth start/callback, 10/min per IP |

`api/src/common/guards/`. Since manuscript revision Phase 2, step 2e every guard and scope helper decides from the Appendix H account fields — `account_type` (`PERSONNEL` | `SYSTEM_ADMIN`), `office` and `is_focal` — via `isSystemAdmin` / `isFocalPersonnel` / `isOperationalPersonnel` (`api/src/common/authz/admin-scope.ts`; same names in `lib/utils/adminScope.ts` for UI gating). `admins.role` is only a sync mirror that nothing reads for access; the session carries `accountType`/`isFocal`/`office` and no role, and a token without `accountType` is rejected. The old `officer` and `supervisor` had identical permissions everywhere and are both plain Personnel. `api/src/common/authz/access-parity.spec.ts` pins that every old role × office combination gets exactly the same decisions after the switch. `OperationalStaffGuard`/`FocalGuard` are additive to `SystemAdminGuard`, not a replacement for it — the System Administrator has zero routine operational authority (Batch 1 removed its prior city-wide operational bypass entirely) and Focal Personnel, despite always carrying `office: 'MDRRMO'`, is never treated as MDRRMO operational staff.

The guards are the real gate. `proxy.ts` on the Next.js side performs page-level redirects (`/admin/*` → `/admin/login`, citizen pages → `/login`) purely for UX — it is **not** the security boundary, and the API rejects independently of it.

### 3.2 Office scoping

Two helpers in `api/src/common/authz/admin-scope.ts`, used everywhere and never reimplemented inline:

- **`resolveOfficeScope`** — derives the effective office **from the session**, not from the request. For an MEO or MDRRMO admin it silently clamps to their own office regardless of what `?office=` asks for. **Only operational Personnel get an office scope at all** (Batch 1) — Focal Personnel and the System Administrator are rejected outright with a 403, not silently narrowed; System Administrator's prior "either office or city-wide" access was a genuine bypass this removed, not a legitimate case to design around. Used on list endpoints, where silently narrowing an operational admin is better UX than a 403.
- **`assertOfficeAccess`** — hard-rejects with **403** when a single resource belongs to another office, or when the caller isn't operational staff at all. Used on reads and writes of individual tickets, work orders, and Operational Assessments — including after an office reassignment, since it always re-derives the resource's *current* office rather than trusting a cached value, so custody transfer correctly revokes the old office's write access without any special-case code.

Two properties worth stating explicitly:

- **A query parameter can never widen scope.** `GET /admin/tickets/geo`, for instance, re-derives office from the session independently of whatever the client sends, so URL-synced map filters are a UX convenience, not a trust boundary.
- **Exports reuse the list endpoints' own filter parsers** rather than a second copy. `ReportsService` calls `TicketsService.parseTicketQuery` / `WorkOrdersService.parseQuery` directly, so a CSV export cannot diverge from the equivalent list view's authorization. Only the export-specific date range is parsed separately.

Work order **reads and lists** are scoped by the **work order's own** `assigned_office`, not the caller's — and the assignee validation checks the target admin against that office too.

**Work Order and Operational Assessment writes** — manuscript revision Phase 5, step 5b. One pure rule, `assertResponsibleOfficeCanAct` in `api/src/admin/work-order.rules.ts`, checked on the ticket row locked `FOR UPDATE` inside each write's own transaction: creating, editing, completing or cancelling a Work Order and saving an assessment are allowed only to MEO / MDRRMO Personnel of the ticket's **current** office (403 otherwise, Focal Personnel and the System Administrator included — `OperationalStaffGuard` already rejects both), and never on a merged-away or `Rejected` ticket (409); every Work Order UPDATE also requires the ticket to be not merged away and not Rejected. A new Work Order also needs an assessment with observed conditions (409), on every creation path (single, bulk, seed). Completed and Cancelled Work Orders are final (409 on any change), and a cancel records its reason, actor (`cancelled_by_admin_id`, FK `admins`) and time. The supporting evidence URL accepts only `http:`/`https:` (so no `javascript:` link reaches the Ticket Detail page, which renders it with `rel="noopener noreferrer"`). None of these fields reach a citizen response.

`assignedAdminId=me` on work orders resolves server-side from the caller's session, so it can't be used to enumerate another admin's assignments by id.

**Manual routing (Reassign / Refer)** — manuscript revision Phase 5, step 5a. One pure rule, `routingBlock` in `api/src/admin/ticket-routing.rules.ts`, decides who may Reassign or Refer and when, checked by `TicketsService.reassignOffice` / `logReferral` on the ticket row locked `FOR UPDATE` inside the write's own transaction (so a race with work starting elsewhere loses safely):

- **Focal Personnel** — any office's ticket, but only while it is `Reported` with no pending/in-progress Work Order (403 otherwise). Focal reaches it only through `POST /admin/intake/:reportId/reassign|refer` behind `FocalGuard`; `OperationalStaffGuard` on `admin/tickets/*` is not relaxed.
- **MEO / MDRRMO Personnel** — their own office's tickets (403 otherwise), through `POST /admin/tickets/:id/reassign|refer` and bulk reassign.
- **Everyone** — refused (409) on a merged-away or `Rejected` ticket and while a Work Order is pending or in progress; a Resolved ticket stays routable by its office.
- **The System Administrator** — never (both guards reject it first; the rule refuses it too).
- **Input** — a required reason (trimmed, 1–1000 characters) and a valid destination: the other office for a Reassign, an external agency (≤ 200 characters, never MEO/MDRRMO) for a Refer; a no-op destination is 400. Every success writes `routing_actions` with the actor, time, destination and reason, plus the existing audit event (and `office_reassignments` for a Reassign).

Focal's Forward and Escalate (`POST /admin/intake/:reportId/forward|escalate`) were removed in the same step.

### 3.3 Verified by tests

Office scoping is regression-tested rather than assumed:

- A hand-crafted `?office=MDRRMO` from an MEO session returns only MEO rows — asserted for tickets, work orders, and barangay insights.
- Cross-office single-resource access returns **403** on read, update, and status change — asserted in **both** directions (MEO→MDRRMO and MDRRMO→MEO), so the enforcement isn't one-sided.
- Combining `assignedAdminId=me` with `?office=MDRRMO` still clamps to MEO.
- Unauthenticated requests to admin API routes return **401**.

`e2e/admin-rbac.spec.ts`, `e2e/admin-tickets.spec.ts`, `e2e/admin-work-orders.spec.ts`, `e2e/admin-barangay-insights.spec.ts`.

The route permission regression uses `api/test/permissions/route-policy.json`: 94 explicit route rows, each with outcomes for anonymous, Citizen, MEO Personnel, MDRRMO Personnel, Focal Personnel and System Admin. Runtime Nest discovery enumerates the actual AppModule graph; missing/stale/duplicate routes, handler changes, guard wiring changes and unclassified conditions fail. Expected outcomes are checked-in decisions, never calculated from the guards being tested.

`test:permissions` exercises real guards and sessions on the real migration/PostGIS baseline. Admission probes run only in the isolated test application, after guards; they do not demonstrate business-action success. Separate real-handler cases cover resource scope, privacy, denied-write fingerprints, cookies, reauthentication, OAuth state, throttles and cron secrets. Existing Focal Reported/no-active-Work-Order grouping/routing/correction rules remain unchanged; those precise gates are implementation rules, not a claim that the manuscript explicitly forbids or grants every grouping operation. Citizen-map keys and owner-only links retain the existing privacy contract. Operational reads retain their existing priority/timestamp refresh; denied writes must leave resource/history/audit data unchanged. Bulk operations retain per-item `skipped` refusals, rather than requiring every resource refusal to have an HTTP 403.

---

## 4. Session security

Admin and citizen session verification requires the account row to still exist. A validly signed JWT for a missing/deleted account returns the same invalid-session result as any other invalid token; protected routes keep the generic 401 response without revealing account existence. This reuses the existing account SELECT, with no additional query. Admin deactivation, account-field checks and both existing session_valid_after timestamp boundaries are unchanged. Citizens still have no deactivation field. Regression coverage includes real-guard HTTP responses and the real 0000-0050/PostGIS schema through drizzle; the normal E2E helpers/provisioning do not rely on deleted-account tokens.

A stateless JWT normally cannot be revoked before it expires. Three mechanisms close that gap.

### 4.1 `session_valid_after`

Both `admins` and `citizens` carry `password_changed_at` and `session_valid_after`. On any password change or reset, `session_valid_after` is bumped to `now()`, and `SessionService` **rejects any JWT whose `iat` predates it**. This is the one place a stateless session is genuinely invalidated server-side after a credential change. `null` means "never invalidated."

### 4.2 Admin deactivation

Setting `admins.is_active = false` does two things in the **same write**: it blocks future logins, and it bumps `session_valid_after` — so an already-issued token dies within the request cycle rather than lingering up to 8 hours. Reactivation only flips the flag back; the admin logs in fresh.

Staff edits (Phase 7, step 7a) that change `account_type`, `office` or `is_focal` also bump `session_valid_after` in the same transaction as the edit and its one audit event (metadata adds only `sessionsEnded: true`). An unchanged save returns the current safe account with no write, audit or bump. Name/email editing is not provided.

Admin JWT `iat` uses whole seconds: the existing timestamp check rejects `iat < floor(session_valid_after / 1000)`, preserving same-second password-cookie rotation. To end stale authority immediately even in that boundary second, verification also compares the token's account type, office and Focal responsibility with the stored account and rejects any mismatch. Deactivation continues to reject via `is_active` as well.

Both edit and status transactions first select **active** System Administrators in id order with `FOR UPDATE`, then lock the target. Demoting or deactivating the last active System Administrator returns **409** ("Cannot remove the last active System Administrator." / "Cannot deactivate the last active System Administrator."). Inactive accounts do not count; their reactivation or edits are not blocked by this rule. The common lock order serializes concurrent removals without locking opposing targets first.

A System Administrator cannot change their own account type, office or Focal responsibility (**403**, "Another System Administrator must change your own account.") or deactivate themselves (**403**, "Another System Administrator must deactivate your own account."). Deactivation of the last active administrator returns the **409** last-active refusal first, including for the caller's own account. Own-row edit/deactivate controls are disabled with an explanation. The existing self-password-reset refusal is unchanged.

New audit inserts take both `actor_role` and `actor_account_type` from the stored actor row in the same INSERT, for Drizzle, raw-PG and login writes; previously account type came from the session and could disagree with the stored role during an in-flight edit. No historical audit value is rewritten.

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

A different threat shape from login — an attacker can't repeat-attempt signup against one target email (duplicate email is already rejected by the existing account-conflict check, unrelated to rate limiting), so the control is IP-only, no email component. The threshold intentionally mirrors §5.1's report-submission IP backstop (same value, same reasoning): the E2E suite creates about 16 disposable citizen accounts from one IP in a full run (one per disposable-ticket test across several specs; fewer since manuscript revision Phase 6, step 6a moved several tests to fixtures — see [`testing.md`](testing.md) §6), so a materially lower threshold would break the suite before its own report-limit backstop ever would. An attempt is recorded for every request that clears the check itself, regardless of whether it goes on to hit the duplicate-email conflict or succeed.

### 5.5 Password reset

| Limit | Value | Key |
|---|---|---|
| Per email | **3 / hour** | normalized email |
| Per IP | **10 / hour** | `ip` |

Both must pass. Crucially, an attempt is recorded **for every request, including emails with no account** — otherwise the enumeration-resistant identical response would let an attacker probe many addresses without ever consuming the email limit.

### 5.6 OAuth

**10 requests/minute per IP** on OAuth start/callback (`OAuthRateLimitGuard`). This one is **in-memory, not Postgres-backed** — a deliberate, marked tradeoff: OAuth abuse doesn't need to survive a restart the way report spam does. It assumes a single instance; see §8.

### 5.6a Tracking-reference lookup

`GET /reports/mine/by-reference/:ref` (manuscript revision Phase 6, step 6b) is throttled to **30 lookups a minute per citizen** by `ReferenceLookupRateLimitGuard` (`api/src/common/guards/reference-lookup-rate-limit.guard.ts`; 429 over the limit), so sequential `PRC-YYYY-<report id>` references cannot be enumerated through it. In memory, like `OAuthRateLimitGuard` (§5.6): it does not survive a restart and would need a shared store if the API ran as more than one instance. See §7.2b for the ownership rule.

### 5.7 Retention

`POST /cron/cleanup-rate-limit-events` prunes all five rate-limit tables past a 30-day window. Safe because the longest window any live check consults is 24 hours.

### 5.8 The E2E caveat

A full Playwright run posts 15 real reports since manuscript revision Phase 6, step 6a (kept at 16 or fewer; see [`testing.md`](testing.md) §6) and creates a similar number of disposable citizen accounts (§5.4), and will exhaust the 20/hour IP backstops if repeated within the hour. **This is the control working correctly.** There is deliberately **no test-only bypass, env flag, or relaxed limit** — the documented workaround is targeted spec runs. See [`README.md`](../README.md) §I.

---

## 6. Audit logging

### 6.1 `admin_audit_events`

**Phase 7, step 7b audit view.** Only System Administrator/MIS may read `GET /admin/activity-log`; the existing AdminSessionGuard + SystemAdminGuard remain unchanged and grant no operational authority. Each response item contains exactly `id`, `created_at` (ISO), `action`, `target_type`, `target_id`, `target_label`, `actor` (`id`, recorded `name`, `account_type`, `is_focal`, `display_label`) and `details`. The API removes target summaries, raw metadata, emails, reasons/remarks/notes/titles/descriptions, citizen text, coordinates, assignee ids and cancellation reasons before serialization. Operational ticket timelines retain their existing office-scoped behavior.

`admin-audit-view.ts` is the sole per-action details allow-list, pinned by a snapshot. It emits only flattened primitive values: enumerated status/office/account/outcome codes, known-category short codes, booleans and moved-report count. Unknown actions/keys and invalid values produce no details. No metadata object or arbitrary string is copied. Targets use neutral Ticket/Report/Work order #id labels; staff targets use a live staff-name lookup without email, or "Staff - name not recorded".

All new service inserts read `actor_role`, `actor_account_type`, `actor_is_focal` and office from the stored actor in the INSERT, including raw-PG, Drizzle and login paths. True means Focal Personnel; false uses recorded account type/office. Legacy NULL falls back to recorded actor_role (`focal` = Focal, `system_admin` = System Administrator/MIS, officer/supervisor = Personnel). MEO/MDRRMO comes only from recorded actor_office; an absent office is "Personnel - office not recorded", never inferred from a current account. actor_role is kept permanently.

Migration 0047 enforces append-only history with an enabled row-level BEFORE UPDATE OR DELETE rejection trigger. INSERT remains allowed. The row trigger technically does not block TRUNCATE; this is not authorization to truncate audit history or any real database. Historical values are never rewritten. The presentation seed retains audit history and skips identical actor/action/target/metadata events on repeat, without disabling the trigger.

Filters: all current and retired actions, target type, actor from the existing staff endpoint, numeric target id with its type, and Asia/Manila calendar-day range. Invalid dates and reversed ranges return plain 400 messages. The final day is inclusive via an exclusive next-midnight boundary; raw SQL receives ISO strings cast to timestamptz. Offset pagination retains 10/25/50/100 choices (service clamps to 10-100); no text search. Shared action list/labels: `api/src/contracts/admin-audit.ts`.

An append-only trail of administrative actions: account create / role change / deactivate / reactivate, ticket status changes and reassignments, report moderation, work-order create / update / status change / cancel (step 5b: `work_order_cancelled` metadata carries the cancellation reason and any replacement id), admin login/failed-login (`admin_login` / `admin_login_failed`), and — five-role Batches 2/3 — Focal's `report_acknowledged` / `report_screened` / `report_escalated` and `operational_assessment_created` / `operational_assessment_updated`. Since manuscript revision Phase 3, step 3f, Focal severity screening writes `report_severity_screened` (metadata `{ oldStatus, newStatus, remarks }`), and `report_screened` (the old general screening action) is history only. There never was a `report_forwarded`: Focal's Forward reused `reassignOffice`, which logs `ticket_reassigned`, as Focal's Reassign does since manuscript revision Phase 5, step 5a. Forward and Escalate were removed in that step; old `report_escalated` events stay readable and filterable. Since then `ticket_reassigned` metadata carries `{ from, to, reason }` and `ticket_referral_noted` `{ agency, reason }` (older referral events keep their optional `note`).

Three properties that matter:

- **Transactional for mutations, best-effort for login events.** Every mutation action type is written via `AdminAuditService.logInTx` / `logInPgTx` in the same transaction as the state change — a failed audit insert rolls back the whole action, and the trail is treated as load-bearing. `admin_login` / `admin_login_failed` are the one exception: written via `AdminAuditService.logBestEffort`, outside any transaction, because a login has no accompanying state-change transaction to join. Errors are caught and logged (never rethrown), so a broken audit insert can never block a legitimate admin login.
- **Actor snapshot at write time.** `actor_name` / `actor_role` / `actor_account_type` / `actor_is_focal` / `actor_office` are copied in, so history reads correctly even after the admin row is later edited. `actor_role` is history and is never rewritten; since Phase 2, step 2e new events take it from the actor's stored `admins.role` mirror and set `actor_account_type` from the actor's account type (see `docs/database.md`).
- **Field names, never contents.** Updates log *which* fields changed — e.g. `notes`, `dueDate`, `assignedAdminId` with `{from, to}` ids — never note bodies. Login events never record the password, any part of it, its length, the session token, or any cookie value.

A failed login against a **nonexistent email** is deliberately **not** audited: there is no admin row to attribute an `actor_admin_id` to (that column is `NOT NULL`), and inventing a synthetic id was rejected as the same schema-shape hack disallowed for export audit logging (§6.3). Only failed attempts against an existing admin account are recorded. See `AuthService.adminLogin` for the exact decision and reasoning.

Visible only to System Administrators, via `/admin/activity-log` behind `SystemAdminGuard`. Covered by `e2e/admin-activity-log.spec.ts` and asserted for work orders in `e2e/admin-work-orders.spec.ts`.

### 6.2 `citizen_audit_events`

A separate trail for the citizen's own Account & Security actions: provider linked/unlinked, password set/changed, and rejected link attempts due to email collision. Deliberately **not** merged with the admin trail — different actors, different event vocabularies, different audiences (this one is citizen-self-service; the other is System-Administrator-only).

### 6.3 Export audit (Phase 7, step 7c-1)

Every successful CSV generation writes one required `report_exported` event (label **Report export**) before the file response. The shared 5,000-row limit (`api/src/admin/export-limit.ts`) allows exactly 5,000; more returns 400 with a message asking staff to narrow filters, never a truncated file. Serialization and the limit check precede the audit insert; audit failure fails the export closed, with no attachment headers or file. A successful event means the server generated and authorized release, not proof that a browser saved the file.

Action and target columns are plain text: no migration is needed. Target type `export` uses the actor's own existing admin id as required `target_id`, labelled "Export by staff #id"; it is attribution, not a ticket/report target or synthetic id. Details are sanitized before storage and again by the per-action allow-list: `kind` (tickets/flagged/work_orders), `rowCount`, applied office/status/category short code/barangay/flag/category-review/overdue/date bounds, selection count, and search/assignee filter presence booleans. Search text, selected row ids and assignee ids are deliberately omitted to preserve the 7b privacy contract. Pagination/sort and filters unused by the export query are not logged. The append-only rule and existing System Administrator-only audit view remain intact.

All exports retain OperationalStaffGuard and the existing own-office clamp; Focal and System Administrator are refused. Merged-away tickets are excluded in every export, including status=all. `flagged.csv` replaces Title and Citizen with Tracking Reference: no citizen name or report title is selected. `work-orders.csv` adds Cancelled At, Cancellation Reason and Replacement Work Order ID (blank unless cancelled); notes remain excluded at query level. Assigned Admin Email remains the assignee's stored staff email, visible only to operational Personnel exporting their own office's Work Orders. Download controls fetch with credentials, preserve Content-Disposition filenames and show API errors inline.

---

### 6.4 Additional operational exports (Phase 7, step 7c-2)

Three additional endpoints under `/admin/reports/` retain `AdminSessionGuard`, `OperationalStaffGuard` and `resolveOfficeScope`: operational Personnel in their own office only, never Focal or System Administrator. Every query excludes merged-away tickets. No migration or database column rename is required.

- `submitted-reports.csv`: one row per report, with tracking reference, ticket/status/office/current category, submitted category, barangay, citizen severity, evidence flags, screening status, moderation status and submitted time. No citizen name/email/title/description/photo/EXIF/coordinates or screening remarks are selected.
- `operational-assessments.csv`: one row per assessed ticket. `operational_assessments.ticket_id` is UNIQUE, so there is no history selection or Assessment Count column. This is the explicit exception for the same office's own assessment text: assessed conditions, safety implications, constraints/notes, recommended action, interim mitigation, the combined deferment or referral reason, remarks, actual action and supporting staff evidence URL are included, along with the recorded assessor name, ticket resolution fields and four Work Order status counts. Citizen report data, assignee email and Work Order notes remain excluded. Legacy outcomes without resolved_at stay blank, as in the existing ticket export. Migration 0048 aligns assessed_conditions/interim_mitigation and created_at physically; headers remain Assessed Conditions/Interim Mitigation, with one Deferment or Referral Reason column. The assessor FK is NOT NULL/ON DELETE RESTRICT; referenced test creators are retired, not deleted. No historical audit row or actor_role is rewritten.
- `priority-incidents.csv`: top N active tickets by stored Operational Priority descending, ties oldest created_at then ticket id. Only Reported/Under Review/In Progress; N defaults to 20 and must be an integer 1-200 (otherwise plain 400). No cutoff score or retired Hazard Urgency value is introduced. The export reads the existing maintained priority value; it does not recompute or persist scores. Hazard Information uses the existing current-location summary; no geometry leaves the query.

Submitted/assessment filters validate status/category and optional submitted barangay. Their dateFrom/dateTo are inclusive Asia/Manila calendar days using the 7b date-bound helper, with an exclusive next-midnight upper bound. SQL receives ISO strings cast to timestamptz, never JS Dates. The original three exports' date behavior and columns are unchanged.

All six exports use the central CSV writer and shared 5,000-row limit. The new heavy queries fetch limit+1 and refuse overflow without truncation; priority output is already bounded to at most 200 rows. Assessment text receives the same formula neutralisation. Serialization precedes required, fail-closed report_exported auditing with the existing export target/actor id convention. New allow-listed kinds are submitted_reports, operational_assessments and priority_incidents; details include rowCount, actual office/status/category code/barangay/date filters and numeric top for priority. Assessment text, URLs and staff/citizen content never enter audit details. The audit label remains Report export, and the view labels top as Top N. All new Reports-page controls reuse ExportDownload and inline server errors.

## 7. Data separation and privacy

### 7.1 Internal content never reaches citizens

Work-order fields — **especially `notes`** — moderation notes, and citizen dispute *reasons* are staff-only. Enforcement is structural rather than presentational:

- No `api/src/citizens/*` response type includes any work-order field.
- The work-order CSV export **excludes `notes` at the query level**, not by filtering after selection.
- `e2e/admin-work-orders.spec.ts` creates a work order with a sentinel note and asserts it never appears anywhere on the citizen's report page.
- `e2e/citizen-dispute.spec.ts` asserts the citizen's own dispute reason is not rendered back to them, and that no `work_order` / `moderation_note` text leaks onto the page.
- Per-citizen resolution feedback (manuscript revision Phase 3, step 3g): the citizen report detail carries only that citizen's own `resolution_feedback` row (`my_feedback`: type, their own reason, time — the reason is returned to its author but not rendered), never another citizen's answer, reason or any count, and no longer the ticket-level `disputed_at`/`resolution_confirmed_at`. Staff Ticket Detail lists every answer without reporter identity. `e2e/citizen-resolution-feedback.spec.ts` checks both.

### 7.2 Citizens see only their own reports

**Citizen notifications (Phase 6, step 6c).** `NotificationsService.listForPrincipal` retains recipient scoping and projects citizen items to exactly `id`, `type`, `title`, `message`, `href`, `readAt`, `createdAt` (plus list-level `nextCursor`). No `recipientType`, `recipientId`, `recipientOffice`, `entityType` or `entityId`, including on legacy rows. The notification's own `id` supports mark-read; `href` may identify only a report owned by that session, checked before returning it. Invalid/internal/other-owner links become null. Admin responses retain their existing fields and office scoping.

Reassign (including category-driven office changes), Refer, return to review and first ticket acknowledgment notify distinct existing citizen reporters once per event. Feedback receipt goes only to its author. All new recipient queries exclude a merged-away target. Citizens have no disabled/deleted flag; joining `citizens` excludes missing accounts. Referral targets reuse step 6b's agency allowlist; free-text/Other/unrecorded targets are generic. Notification builders and the resolved email exclude names, remarks, resolution notes, routing/return reasons, audit, Work Order, assessment, screening, Hazard Information and rainfall data. Rejection reason remains the sole staff-authored text in notifications/email. This restriction does **not** remove resolution notes/photo or the feedback line from the citizen report page. Resolved copy distinguishes municipal completion and referral (with the agency-completion caveat); legacy copy stays generic.

Notification writes use a savepoint inside the action transaction. An insert failure rolls back the notification batch and logs a generic warning, allowing the action and its load-bearing audit to commit. Resolved/rejection emails remain post-commit; no new email path, no relaxed guard, rate limit or audit contract. Tests use mocked email methods or a disposable PGlite database, never a provider.

`GET /reports/mine` and every per-report route check ownership and existence in a **single clause** (`WHERE r.id = ... AND r.citizen_id = ...`), so a wrong id and someone else's id are indistinguishable to the caller — no probing an id space for existence.

### 7.2b Citizen report page and tracking-reference lookup

Manuscript revision Phase 6, step 6b. `GET /reports/mine/:id` returns `{ report, history, referrals }` for the citizen's own report only (§7.2):

- **No staff names.** `history` is `SELECT status, changed_at, COALESCE(from_status = 'Resolved' AND status = 'Under Review', false) AS returned` — no `admin_name`, no `from_status` (used only inside SQL for `returned`), no return `reason`, no resolution snapshot columns. Pinned exactly in `reports.service.spec.ts`; putting `admin_name` back fails it.
- **Outcome in citizen terms.** The raw `resolution_outcome` is read only under an internal alias, mapped by `citizenOutcome` (`api/src/reports/citizen-report-view.ts`) to `HANDLED_BY_MUNICIPALITY` / `REFERRED_OUTSIDE`, or null (not Resolved, or a legacy Resolved ticket with no `resolved_at`), and dropped before the response.
- **Referrals without reasons.** `referrals` is `[{ agency, referred_at }]` from the ticket's `REFER` routing actions; `citizenReferralAgency` shows a suggested agency by name and anything typed or unrecorded as "an outside agency". No reason, staff member or office codes.
- **Acknowledgment without remarks.** Only the time (the earliest of the report's own acknowledgment and the ticket-level acknowledgment of its ticket or of the ticket a merge moved it from), never the remark or the acknowledging admin.
- **Merges without other citizens.** `is_merged`, `merged_at` and `other_reports_count` only; the merge event's id list is read in SQL and never returned, and another citizen's tracking reference never appears.

**Owner-only reference lookup.** `GET /reports/mine/by-reference/:ref` (citizen session required) returns `{ id }` only for the citizen's own report. A malformed reference (not `PRC-<4 digits>-<6–12 digits>`, case-insensitive), a reference that does not exist and another citizen's reference all get the **same 404 with the same body** ("No report found with that reference."); the last two run the same single owner-scoped query (`WHERE r.tracking_reference = … AND r.citizen_id = …`), and a malformed one runs none. There is no public or anonymous lookup. Throttled per citizen (§5.6a). Unit-tested in `api/src/reports/reference-lookup.spec.ts` (a 403 for another citizen's reference fails it).

### 7.2a The public map shows other citizens' reports only in outline

`GET /public-map` (`ReportsService.getPublicHazardMapData`; manuscript Appendix L, handoff Decision 8, manuscript revision Phase 6, step 6a) is behind `CitizenSessionGuard` — signed-in citizens only, no anonymous map, no staff access. It lists active (`Reported` / `Under Review` / `In Progress`), unflagged, not merged-away tickets, and each row carries exactly eight fields: `key`, `category`, `status`, `barangay_name`, `lat`, `lng`, `reported_at`, `own_report_id`. The rules:

- **No identifiers.** No ticket number, no tracking reference, no report id of anyone else. `key` is an opaque per-response position key (`p1`, `p2`, …) added by `withPublicMapPositionKeys` after the query; it is never derived from a database id, and the same ticket can get a different key in the next response.
- **Order reveals nothing extra.** Rows are ordered by reported date (newest first) with `random()` as the tiebreak, never by id, so a key's position tells no more than the `reported_at` the row already shows.
- **No content or internals.** No title, description, photo, reporter, EXIF, integrity flags, score, last-updated time, assigned office, staff names or notes, assessments, Work Orders, routing or audit data. `withPublicMapPositionKeys` copies the eight fields by name, so a column added to the query later still never reaches the response.
- **Approximate pins.** `lat`/`lng` are rounded to 3 decimals (about 100 m) in SQL.
- **Own reports only by their own id.** `own_report_id` is set only on the signed-in citizen's own tickets (their own report id, for the "View my report" link) and is null everywhere else.

Unit-tested in `api/src/reports/reports.service.spec.ts` (the exact output column list, the filters and ordering, the exact key set of every returned row, and keys that are positions rather than ids) and in `e2e/citizen-map.spec.ts` (the exact key set of every live row; the popup shows no last update, office or ticket number).

### 7.3 Server-computed values are never client-trusted

Elevation is always computed server-side from the DEM by nearest-neighbour lookup, never accepted from the request. Barangay is resolved server-side from geometry. Urgency and priority are computed server-side; client-side copies of the scoring math exist only for badge display and are never authoritative.

### 7.4 Admin directory exposure is minimal

`GET /admin/admins/directory` — reachable by MEO/MDRRMO so an assignee picker can be populated — returns only `{id, name, email, office, account_type, is_focal}` for **active** operational Personnel. Never password or session-security columns, never the `role` mirror, never inactive rows, never System Administrator or Focal rows — the filter is an explicit operational-Personnel *allowlist* (`isOperationalPersonnel` in `AdminsService.listDirectory`), not a denylist of System Administrator/Focal, precisely so a future account kind can't silently become assignee-eligible. A Focal account's `office` column is literally `'MDRRMO'`, so a naive office-only filter would incorrectly surface it when querying that office — `is_focal` is what actually excludes it. The same allowlist guards assignment itself: `WorkOrdersService.assertValidAssignee` accepts only an **active operational Personnel** account on the work order's office (400 otherwise), so a Focal account can't be named as an MDRRMO assignee through the API directly either — its office match alone is never enough. The stricter `SystemAdminGuard` on `AdminsController` is unchanged.

### 7.5 Focal Intake and Operational Assessment content never reach citizens or MIS

Five-role Batch 2/3 additions follow the same structural rule as §7.1:

- No `api/src/citizens/*` response type includes `report_intake_actions`, `operational_assessments`, or intake-state fields — the citizen-visible `acknowledged_at` is the one exception, sourced only from ticket `acknowledgments` (current ticket and old ticket in the latest recorded merge), never earlier than that citizen report’s submission and never derived from an intake action. Names, remarks and internal state remain private.
- `FocalIntakeService`'s responses never include Operational Assessment content, Work Order internals, or staff assignment data — only report reference, category, barangay, coordinates, routed office, Operational Priority, and derived intake state.
- MIS (`system_admin`) gains no Focal Intake or Operational Assessment access merely by being an administrator — `FocalGuard`/`OperationalStaffGuard` reject it exactly as they reject each other's role. MIS's Activity Log shows that an acknowledgment/screening/reassignment/referral/assessment action (or a historical forward/escalation) *occurred* (via the existing `admin_audit_events` action-type/summary fields every other audit entry already has). The acknowledgment, escalation and assessment events carry no remarks or assessment text — no second, richer audit path exists for them. **Since Phase 7, step 7b, the Activity Log API strips all remarks and raw metadata**, including severity-screening remarks, moderation notes, grouping/correction reasons and cancellation reasons; only each action's strict structured details allow-list is readable.

### 7.6 CSV exports neutralise spreadsheet formulas

Phase 7, step 7.0. The three CSV exports (`tickets.csv`, `flagged.csv`, `work-orders.csv`) carry text people typed — work order titles, assignee names, category and barangay text. A spreadsheet (Excel, Sheets, LibreOffice) runs a cell as a formula when its first character is `=`, `+`, `-` or `@`, a tab (0x09) or a carriage return (0x0D) — CSV formula injection.

- **Rule.** Any **text** cell whose **first** character is one of those six gets a single apostrophe (`'`) in front, so the spreadsheet shows it as text. Only the first character is checked (a leading space before a trigger is left as it is). The normal CSV quoting rules (commas, quotes, newlines, CR) then apply to the prefixed value. A prefixed value starts with `'`, which is not a trigger, so nothing is ever prefixed twice. Empty strings, `null` and `undefined` stay empty.
- **Numbers stay numbers.** Only JS `string` values are neutralised. Numbers (ids, counts, Operational Priority, metres — including negatives and 0), bigints and booleans are written in their plain form, never turned into text. Every export already passes its numeric columns as JS numbers; dates are passed as ISO strings, which start with a digit and so are never prefixed. The header row goes through the same rule (no header starts with a trigger).
- **Where.** Once, centrally, in `neutraliseFormula` / `toCsv` in `api/src/common/utils/csv.ts` — the only place the app builds CSV. `api/src/common/utils/csv-writer-only.spec.ts` fails if a second CSV path appears (another `text/csv` response, CSV quote-doubling or CRLF joining outside `csv.ts`, a CSV library import, or a browser-built CSV download), so a new export can't skip the rule.
- **The 7.0 escaping is unchanged by 7c-1.** Export limits, privacy columns and required auditing are specified in section 6.3.

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

Phase 8b-2 acknowledgment contraction keeps the Focal report-id authorization and audit action/target unchanged. Ticket uniqueness plus a ticket row lock and `ON CONFLICT DO NOTHING` ensure only the first action emits an audit row and citizen notice. Grouping does not move acknowledgments. Operational Priority, advisory Hazard Information/rainfall, municipality-wide Focal scope, and Focal/System Admin exclusion from Work Order authority remain unchanged. Audit rows and actor_role remain permanent and append-only.

The optional-at-runtime legacy table cannot be dropped without an archive. The maintenance command uses a consistent READ ONLY snapshot and writes all legacy columns to private JSONL plus a manifest outside the repository/web tree; names and remarks may be private. Windows ACL inheritance is removed and only the current user's SID is granted access before writing; POSIX directories/files use 0700/0600. ACL failure aborts before data is written. Logs contain only archive path/count/checksum, never rows or credentials. Protect the archive like a database backup; do not attach it to an issue or put it in source control. Migration validates file bytes/manifest and recomputes the live canonical count/SHA-256 under its lock. Historical notifications/audit rows are never rewritten.
