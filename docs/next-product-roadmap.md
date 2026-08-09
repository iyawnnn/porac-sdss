# Next Product Roadmap

**Purpose.** This file is the forward-looking queue for Porac SDSS: what to build next, what follows it, what runs continuously, and what has been considered and deliberately set aside. `docs/product-roadmap.md` remains the record of what has already shipped (§1–§2) and the standing constraints (§5–§6); `PLAN.md` stays the architecture/decision record. This file only answers "what's queued, in what order, and what is *not* queued."

Porac SDSS is a real operational system for MEO/MDRRMO, not an MVP prototype — treat every item below as a production feature with production stakes (RBAC, audit trail, data integrity).

**Maintenance rule.** Update this file in the same change whenever an item here is started, completed, reprioritized, or moved between sections. Items in §3 are deferred, not scheduled — moving one into §1–§2 is a deliberate decision that needs a stated reason, not a silent promotion.

**Shipped since the last pass.** Barangay Insights (was §1 "Build Next" in the prior version of this file) is now built — see `docs/product-roadmap.md`'s "Barangay Insights" entry for what shipped. It landed at `/admin/barangay-insights` / `/admin/barangay-insights/[barangayId]`, not the `/admin/barangays` route originally sketched here. Notification Center is promoted to §1 as a result.

---

## 1. Build Next

### Notification Center

A full notifications page backing the existing bell.

- **Route:** `/admin/notifications`.
- **Roles:** all three; office admins see their own and their office's rows only, per the existing `scopeFilter`.
- **Problem it solves:** the bell shows only the latest 10 with no filter, no pagination, and no history — office-wide `ticket_critical` and `new_citizen_report` alerts can scroll out of reach with no way to review them.
- **Database change:** **No.** `GET /notifications?before=&limit=` already paginates; `NotificationsService.listForPrincipal` already computes and returns `nextCursor`, and the client hook currently discards it.
- **Backend:** none required for the MVP. An optional unread/type filter param is the only candidate addition.
- **Risk:** low · **Scope:** small

---

## 2. Continuous

### Production Hardening / Deployment Readiness

Not a discrete feature and never "done": monitoring/alerting, backup verification, load and performance validation, secrets rotation, and a deployment runbook. Revisit and expand as the system approaches real deployment rather than treating it as a one-time checkbox.

**Done:** cron scheduling (`.github/workflows/cron.yml`, daily, all five `/cron/*` routes), rate-limit event cleanup (`POST /cron/cleanup-rate-limit-events`, 30-day retention), and setup/deployment documentation (`README.md`'s two-env-file split, GitHub Actions cron requirements, and an honest "no hosting platform decided yet" statement) — see `docs/product-roadmap.md`'s Production Hardening entry for detail.

**Still open:** monitoring/alerting, backup verification, load/perf validation, credential rotation from `PLAN.md` §0 (gate on an actual deploy decision, not before), and a written deployment runbook (no hosting platform is committed anywhere in this repo yet).

---

## 3. Explicitly Deferred Ideas

Considered and set aside. These are **not scheduled** and must not be treated as upcoming work. Each needs a real, separately-scoped requirement before it moves anywhere else in this file.

- **Standalone due-date calendar** — due dates stay inside Work Orders.
- **Crew scheduling** — not in scope.
- **Inspection logs** — collide with the deferred attachments/checklists scope.
- **Attachments / checklists** — explicitly out of scope.
- **CSV export for Barangay Insights** — out of the shipped MVP scope (see `docs/product-roadmap.md`).
- **Elevation filtering** — still deferred.
- **Barangay editing flows** — out of the shipped MVP scope (see `docs/product-roadmap.md`).
- **Generic "Analytics" sidebar label** — must not be used as a sidebar label; the test suite asserts against it.
