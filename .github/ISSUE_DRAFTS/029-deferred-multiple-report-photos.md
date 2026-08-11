# [Deferred] Support multiple photos per report

**Labels:** `deferred`, `discussion`, `product`
**Type:** Product idea — **not scheduled, not approved**
**Priority:** None — deferred

> **This is a placeholder for discussion, not queued work.** Do not implement it. `docs/project-status.md` §1 states no new product feature is currently queued; the project is in a polish/testing/hardening phase.
>
> **Note:** unlike the other deferred items in this backlog, this idea is **not currently recorded in `docs/project-status.md` §5**. Before it could move anywhere, it would need to be added there with a stated reason. Right now it exists only as this draft.

## Background

A report currently carries exactly one photo (`reports.image_url`). The submission flow is deliberately photo-first: the map and barangay picker stay disabled until a photo is attached, because location is anchored to photographic evidence rather than typed in freehand.

That single photo also drives the integrity pipeline — EXIF GPS extraction, the `LOCATION_MISMATCH` / `NO_EXIF` / `STALE_PHOTO` flags, and the perceptual-hash `DUPLICATE_IMAGE` check.

## The idea

Let a citizen attach more than one photo to a single report — for example a wide shot for context plus a close-up of the damage.

## Why it is not queued

Not a small change. It touches:

- **Schema** — `reports.image_url` is a single column; multiple photos need a related table or an array, plus a `docs/database.md` entry.
- **The integrity pipeline** — which photo's EXIF is authoritative for location? What if two photos disagree? What does `LOCATION_MISMATCH` mean across a set? The perceptual-hash duplicate check would need to compare sets, not images.
- **Upload limits** — currently 8 MB and a MIME allowlist per file. Multiple photos need a per-report cap, and Cloudinary usage rises.
- **Every consuming surface** — Ticket Detail evidence section, Case Closure Summary, `ReportImage`, and the admin flagged-reports queue.
- **The citizen flow** — the photo-first gate assumes one photo.

None of that is prohibitive, but it is a genuine feature with a design phase, not a small addition.

## What would need to happen first

1. A stated real requirement — evidence that one photo is actually insufficient for MEO/MDRRMO triage in practice.
2. Adding it to `docs/project-status.md` §5 with that reason.
3. A design decision on EXIF authority across multiple photos, which is the genuinely hard part.
4. Explicit promotion into §4 by the team.

## Acceptance criteria

**Not applicable — this is not scheduled work.** There is nothing to accept.

The only "done" state for this issue is a deliberate decision: either it is promoted into `docs/project-status.md` §4 with a stated requirement (at which point a real issue with real acceptance criteria replaces this one), or it is closed as not planned.

## Out of scope

Everything, until the above happens.

## Risks / notes

The integrity pipeline is the reason this is harder than it looks. The single-photo assumption is load-bearing for location verification, and weakening that verification to support multiple photos would be a real regression in fraud resistance — the opposite of what this project's hardening phase is for.

## Claude Code handoff prompt

```
DO NOT IMPLEMENT. This is a deferred product idea, not queued work.

If someone asks you to work on multi-photo reports for PORAC-SDSS, first check
docs/project-status.md §1 (no new product feature is currently queued) and §5
(the deferred list — note this idea is not even recorded there yet).

If it is genuinely being promoted, the design questions that must be answered
BEFORE any code:
- Which photo's EXIF GPS is authoritative for the report's location?
- What do LOCATION_MISMATCH / NO_EXIF / STALE_PHOTO mean across a set?
- How does the perceptual-hash DUPLICATE_IMAGE check compare sets vs images?
- What is the per-report photo cap and total size limit?
- Schema shape: related table vs array column, plus a docs/database.md entry.

Read for context before designing: api/src/reports/reports.service.ts,
components/features/citizen/report/ReportForm.tsx, docs/features.md §2.2 and
§4.5, docs/database.md (reports).

Do not weaken the EXIF-based location verification to make multiple photos
easier — that verification is load-bearing for fraud resistance.
```
