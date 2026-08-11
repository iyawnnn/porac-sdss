# Next Product Roadmap

**Purpose.** This file is the forward-looking queue for Porac SDSS: what to build next, what follows it, what runs continuously, and what has been considered and deliberately set aside. `docs/product-roadmap.md` remains the record of what has already shipped (§1–§2) and the standing constraints (§5–§6); `PLAN.md` stays the architecture/decision record. This file only answers "what's queued, in what order, and what is *not* queued."

Porac SDSS is a real operational system for MEO/MDRRMO, not an MVP prototype — treat every item below as a production feature with production stakes (RBAC, audit trail, data integrity).

**Maintenance rule.** Update this file in the same change whenever an item here is started, completed, reprioritized, or moved between sections. Items in §3 are deferred, not scheduled — moving one into §1–§2 is a deliberate decision that needs a stated reason, not a silent promotion.

**Shipped since the last pass.** Barangay Insights (was §1 "Build Next" in the prior version of this file) is now built — see `docs/product-roadmap.md`'s "Barangay Insights" entry for what shipped. It landed at `/admin/barangay-insights` / `/admin/barangay-insights/[barangayId]`, not the `/admin/barangays` route originally sketched here. Notification Center (promoted to §1 as a result) is now also built — see `docs/product-roadmap.md`'s "Notification Center" entry — as are the Citizen Resolution Feedback / Dispute Loop, persistent Confirm Fixed, the Work Orders "My Assignments" filter, Ticket Escalation Notifications, and the Citizen Case Closure Summary card (all documented in `docs/product-roadmap.md` §2).

**No new product feature is currently queued.** §1 "Build Next" is empty as of this pass — the roadmap pipeline that Barangay Insights and then Notification Center filled is now clear, and the most recent roadmap audit found no remaining unfinished item of real product weight outside what §3 already explicitly defers. The project is in a polish/testing/hardening phase: test coverage, documentation consistency, and reliability hardening (not new features) are the only open work. The next recommended piece of that work is the admin SSR error boundary named in §2 below — a hardening item, not a §1 feature. Do not treat any of this as license to start a new feature — see `docs/product-roadmap.md` §5 "Do Not Build Yet" and this file's §3 below before proposing one.

---

## 1. Build Next

Nothing queued. See the note above.

---

## 2. Continuous

### Production Hardening / Deployment Readiness

Not a discrete feature and never "done": monitoring/alerting, backup verification, load and performance validation, secrets rotation, and a deployment runbook. Revisit and expand as the system approaches real deployment rather than treating it as a one-time checkbox.

**Done:** cron scheduling (`.github/workflows/cron.yml`, daily, all six `/cron/*` routes), rate-limit event cleanup (`POST /cron/cleanup-rate-limit-events`, 30-day retention), setup/deployment documentation (`README.md`'s two-env-file split, GitHub Actions cron requirements, and an honest "no hosting platform decided yet" statement), and the admin ticket workflow / citizen Case Closure Summary E2E coverage plus the decoupling of ticket-dependent specs from shared "first ticket" state — see `docs/product-roadmap.md`'s Production Hardening entry for detail on each.

**Next recommended hardening item — admin SSR error boundary (pending, not implemented).** Both app shells call their session helper (`getAdminSessionFromApi` / `getCitizenSessionFromApi`) unguarded in a layout, and those helpers throw — rather than return `null` — when the Next → NestJS hop fails at the socket level. With no `app/error.tsx`, no `app/admin/error.tsx`, and no `global-error.tsx` in the tree, that throw replaces the whole admin app (login form included) with Next's built-in error screen. The only mitigation today is test-side (`settleAdminPage` in `e2e/helpers.ts`). `docs/product-roadmap.md`'s Production Hardening entry carries the full detail, including two build-specific gotchas to verify against `node_modules/next/dist/docs/` first: `error.js` does not wrap the `layout.js` in its own segment, and the existing citizen boundaries use `reset` where `unstable_retry` is the prop that actually re-fetches. Scoped as reliability hardening — no schema change, no new route, no RBAC/office-scoping/audit surface.

**Still open beyond that:** monitoring/alerting, backup verification, load/perf validation, credential rotation from `PLAN.md` §0 (gate on an actual deploy decision, not before), and a written deployment runbook (no hosting platform is committed anywhere in this repo yet).

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
