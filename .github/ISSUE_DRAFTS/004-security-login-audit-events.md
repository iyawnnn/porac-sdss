# Add login audit events

**Labels:** `security`, `priority:p2`, `backend`
**Type:** Enhancement (audit)
**Priority:** P2 — best done together with #001

## Background

`docs/security-hardening-plan.md` R4 (Medium). `admin_audit_events` covers every admin *mutation* — account create/role change/deactivate/reactivate, ticket status changes and reassignments, report moderation, the full work-order lifecycle — and is written transactionally with the action itself.

It does **not** cover authentication events.

## Problem

A compromised admin account leaves no authentication trail. There is no way to answer "when did this account last log in?" or "were there failed attempts before the breach?" from the audit log.

## Proposed scope

Add two action types on the **existing** `admin_audit_events` table:

- `admin_login` — successful login
- `admin_login_failed` — failed attempt

No new table, no new endpoint, no new page. The Activity Log page already filters by target type and will pick these up.

**Best implemented alongside #001**, which already computes the failed-attempt signal.

## Implementation notes

- Follow `AdminAuditService` conventions exactly: actor snapshot at write time (name/role/office copied in), and **field names never secret values**.
- **Never log the attempted password, any part of it, or its length.**
- A failed login for a **nonexistent email** has no admin row to attribute an actor to. Decide how to handle it — skip the event, or record it without an actor — and state the reasoning in a comment. **Do not invent a synthetic admin id** (e.g. `targetId: 0`); that is the same schema-shape hack rejected for export audit logging.
- Consider whether login events should be transactional like mutations, or best-effort. A failed audit insert should probably not block a legitimate login — state the choice explicitly.

## Files likely involved

- `api/src/auth/auth.service.ts`
- `api/src/admin/admin-audit.service.ts`
- `docs/security.md` §6, `docs/database.md` (`admin_audit_events` entry), `docs/security-hardening-plan.md` R4, `docs/project-status.md` §4.1

## Acceptance criteria

- [ ] A successful admin login writes an `admin_login` row.
- [ ] A failed attempt against an existing account writes `admin_login_failed`.
- [ ] The nonexistent-email case is handled deliberately, with the reasoning in a comment.
- [ ] No password material appears in any audit row.
- [ ] Events appear on `/admin/activity-log` for a System Administrator.
- [ ] `docs/security.md` §6 updated; §8 "login events not audited" removed if it becomes untrue.

## Suggested tests

- API test: failed then successful login each produce the expected row.
- API test: no password material in the stored metadata.
- `pnpm --prefix api test`, then only `e2e/admin-activity-log.spec.ts` and `e2e/admin-password.spec.ts`.

## Out of scope

Citizen login auditing (`citizen_audit_events` covers citizen account-security actions; routine citizen logins are not a comparable oversight need), alerting on failed logins (that is monitoring — issue #025), and log retention policy.

## Risks / notes

Volume: the E2E suite logs in ~200 times per full run, so this table will grow faster in development. Confirm the existing notification/audit retention story still makes sense, or note that audit rows are deliberately kept.

## Claude Code handoff prompt

```
Add admin login audit events to PORAC-SDSS.

Read first: api/src/auth/auth.service.ts, api/src/admin/admin-audit.service.ts,
docs/security.md §6, docs/database.md (admin_audit_events),
docs/security-hardening-plan.md R4.

Add two action types on the EXISTING admin_audit_events table: admin_login and
admin_login_failed. No new table, no new endpoint, no new page.

Follow AdminAuditService conventions exactly: actor snapshot at write time,
field names never secret values. NEVER log the attempted password, any part of
it, or its length.

A failed login for a nonexistent email has no admin row to attribute an actor
to. Decide how to handle that (skip, or record without an actor) and state the
reasoning in a comment. Do NOT invent a synthetic admin id.

Decide and state whether these writes are transactional (like mutations) or
best-effort — a failed audit insert probably should not block a legitimate
login.

Add API tests: failed then successful login each produce the expected row, and
no password material is stored.

Update docs/security.md §6, docs/database.md, docs/security-hardening-plan.md
(R4 done), docs/project-status.md §4.1.

Verify: pnpm --prefix api test, then ONLY
pnpm exec playwright test e2e/admin-activity-log.spec.ts e2e/admin-password.spec.ts -- --workers=1
Then git diff --check
```
