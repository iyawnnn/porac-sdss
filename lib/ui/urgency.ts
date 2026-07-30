import { urgencyLevelFromScore, type UrgencyLevel } from "@/lib/triage/urgency";

// Single source of truth for urgency_band -> visual style. Was previously
// defined twice and drifting (DESIGN.md §8.3): Tailwind classes in
// admin/tickets/page.tsx and raw hex in admin/map/MapClient.tsx both used
// green for Low, independently of each other.
export type UrgencyBand = "Low" | "Medium" | "Critical";

interface UrgencyBandStyle {
  // Solid fill for non-Tailwind consumers (Leaflet divIcon inline styles).
  hex: string;
  // Badge classes: Low/Medium are tinted, Critical is solid — the
  // escalation rule in DESIGN.md §2.2.
  className: string;
}

const URGENCY_BAND_STYLE: Record<UrgencyBand, UrgencyBandStyle> = {
  Low: {
    hex: "#d99a00",
    className: "bg-urgency-low-tint text-urgency-low-ink border border-urgency-low-edge",
  },
  Medium: {
    hex: "#e2680e",
    className: "bg-urgency-medium-tint text-urgency-medium-ink border border-urgency-medium-edge",
  },
  Critical: {
    hex: "#c42b1c",
    className: "bg-urgency-critical text-white",
  },
};

// Fallback for null/unknown band — neutral canvas + ink-500, stays in token system.
const FALLBACK_STYLE: UrgencyBandStyle = {
  hex: "#808c99",
  className: "bg-canvas text-ink-500",
};

export function getUrgencyBandStyle(band: string | null | undefined): UrgencyBandStyle {
  return URGENCY_BAND_STYLE[band as UrgencyBand] ?? FALLBACK_STYLE;
}

export interface UrgencyBadgeConfig {
  level: UrgencyLevel;
  label: string;
  className: string;
}

const URGENCY_BADGE_CONFIG: Record<UrgencyLevel, Omit<UrgencyBadgeConfig, "level">> = {
  HIGH: { label: "High", className: "bg-urgency-critical text-white" },
  MEDIUM: { label: "Medium", className: "bg-urgency-medium-tint text-urgency-medium-ink border border-urgency-medium-edge" },
  LOW: { label: "Low", className: "bg-urgency-low-tint text-urgency-low-ink border border-urgency-low-edge" },
};

// Ticket Queue's single badge helper: re-derives the level from the same
// priorityScore the PRIORITY column renders, via the triage engine's own
// threshold function — so the two columns can never show a mismatched
// score/badge pair (the bug this replaces).
export function getUrgencyBadgeConfig(priorityScore: number | null): UrgencyBadgeConfig {
  if (priorityScore === null) {
    return { level: "LOW", label: "—", className: "bg-line-100 text-ink-500" };
  }
  const level = urgencyLevelFromScore(priorityScore);
  return { level, ...URGENCY_BADGE_CONFIG[level] };
}
