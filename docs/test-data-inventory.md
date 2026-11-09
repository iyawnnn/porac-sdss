# Test-data inventory and cleanup design

Phase 8c-4 produces a **read-only review report**. It has no apply/delete/reset mode, cleanup SQL or database migration. A pattern match is a candidate for investigation, never permission to remove a record. The agent tests only in memory; the owner runs the real-database inventory after reviewing the change.

## Owner-operated command

Keep `api/.env` owner-managed. The command requires an explicit matching target and an explicit date scope. It validates both before constructing its own client; it never imports the shared seed/migration database module. Existing seed guards remain unchanged and continue to refuse production.

For the owner's reviewed production read-only inventory, from PowerShell at the repo root:

```powershell
pnpm --prefix api inventory:test-data -- --target production --confirm-production-read-only --all-dates
```

For the disposable copy, use `--target copy --all-dates`. For a loopback development database, use `--target local --all-dates`. A target mismatch refuses before connecting. Production/copy must be the known ep-steep-mouse/ep-noisy-leaf endpoint respectively, database neondb; unknown hosts, multi-host URLs, host override parameters and mutation flags are refused. Only sslmode and channel_binding URL query options are accepted. No connection URL or raw connection/SQL error detail is printed.

Instead of `--all-dates`, the owner can select a creation window:

```powershell
pnpm --prefix api inventory:test-data -- --target production --confirm-production-read-only --from 2026-01-01T00:00:00+08:00 --to 2026-11-10T00:00:00+08:00
```

That is an example, not a recommended cleanup window. The start is inclusive and end exclusive. Full ISO timestamps with timezone are mandatory. Dates restrict candidate matches; references, real co-members and merge history outside the window remain visible as protected context. There is no default window or automatic widening of it.

The process does not start the application, send email, upload media, refresh providers, run seeds/migrations/archive scripts, log an administrative action or change any database row. It opens a repeatable-read, read-only transaction, verifies final contracted schema/audit protection, and sets 30-second statement, 3-second lock and 60-second idle-transaction timeouts. A per-table cap of 100,000 rows and a 25 MiB report cap refuse an incomplete result rather than silently truncating it. These are small-project bounds, not a large-database export facility. Use a read-only database credential as an additional owner-side precaution when available; do not paste credentials into the command or chat.

## Files and privacy

