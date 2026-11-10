# Phase 8d-3 migration coverage

Run `pnpm --prefix api test:migrations`. Set `PGLITE_MODULE_ROOT` to the external
pinned PGlite/PostGIS install documented in testing.md. For the older Drizzle
PGlite adapter, set `NODE_PATH` to that installation's `node_modules` directory.
No real database URL or running API/web server is required.

The umbrella runs five harnesses sequentially and fails if any child fails:

| Harness | Coverage |
| --- | --- |
| migration-chain.pglite.cjs | Real 0000-onward SQL/PostGIS at historical checkpoints, first/repeat runners, refusal snapshots, injected rollback and final-state historical runner compatibility |
| assessment-alignment.pglite.cjs | Detailed 0048 data conversion, invalid legacy input, constraints, rollback and service compatibility |
| phase8b-contraction.pglite.cjs | Detailed 0049 dependency inventory, mixed-state refusal, protected-object mutations, rollback and service compatibility |
| ticket-acknowledgments-contraction.pglite.cjs | Detailed 0050 archive codec/count/checksum guards, dependencies, rollback, acknowledgment/timeline behavior and historical runners |
| audit-append-only.pglite.cjs | 0047 historical value preservation, repeat SQL and database-enforced UPDATE/DELETE refusal |

The older detailed harnesses retain their selected-migration or substitute-table
fixtures. They are supplementary checks; the new full-chain harness supplies the
real-schema evidence rather than claiming those old fixtures are full baselines.
The existing fresh-database harness separately covers the complete empty chain,
reference importers and actual seed CLIs in memory; it remains in CI.

## Full-chain scenarios

| Migration | New full-chain checks |
| --- | --- |
| 0031, 0033, 0038, 0039, 0046, 0047 | First and repeat runner application on empty and populated operational starts; existing audit fields preserved. Standalone-only 0033/0046/0047 run in guarded child processes. |
| 0045 | First/repeat application; completed-without-time and cancelled-with-completion preflight refusals; failure after column creation rolls back. |
| 0048 | First/repeat application; quoted/Unicode content, microsecond time, both reasons and JSON constraints preserved; NULL assessor and mixed-state refusals; failure after renames/backfill rolls back. |
| 0049 | First/repeat application; unexpected view dependency and missing audit-trigger refusals; failure after retired-object drops rolls back. |
| 0050 | First/repeat application with the real archive reader and synthetic in-memory rows; missing archive and dependency refusals; failure after FK drop rolls back. |
| Final 0050 state | 0031/0033/0038/0039/0045/0046/0047/0048/0049/0050 runners execute twice without changing the catalog/data snapshots or reviving retired objects. |

Refusal and rollback snapshots include public table contents (including
history/audit), columns/defaults, constraints, triggers and enabled state,
application functions, indexes, rules, enums and sequence values. Repeat-run
comparisons use definitions and values, not unstable object OIDs. The append-only
trigger is tested with actual refused UPDATE/DELETE statements once 0047 exists.
0045 precedes that trigger: its initial cases preserve historical rows; final-state
reruns also prove the later audit protection survives.

## Isolation and limits

The umbrella passes children a small environment allowlist without inherited
database/provider credentials or NODE_OPTIONS. Its preload blocks env-file reads,
loadEnvFile, fetch and connections to unowned ports. Test listeners may bind only
port zero on 127.0.0.1; only their current owned ports may be connected to.
Standalone CLI children receive only the owning PGlite socket URL, run from a
private temporary folder and never use `--env-file`. Listeners and clients close
in finally blocks. Synthetic acknowledgment archives/logs remain outside the repo.
The maintenance archive CLI is never invoked.

The real baseline helper reads the tracked reference DDL/data and historical SQL;
it does not run a live seed. Invalid fixtures, injected SQL and audit mutation
attempts exist only in memory. This does not test Neon transport, concurrency
between multiple PostgreSQL sessions or lock contention under production load.

The full-chain tests exposed first-application defects in the historical 0031 and
0038 runners: their locked search_path starts with pg_catalog, while their CREATE
TABLE statements were unqualified. In PGlite, 0031 created its table in the wrong
schema and then rolled back; 0038 could report success without creating the public
canonical table. The owner approved qualifying public.report_acknowledgments and
public.acknowledgments in their respective runners. Explicit target-schema checks
cover both regressions alongside first/repeat and final-state cases. Historical
migration SQL is unchanged; no migration needs to be reapplied to an
already-current database. No real database was used to reproduce these defects.