// Category -> office auto-routing, per PLAN.md §10 and the manuscript's
// MEO-direct / MDRRMO-direct / Referral classification (Phase 3 alignment).
//
// directResponsibility distinguishes "this office owns fixing it" from
// "this office holds custody for triage/coordination, but the real work
// belongs to an external agency" (solid waste enforcement, water utility,
// barangay-level clearing, etc.). assigned_office is a NOT NULL Postgres
// enum restricted to MEO/MDRRMO, so every ticket still needs one of the two
// values regardless of classification — MDRRMO is never a sensible custody
// office for a non-disaster referral concern, so Referral categories default
// to MEO custody, flagged non-direct rather than silently treated as normal
// MEO work.
export interface CategoryRouting {
  office: 'MEO' | 'MDRRMO';
  directResponsibility: boolean;
}

const ROUTING_BY_CATEGORY: Record<string, CategoryRouting> = {
  // Manuscript-aligned category strings (Phase 3 follow-up) — what new
  // tickets are created with.
  'Pothole / Road Surface Damage': { office: 'MEO', directResponsibility: true },
  'Uneven Sidewalk': { office: 'MEO', directResponsibility: true },
  'Drainage / Culvert / Manhole Issue': { office: 'MEO', directResponsibility: true },
  'Streetlight Out': { office: 'MEO', directResponsibility: true },
  'Localized Flooding': { office: 'MDRRMO', directResponsibility: true },
  'Landslide / Slope Failure': { office: 'MDRRMO', directResponsibility: true },
  'Lahar / Debris-Flow Threat': { office: 'MDRRMO', directResponsibility: true },
  'Fallen Tree / Storm-Related Obstruction': { office: 'MDRRMO', directResponsibility: true },
  // Solid waste enforcement — referral/coordination concern.
  'Illegal Dumping Affecting Drainage or Road': { office: 'MEO', directResponsibility: false },
  // Barangay-level clearing — referral/coordination concern.
  'Overgrown Vegetation Obstructing Road or Signage': { office: 'MEO', directResponsibility: false },
  // Public water supply system — referral/coordination concern, not a
  // direct MEO repair responsibility.
  'Leaking Pipe / Water Supply Concern': { office: 'MEO', directResponsibility: false },
  // MEO intake/manual-review only — never automatically owned by MEO.
  'Other Minor Infrastructure Hazard': { office: 'MEO', directResponsibility: false },

  // Legacy category strings — no longer offered for new submissions
  // (api/src/contracts/schemas.ts's CATEGORIES), but historical tickets
  // still carry them and must keep routing/displaying sensibly. Each
  // legacy value's directResponsibility matches its new-category semantic
  // equivalent (see LEGACY_CATEGORIES' doc comment in schemas.ts).
  Flooding: { office: 'MDRRMO', directResponsibility: true },
  'Clogged Drain': { office: 'MEO', directResponsibility: true },
  'Fallen Tree': { office: 'MDRRMO', directResponsibility: true },
  Pothole: { office: 'MEO', directResponsibility: true },
  'Leaking Pipe': { office: 'MEO', directResponsibility: false },
  'Uncollected Garbage': { office: 'MEO', directResponsibility: false },
  'Illegal Dumping': { office: 'MEO', directResponsibility: false },
  'Overgrown Vegetation': { office: 'MEO', directResponsibility: false },
  // Aligned to false to match its new equivalent, "Other Minor
  // Infrastructure Hazard" — a generic "Other" report was never truly a
  // confirmed direct MEO responsibility, just triaged there by default.
  Other: { office: 'MEO', directResponsibility: false },
  // Stray/non-canonical value found in seed data, never a validated
  // category — routed as the closest manuscript-aligned equivalent
  // (Landslide / Slope Failure) instead of falling through to the generic
  // unknown-category default, per the Phase 3 follow-up audit.
  'Soil Erosion': { office: 'MDRRMO', directResponsibility: true },
};

// Unknown/unrecognized category strings (typos, stale seed data, a future
// category added to CATEGORIES but forgotten here) are never silently
// treated as normal MEO work — they land in MEO's queue for triage but
// flagged non-direct, same as an explicit Referral category.
const UNKNOWN_CATEGORY_ROUTING: CategoryRouting = {
  office: 'MEO',
  directResponsibility: false,
};

export function categoryRouting(category: string): CategoryRouting {
  return ROUTING_BY_CATEGORY[category] ?? UNKNOWN_CATEGORY_ROUTING;
}

export function officeForCategory(category: string): 'MEO' | 'MDRRMO' {
  return categoryRouting(category).office;
}