Successful output is under `%LOCALAPPDATA%\PORAC-SDSS\phase8c-inventory\<timestamp>-<pid>\` on Windows (XDG_DATA_HOME or ~/.local/share on Linux):

- `inventory.json`: candidates, IDs, dates, match reasons, counts, blockers, typed links, missing-target indicators, context entities and unresolved-reference warnings.
- `summary.md`: short review instructions and counts.
- `manifest.json`: schema version, Git commit, snapshot time and SHA-256 of the JSON bytes.

The command prints only the target prefix, output folder and counts. Each run creates a new folder; files are never overwritten. Output is required to be local and outside the repo. Existing output-path links are refused and existing ancestors are checked before making directories. Windows ACLs restrict the new run folder to the current user's SID; Unix files/directories use 0600/0700 permissions. Reports remain private local working artifacts and must not be committed or copied into docs, public folders, a PR or chat. A report without its completed manifest is not a successful inventory.

The database reader selects only required identifiers, timestamps, test-marker fields and reference metadata. It does not select password/token hashes, provider subjects, descriptions, notes, photo URLs, IPs, notification text or historical actor snapshots. Emails/titles and audit metadata used for matching are not copied into the report. Tracking references must match the generated PRC shape to be included. Audit output contains typed IDs/paths and warning codes, never raw private metadata, reasons or summaries. IDs and tracking references are still sensitive; the report is for the owner.

## Candidate rules and reference coverage

Current primary markers are an anchored `e2e-...@...` account email or report/Work Order title starting with the separate `E2E` token (space, colon, underscore, hyphen or end). Embedded `E2E` text and words such as `E2Example` do not match. Both still require owner review; a malicious or genuine user could use a test-looking name. Canonical MEO/MDRRMO/Focal/System Admin and citizen1-citizen5 demo account IDs are explicitly listed as protected context. The phase8c scenario demo is not automatically classified as disposable E2E data.

Tickets containing matched reports are review candidates only when their own creation date also matches. Real/non-matching or out-of-window co-members mark a ticket mixed. Current merge pointers and typed merge/regroup audit metadata connect ticket context in both directions, including merged-away historical tickets; this inventory does not put them back in an operational queue. A merge/regroup chain connected to mixed data marks affected candidate reports/tickets for retention and review. Linked records are not promoted to candidates simply because a candidate references them.

Coverage includes:

- Reports and their citizens/tickets/screeners; tickets and merge/resolver links.
- Work Orders, their ticket/creator/assignee/cancellation actor/replacement order, assessments and the restrictive assessor FK.
- Physical `acknowledgments`, report intake actions, routing, status/office/Work Order history, resolution feedback and legacy verifications.
- Citizen identities, reset-token row IDs, citizen audit, admin saved views and citizen-keyed submission-rate events.
- Notification recipient_type/recipient_id, entity_type/entity_id and recognized local report/ticket/Work Order hrefs. A Work Order notification can point to a Work Order while linking to its ticket; both are traced.
- Administrative audit actor IDs, typed targets, and known typed JSON metadata including movedReportIds, mergedTicketId, fromTicketId, toTicketId, newTicketId, ticketId, reportId, workOrderId, assignment changes and latestReferralId. Export audit target IDs identify the exporting admin, not a report.
- Hazard Information and rainfall rows linked to a ticket.

The live FK catalog is checked against the registry. An unknown incoming FK into an inventoried public table causes failure, requiring a reviewed coverage update. Polymorphic IDs retain their namespaces. Legacy verification text is treated as a citizen ID only when it is a canonical positive decimal; arbitrary text is never cast. References to missing rows, unknown audit actions/targets/metadata, unknown notification routes and excessive metadata depth are surfaced as unresolved, with no raw sensitive values. Each typed link reports whether its target exists.

This is **not proof that all historical references have been found**. Free-text IDs, historical emails, legacy external identity strings, unknown future soft-reference columns, email/IP-only throttle counters and unstructured old metadata cannot be certified automatically. Unknown cases remain for owner review; nothing is declared safe to delete. The report must not be used as an executable cleanup list.

## Decisions reserved for the owner

Previously observed production/copy leftovers were roughly 114 E2E-titled reports and 615 e2e- citizen accounts. Those are old observations, not fresh counts from this script. The owner must inspect the new report and confirm which records are actually tests, especially mixed tickets, real-account reports and historical audit references.

No deletion is implemented in Phase 8c. Never delete anything referenced by audit. Prefer retaining history and separately designing reversible retirement where supported. Citizens have no is_active field; there is no report archive field either. Do not invent a deactivation mechanism or repurpose evidence flags, moderation or Rejected status as a hidden production archive. Existing guarded E2E cleanup utilities are not a production cleanup design and are not called by this command.

Before any later actual change: the owner reviews the exact candidate IDs and dependencies, makes a Neon backup branch, and approves a separately reviewed reversible operation with a recovery plan. That is outside this change.

## Offline verification

Unit command: `pnpm --prefix api test --runInBand test-data-inventory.spec.ts`.

With the external pinned PGlite install from [fresh-database-check.md](fresh-database-check.md), run `pnpm --prefix api test:data-inventory`. It builds the real 0000-0050/PostGIS baseline, wraps postgres.js with drizzle, inserts only in-memory fixtures, and verifies audit metadata, mixed historical membership, namespace collisions, constraints, privacy, bounded reads, unmapped-FK refusal and protection checks. It proves PostgreSQL rejects an injected UPDATE while the reader's transaction is active and verifies all inventoried table fingerprints before/after repeated runs.

The actual CLI test uses only its own exact PGlite loopback port, a minimal environment, an empty scratch cwd and the existing network/env/write safety preload. It does not invoke `inventory:test-data` (which intentionally loads the owner's env file); it runs the TypeScript entrypoint without `--env-file`. Private artifact/digest and in-repo output-refusal checks are included. CI runs these checks with the existing pinned external PGlite packages after the fresh-database test. The owner's production dry run remains a separate manual action.
