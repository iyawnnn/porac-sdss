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
  Flooding: { office: 'MDRRMO', directResponsibility: true },
  // "Drainage structure defect" is MEO-scope, not a disaster-response
  // concern — moved from MDRRMO.
  'Clogged Drain': { office: 'MEO', directResponsibility: true },
  'Fallen Tree': { office: 'MDRRMO', directResponsibility: true },
  Pothole: { office: 'MEO', directResponsibility: true },
  'Uneven Sidewalk': { office: 'MEO', directResponsibility: true },
  'Streetlight Out': { office: 'MEO', directResponsibility: true },
  // Public water supply system — referral/coordination concern, not a
  // direct MEO repair responsibility.
  'Leaking Pipe': { office: 'MEO', directResponsibility: false },
  // Solid waste enforcement — referral/coordination concern.
  'Uncollected Garbage': { office: 'MEO', directResponsibility: false },
  'Illegal Dumping': { office: 'MEO', directResponsibility: false },
  // Barangay-level clearing — referral/coordination concern.
  'Overgrown Vegetation': { office: 'MEO', directResponsibility: false },
  Other: { office: 'MEO', directResponsibility: true },
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
