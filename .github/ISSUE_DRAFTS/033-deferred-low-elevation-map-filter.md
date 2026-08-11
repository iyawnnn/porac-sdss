# [Deferred] Low-elevation / hazard-prone map filter

**Labels:** `deferred`, `discussion`, `product`
**Type:** Product idea — **not scheduled**
**Priority:** None — deferred

> **Deferred, not queued.** Listed in `docs/project-status.md` §5. Do not implement.

## Background

Elevation is central to the urgency model — `elevationFactor` is one of the three equally-weighted inputs to `urgency_score`, inverse-normalized so lower ground scores higher (`docs/triage-model.md` §4.1).

But elevation is **display-only** everywhere in the UI:

- Barangay Insights shows a DEM-derived min/avg/max per barangay, explicitly marked "display only, never a filter."
- The admin map filters on category, urgency, status, barangay name, and search — **not elevation**.
- Map Presets deliberately shipped without a "low-elevation / hazard-prone areas" MDRRMO preset, because there was no elevation filter for it to link to. That was recorded at the time as a deliberate omission, not an oversight — a preset linking to a filter the map cannot apply would be exactly the "fake navigation link" risk `docs/project-status.md` §7 warns about.

## The idea

Let MDRRMO filter the map (and possibly the ticket queue) to low-lying, flood-prone areas — then add the map preset that was deferred alongside it.

## Why it is deferred

The concept is sound and MDRRMO-relevant. The open questions are about what "low elevation" should actually mean:

- **Absolute threshold, or relative?** `docs/triage-model.md` §10.2 notes elevation is absolute height inverse-normalized city-wide, **not** local depression or flow accumulation. Water pools in local lows, which the current model does not capture. A naive "below X metres" filter inherits that limitation.
- **Ticket elevation, or barangay elevation?** Tickets carry a point elevation; Barangay Insights shows a range. These answer different questions.
- **Filter, or band?** A slider, a fixed "low/medium/high" band, or a percentile?
- **Where does it apply?** Map only, or the ticket queue too? Adding it to the queue means server-side query support, not just client-side narrowing.
- **Does it need the D8 flow work first?** `PLAN.md` §15 Q3 (downstream flow mapping) is still open. A hydrologically meaningful filter may depend on it.

That last question is the real blocker — a filter labelled "hazard-prone" that only means "low absolute altitude" could mislead the people relying on it.

## What would need to happen first

1. A stated need from MDRRMO for the filter specifically.
2. A decision on absolute vs. local-depression semantics — ideally alongside `PLAN.md` §15 Q3.
3. Promotion from `docs/project-status.md` §5 into §4.
4. Only then, the deferred Map Preset can ship with it.

## Acceptance criteria

**Not applicable — this is not scheduled work.** There is nothing to accept.

The only "done" state for this issue is a deliberate decision: either it is promoted into `docs/project-status.md` §4 with a stated requirement (at which point a real issue with real acceptance criteria replaces this one), or it is closed as not planned.

## Out of scope

Everything until the above. In particular, **do not add an elevation filter and label it "hazard-prone"** without resolving the semantics question — that would overstate what the data supports.

## Risks / notes

`docs/triage-model.md` §10.6 warns against presenting the model as more precise than it is. A "hazard-prone areas" filter is exactly the kind of label that implies hydrological modelling the system does not do.

## Claude Code handoff prompt

```
DO NOT IMPLEMENT. This is deferred in docs/project-status.md §5.

If someone asks you to add a low-elevation or hazard-prone map filter to
PORAC-SDSS, these questions must be answered before any code:

1. What does "low elevation" mean here? docs/triage-model.md §10.2 documents
   that elevation is ABSOLUTE height inverse-normalized city-wide, NOT local
   depression or flow accumulation. Water pools in local lows. A "below X
   metres" filter inherits that limitation.
2. Ticket point elevation, or barangay elevation range? They answer different
   questions.
3. Slider, fixed band, or percentile?
4. Map only, or the ticket queue too? The queue would need server-side query
   support, not just client-side narrowing.
5. Does this depend on the D8 downstream-flow work (PLAN.md §15 Q3, still open)?

CRITICAL: do not ship a filter labelled "hazard-prone" that only means "low
absolute altitude". docs/triage-model.md §10.6 warns against presenting the
model as more precise than it is, and that label implies hydrological modelling
this system does not do.

If it does ship, the deferred MDRRMO "low-elevation" Map Preset can ship with
it — but not before, or it becomes a link to a filter the map cannot apply
(the "fake navigation link" risk in docs/project-status.md §7).

Read for context: docs/triage-model.md §4.1 and §10.2, docs/features.md §3.6
and §3.7, docs/project-status.md §3 (Map Presets entry) and §5.
```
