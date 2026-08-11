# [Deferred] Video uploads - deliberately out of scope

**Labels:** `deferred`, `wontfix`, `product`
**Type:** Decision record — **explicitly not planned**
**Priority:** None

> **This issue exists to record a decision, not to schedule work.** Video upload support is out of scope for PORAC-SDSS. Do not implement it.
>
> **Note:** like #029, this is **not currently recorded in `docs/project-status.md` §5**. If the team wants the decision formally captured in the project docs, add it there — this draft records the reasoning meanwhile.

## Background

Report evidence is a single still photo, validated at upload with an 8 MB cap and a MIME allowlist of `image/jpeg`, `image/png`, `image/webp` (`ParseFilePipe` in `reports.controller.ts` and `tickets.controller.ts`). Storage is Cloudinary.

## The decision

**Video uploads are not planned and should not be added.**

## Reasoning

1. **The integrity pipeline is image-specific.** EXIF GPS extraction, the perceptual-hash duplicate check (dHash via `sharp`), and the stale-photo timestamp check all operate on still images. Video would bypass the entire fraud-detection layer, or require a parallel implementation of it.

2. **Upload constraints do not transfer.** An 8 MB cap is generous for a phone photo and useless for video. Raising it materially changes the abuse surface on a public, citizen-facing endpoint that is deliberately rate-limited.

3. **The citizen flow is built around a single still.** The photo-first gate, EXIF pre-fill, the >100m pin warning — all assume one image with extractable metadata.

4. **Bandwidth reality.** Citizens submit outdoors on mobile, often in bad weather during an active hazard. `docs/features.md` frames the target as "report a hazard in under a minute standing in the rain." Video upload works against that directly.

5. **Storage and cost.** Video changes the Cloudinary cost profile by orders of magnitude, for a municipal system with no committed hosting budget.

6. **It solves no stated problem.** No requirement, from the roadmap or otherwise, asks for it.

## What would have to change to revisit this

A real, stated operational need from MEO/MDRRMO that a still photo demonstrably cannot meet — plus answers for fraud detection, size limits, cost, and mobile upload experience. Absent that, the answer stays no.

## Acceptance criteria

**Not applicable — this is not scheduled work.** There is nothing to accept.

The only "done" state for this issue is a deliberate decision: either it is promoted into `docs/project-status.md` §4 with a stated requirement (at which point a real issue with real acceptance criteria replaces this one), or it is closed as not planned.

## Out of scope

All of it. This issue is the record of the decision.

## Risks / notes

Recording this deliberately so it is not re-litigated informally, and so that "why not video?" has a written answer for a capstone panel.

## Claude Code handoff prompt

```
DO NOT IMPLEMENT. This is a decision record: video uploads are out of scope for
PORAC-SDSS.

If asked to add video upload support, do not proceed. Point at this decision
and its reasoning:
- The integrity pipeline (EXIF GPS, perceptual-hash duplicate detection,
  stale-photo check) is image-specific; video bypasses fraud detection entirely.
- The 8 MB cap and image/jpeg|png|webp allowlist exist for good reasons on a
  public, rate-limited, citizen-facing endpoint.
- The citizen flow is photo-first by design and assumes extractable EXIF.
- Citizens upload outdoors on mobile during active hazards — video works
  against the "report in under a minute standing in the rain" goal.
- No stated requirement asks for it.

If someone insists it is now required, it needs a real operational need from
MEO/MDRRMO plus answers on fraud detection, size limits, cost, and mobile
upload experience — before any code.

Do not relax the MIME allowlist or the size cap in ParseFilePipe
(api/src/reports/reports.controller.ts, api/src/admin/tickets.controller.ts)
for any reason short of that.
```
