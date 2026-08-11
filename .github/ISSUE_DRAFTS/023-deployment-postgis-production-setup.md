# Document PostGIS production database setup (after provider decision)

**Labels:** `deployment`, `docs`, `priority:p3`, `blocked`
**Type:** Documentation
**Priority:** P3 — **blocked on a database provider decision**

## Background

`docs/deployment-readiness.md` §4. The application-layer database posture is already sound and was verified in `docs/security-hardening-plan.md` §2: all queries parameterized, no `sql.unsafe`, no cascade deletes, no destructive application deletes outside expiry-driven cleanup jobs.

What remains is **entirely a function of where the database is hosted**. Neon is what development uses; nothing in the repo commits production to it.

## Problem

No production database exists, and the provider-specific setup is undocumented: connection limits, pooling, IP allowlisting, PITR, and the migration procedure against a live database.

Two things are already known and must carry into any provider:

- **PostGIS is not optional.** Geometry columns, `ST_*` functions, and GiST indexes are core to barangay resolution, deduplication, and elevation lookup. A provider without PostGIS is disqualified.
- **The API needs the direct/unpooled endpoint.** Advisory locks in the merge transaction do not behave correctly through a transaction pooler.

## Proposed scope

Once a provider is chosen, document:

1. **Provisioning** — plan/tier, region, PostGIS extension enablement.
2. **Connection strategy** — pooled vs direct endpoints, which the API uses and why, connection limits vs. expected concurrency.
3. **Network access** — IP allowlisting or private networking, and what the API needs.
4. **Running the setup pipeline** — the full migration and seed order from `README.md` §D against the production instance, including how long reference-data seeding takes.
5. **Verification** — `verify:config` and `verify:city-boundary` against production.
6. **Ongoing migrations** — the procedure for applying a new migration to a live database with real data.

## Implementation notes

- Do not pre-write Neon-specific instructions before the decision. `docs/deployment-readiness.md` §4 explicitly defers this for that reason.
- Reference-data seeding (barangay polygons, DEM points, city boundary) is the slow, easy-to-forget step. Barangay resolution and elevation scoring **fail without it** — call that out prominently.
- The first `system_admin` must be created with `seed:admin` using **non-demo credentials**.
- Backups are #024; keep this issue to setup and connection concerns.

## Files likely involved

- `docs/deployment-readiness.md` §4
- `docs/runbook.md` (#022) — the executable version
- `docs/database.md` — only if production-specific notes are warranted
- `docs/project-status.md` §4.4

## Acceptance criteria

- [ ] A provider has been chosen and an instance provisioned with PostGIS enabled.
- [ ] Connection strategy documented, including why the API uses the direct endpoint.
- [ ] Full migration + seed order executed against production and documented, with timings.
- [ ] `verify:config` and `verify:city-boundary` pass against production.
- [ ] First `system_admin` created with non-demo credentials.
- [ ] The live-migration procedure is written down.

## Suggested tests

- Run `verify:config` and `verify:city-boundary` against the production instance.
- Confirm the API starts and serves a request against it.
- Confirm barangay resolution works — submit one report and check it resolves to a real barangay (this proves reference data actually loaded).

## Out of scope

Backups and restore (#024), monitoring (#025), credential rotation (#026), choosing the provider, and any change to application database code.

## Risks / notes

The highest-risk omission is reference-data seeding. Without `dem_points`, elevation is NULL — and `docs/triage-model.md` §10.4 documents that NULL elevation produces an **unclamped urgency factor above 1.0**, silently inflating scores. Verify the seed, do not assume it.

## Claude Code handoff prompt

```
DO NOT START — blocked until a production database provider is chosen for
PORAC-SDSS.

When unblocked:

Read first: docs/deployment-readiness.md §4, README.md §D (the full migration
and seed order — order is load-bearing), docs/database.md, CLAUDE.md (the
two-ORMs-by-column-type split and why the API needs the direct/unpooled
endpoint), docs/triage-model.md §10.4.

Two hard constraints: PostGIS is NOT optional (geometry columns, ST_* functions,
GiST indexes are core), and the API must use the DIRECT/unpooled endpoint —
advisory locks in the merge transaction misbehave through a transaction pooler.

Document, in docs/deployment-readiness.md §4 and the runbook: provisioning
(tier, region, PostGIS enablement); connection strategy (pooled vs direct, and
limits vs expected concurrency); network access (IP allowlist or private
networking); running the full migration + seed pipeline against production with
measured timings; verification; and the procedure for applying a future
migration to a live database with real data.

CALL OUT PROMINENTLY: reference-data seeding (barangays, DEM points, city
boundary) is not optional. Without dem_points, elevation is NULL, and
docs/triage-model.md §10.4 documents that NULL elevation produces an unclamped
urgency factor above 1.0 — silently inflating every score.

Create the first system_admin with seed:admin using NON-DEMO credentials.

Out of scope here: backups (#024), monitoring (#025), credential rotation
(#026). Do not change application database code.

Verify: verify:config and verify:city-boundary pass against production; the API
starts and serves a request; one submitted report resolves to a real barangay
(this proves reference data actually loaded). Then git diff --check
```
