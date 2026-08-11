# Add a backup and restore verification checklist

**Labels:** `deployment`, `priority:p2`, `blocked`
**Type:** Chore (operational)
**Priority:** P2 within deployment work — **blocked on a database provider**, but the highest-value item once unblocked

## Background

`docs/deployment-readiness.md` §4 and §9. No backups are configured and no restore has ever been tested.

## Problem

This system holds citizen-submitted reports, an audit trail intended to survive scrutiny, and operational ticket history for a municipal office. Losing it would be unrecoverable — reports come from the public and cannot be regenerated.

**An untested backup is not a backup.** `docs/deployment-readiness.md` §4 flags restore verification as "the single most commonly skipped item on this page."

## Proposed scope

1. **Configure automated backups** on the chosen provider — frequency and retention decided deliberately, not left at defaults.
2. **Perform a real restore** into a scratch database.
3. **Verify the restore is actually usable**, not just that the job succeeded:
   - PostGIS geometry columns intact — `barangays.geom`, `dem_points.geom`, `tickets.geom` all queryable.
   - Reference data present (29 barangays, DEM points, city boundary).
   - Row counts match for `reports`, `tickets`, `work_orders`, `admin_audit_events`.
   - The API starts against the restored database and serves a request.
   - A report submitted against the restored database resolves to a real barangay.
4. **Write the restore procedure down** with the measured time it took.
5. **Decide the PITR window** and record it.

## Implementation notes

- **PostGIS is the specific risk.** A logical dump that loses the PostGIS extension, spatial indexes, or SRID metadata will restore "successfully" and then fail at the first `ST_Contains`. Verify spatially, not just by row count.
- Record **how long a full restore takes** — that number is the real recovery time objective, and it belongs in the runbook.
- Test restoring into a *fresh* database, not over the existing one.
- Decide and record: what is the acceptable data-loss window, and does the backup frequency actually meet it?

## Files likely involved

- `docs/deployment-readiness.md` §4 and §10
- `docs/runbook.md` (#022) — the restore procedure belongs there
- `docs/project-status.md` §4.4

## Acceptance criteria

- [ ] Automated backups configured, with frequency and retention stated.
- [ ] A restore has actually been performed into a scratch database.
- [ ] Spatial verification passed — geometry queries work on the restored data.
- [ ] Reference data verified present after restore.
- [ ] The API starts and serves requests against the restored database.
- [ ] Restore duration measured and recorded.
- [ ] Procedure written into the runbook.
- [ ] PITR/retention window decided and documented.

## Suggested tests

- The restore itself is the test. Run `verify:config` and `verify:city-boundary` against the restored database, and submit one report to confirm barangay resolution works.

## Out of scope

Application-level export or archival features, disaster-recovery for the API process (stateless — redeploy), and off-provider backup replication unless a real requirement surfaces.

## Risks / notes

The failure mode this guards against is discovering during an actual incident that the backups were logically incomplete. Test the restore before you need it.

## Claude Code handoff prompt

```
DO NOT START — blocked until a production database provider is chosen and
provisioned for PORAC-SDSS (issue #023).

When unblocked — this is the highest-value deployment item:

Read first: docs/deployment-readiness.md §4 and §10, docs/database.md (what
each table holds and which are PostGIS-owned), README.md §D.

1. Configure automated backups. Choose frequency and retention deliberately and
   state the reasoning — do not accept provider defaults silently.
2. Perform a REAL restore into a fresh scratch database (not over the existing
   one).
3. Verify the restore is USABLE, not merely that the job reported success:
   - PostGIS geometry intact: barangays.geom, dem_points.geom, tickets.geom all
     queryable. This is the specific risk — a logical dump can lose the PostGIS
     extension, spatial indexes, or SRID metadata and still "succeed", then fail
     at the first ST_Contains.
   - Reference data present: 29 barangays, DEM points, city boundary.
   - Row counts match for reports, tickets, work_orders, admin_audit_events.
   - The API starts against the restored DB and serves a request.
   - One submitted report resolves to a real barangay.
4. MEASURE how long the full restore takes — that is the real recovery time
   objective and belongs in the runbook.
5. Decide and record the acceptable data-loss window, and confirm the backup
   frequency actually meets it.

Write the restore procedure into docs/runbook.md (#022) and update
docs/deployment-readiness.md §4/§10 and docs/project-status.md §4.4.

Verify: verify:config and verify:city-boundary pass against the RESTORED
database. Then git diff --check
```
