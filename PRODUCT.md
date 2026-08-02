# Product

## Register

product

## Platform

web

## Users

Two audiences, structurally separate, sharing one system:

- **LGU administrators** (MEO / MDRRMO staff) — desk-based, triaging dense ticket queues for hours at a time. They need to scan, sort, and act quickly: triage by computed urgency, route tickets to the right office, monitor status across barangays, moderate flagged/fraud-suspect reports, and resolve tickets. Their job rewards density and reading speed over visual interest.
- **Citizens** — reporting municipal infrastructure hazards (flooding, road damage, etc.) outdoors on a phone, often under time pressure or bad weather. They need a simple, forgiving, mobile-first flow: take a photo, confirm location, submit, then track status. Their job rewards generous touch targets and forgiving inputs over density.

## Product Purpose

A municipal operations and citizen-reporting platform for infrastructure hazards. Citizens file reports; the system deduplicates them into tickets, computes an environmental-hazard urgency score (elevation + live precipitation + report-cluster density), and routes them to the correct municipal office. Administrators triage by computed urgency rather than reading order, monitor the barangay-level picture on a map, moderate integrity-flagged submissions, and track tickets through to resolution. Success looks like: citizens can report a hazard in under a minute standing in the rain, and staff can tell which of forty open tickets needs attention first without reading all forty.

## Positioning

The system computes what to worry about first — a real environmental-hazard score per ticket (not citizen-reported severity, not submission order) — and routes it automatically to the office that owns it.

## Brand Personality

Trustworthy municipal service: calm, precise, unglamorous by design. It should feel like instrument-panel software for people doing real civic work — closer to institutional infrastructure than a product trying to sell itself. Confident without decoration; clear without being cold. Visual register is Linear-inspired — clean, quiet, information-dense, operational — but the inspiration is the design *discipline* (density, restraint, precision), not Linear's own brand identity: no indigo/violet hue family, no reproduction of Linear's own layout or wordmark styling.

## Anti-references

Generic SaaS dashboard styling — gradient hero cards, excessive rounding, glassmorphism, decorative nested cards, side-stripe accent borders, uniform icon-tile grids. None of that reads as "municipal government software doing serious work"; it reads as a landing page. Also explicitly not: warm cream/sand neutral tones (no basis in the brand), and copying Linear's brand identity rather than its design discipline (see Brand Personality).

## Design Principles

- **One meaning per color channel.** Urgency (computed hazard score), status (pipeline stage), and integrity flags (fraud/EXIF signals) are three structurally independent systems that happen to render as color. They must never visually collide — a Critical-urgency chip and a fraud-flag chip must never be reachable for by the same hue.
- **Density matches the audience, not the brand.** Admin surfaces are compact and information-dense (desk use, hours at a time); citizen surfaces are generous and forgiving (outdoor, one-handed, under stress). Same token scale, different steps on it — not two different design languages.
- **Borders over shadows.** Institutional software reads as precise, not floaty. Elevation is a 1px border, not a drop shadow, except where a shadow is functionally load-bearing (sticky headers, map popups).
- **Legibility over decoration.** Every visual choice should make the queue faster to scan or the report form harder to get wrong. Nothing is on the page to look designed.
- **Redundant encoding for color-carried meaning.** Urgency is warm-only (yellow→orange→red), which degrades under common color-blindness; band names are always spelled out and map pins additionally encode band via size and ring weight. Never rely on hue alone.

## Accessibility & Inclusion

WCAG AA contrast (4.5:1 body text, 3:1 large text/UI) across all token pairs. All motion respects `prefers-reduced-motion`. **There is no dark-mode toggle, and none is planned** — each shell has exactly one fixed theme rather than a switchable `prefers-color-scheme`. That said, the admin shell's fixed theme is now deliberately dark (operational, desk-use, Linear-like), while the citizen shell's fixed theme stays light (outdoor daylight legibility); see DESIGN.md §0 for why this isn't a reversal of the earlier "no dark mode" decision, just a clarification of what "dark mode" meant. Citizen touch targets are a hard 44×44px floor with 16px minimum input text (below 16px, iOS Safari zooms on focus — disorienting for a one-handed outdoor report). Urgency color-coding carries a non-color-dependent fallback (spelled-out band names, pin size/ring) for colorblind users.
