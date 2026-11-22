# Product

## Register

product

## Platform

web

## Users

Two audiences, structurally separate, sharing one system:

- **LGU administrators** (MEO / MDRRMO staff) — desk-based, triaging dense ticket queues for hours at a time. They need to scan, sort, and act quickly: triage by Operational Priority, route tickets to the right office, monitor status across barangays, moderate flagged/fraud-suspect reports, and resolve tickets. Their job rewards density and reading speed over visual interest.
- **Citizens** — reporting municipal infrastructure hazards (flooding, road damage, etc.) outdoors on a phone, often under time pressure or bad weather. They need a simple, forgiving, mobile-first flow: take a photo, confirm location, submit, then track status. Their job rewards generous touch targets and forgiving inputs over density.

## Product Purpose

A municipal operations and citizen-reporting platform for infrastructure hazards. Citizens file reports; the system deduplicates them into tickets, ranks each ticket by Operational Priority (citizen severity, ticket age, barangay demand) — never a hazard or risk score — and routes them to the correct municipal office. Administrators triage by Operational Priority rather than reading order, monitor the barangay-level picture on a map, moderate integrity-flagged submissions, and track tickets through to resolution. Success looks like: citizens can report a hazard in under a minute standing in the rain, and staff can tell which of forty open tickets needs attention first without reading all forty.

## Positioning

The system recommends what to look at first — an Operational Priority (`priority_index`) per ticket, a numeric queue order built from citizen severity, ticket age and barangay demand (not submission order, and never a hazard or risk score, with no Low/Medium/High bands) — and routes the ticket to the office that owns it.

## Brand Personality

Trustworthy municipal service: calm, precise, unglamorous by design. It should feel like instrument-panel software for people doing real civic work — closer to institutional infrastructure than a product trying to sell itself. Confident without decoration; clear without being cold. Visual register is clean, quiet, information-dense and operational, built on the PORAC-SDSS brand (Porac Green with a restrained Sun Orange accent; see `docs/design-system.md`). The inspiration is design *discipline* (density, restraint, precision), not any other product's brand identity.

## Anti-references

Generic SaaS dashboard styling — gradient hero cards, excessive rounding, glassmorphism, decorative nested cards, side-stripe accent borders, uniform icon-tile grids. None of that reads as "municipal government software doing serious work"; it reads as a landing page. Also explicitly not: borrowing another product's brand identity rather than its design discipline (see Brand Personality).

## Design Principles

- **One meaning per color channel.** Ticket status (pipeline stage), citizen severity, and integrity flags (fraud/EXIF signals) are structurally independent systems that happen to render as color. They must never visually collide — a severity chip and a fraud-flag chip must never be reachable for by the same hue. Brand colors are chrome, never data; Operational Priority is shown as a number, never as color bands.
- **Density matches the audience, not the brand.** Admin surfaces are compact and information-dense (desk use, hours at a time); citizen surfaces are generous and forgiving (outdoor, one-handed, under stress). Same token scale, different steps on it — not two different design languages.
- **Borders over shadows.** Institutional software reads as precise, not floaty. Elevation is a 1px border, not a drop shadow, except where a shadow is functionally load-bearing (sticky headers, map popups).
- **Legibility over decoration.** Every visual choice should make the queue faster to scan or the report form harder to get wrong. Nothing is on the page to look designed.
- **Redundant encoding for color-carried meaning.** Status and severity hues can degrade under common color-blindness; names are always spelled out and map pins additionally encode meaning via size and ring weight. Never rely on hue alone.

## Accessibility & Inclusion

WCAG AA contrast (4.5:1 body text, 3:1 large text/UI) across all token pairs. All motion respects `prefers-reduced-motion`. Both the admin and citizen shells offer a user-toggled dark theme (default light, persisted in `localStorage` key `porac-theme`, no automatic OS switch). Citizen touch targets are a hard 44×44px floor with 16px minimum input text (below 16px, iOS Safari zooms on focus — disorienting for a one-handed outdoor report). Status and severity color-coding carries a non-color-dependent fallback (spelled-out names, pin size/ring) for colorblind users.
