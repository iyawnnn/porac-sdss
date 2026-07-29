// Pure helpers, safe to import from client components (no DB import) — see
// lib/admin/moderation.ts for the server-only query/mutation functions.

// Real detector output only — the actual pipeline flags EXIF/GPS/staleness/
// duplicate-image/boundary issues (see app/api/reports/route.ts). Grouped
// into three honest categories rather than invented ones like "spam/bot",
// since no such detector exists and mislabeling erodes moderator trust.
export type FlagCategoryKey = "duplicate" | "location" | "authenticity" | "other";

export interface FlagCategory {
  key: FlagCategoryKey;
  label: string;
  className: string;
}

const FLAG_CATEGORIES: Record<FlagCategoryKey, FlagCategory> = {
  duplicate: { key: "duplicate", label: "Duplicate image", className: "bg-violet-100 text-violet-700 border-violet-200" },
  location: { key: "location", label: "Location mismatch", className: "bg-amber-100 text-amber-800 border-amber-200" },
  authenticity: { key: "authenticity", label: "Photo authenticity", className: "bg-rose-100 text-rose-700 border-rose-200" },
  other: { key: "other", label: "Flagged", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function getFlagCategory(flag: string): FlagCategory {
  if (flag.startsWith("DUPLICATE_IMAGE:")) return FLAG_CATEGORIES.duplicate;
  if (flag === "LOCATION_MISMATCH" || flag.startsWith("BOUNDARY_FALLBACK:")) return FLAG_CATEGORIES.location;
  if (flag === "NO_EXIF" || flag === "STALE_PHOTO") return FLAG_CATEGORIES.authenticity;
  return FLAG_CATEGORIES.other;
}

const CATEGORY_WEIGHT: Record<FlagCategoryKey, number> = {
  duplicate: 35,
  location: 30,
  authenticity: 25,
  other: 15,
};

// Deterministic heuristic, not a model score: each distinct signal category
// adds its weight, and repeated signals within a category nudge it further.
export function computeRiskScore(flags: string[]): number {
  if (flags.length === 0) return 0;
  const categories = new Set(flags.map((f) => getFlagCategory(f).key));
  let score = 0;
  for (const key of categories) score += CATEGORY_WEIGHT[key];
  if (flags.length > categories.size) score += 10;
  return Math.min(100, score);
}

export type RiskBand = "low" | "medium" | "high";

export function riskBand(score: number): RiskBand {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
