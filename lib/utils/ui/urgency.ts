import { urgencyLevelFromScore, type UrgencyLevel } from "@/lib/utils/urgency";

// Single source of truth for urgency_band -> visual style. Was previously
// defined twice and drifting (DESIGN.md §8.3): Tailwind classes in
// admin/tickets/page.tsx and raw hex in admin/map/MapClient.tsx both used
// green for Low, independently of each other.
export type UrgencyBand = "Low" | "Medium" | "High";

interface UrgencyBandStyle {
  // Solid fill for non-Tailwind consumers (Leaflet divIcon inline styles).
  hex: string;
  // Badge classes: Low/Medium are tinted, High is solid — the
  // escalation rule in DESIGN.md §2.2.
  className: string;
}

const URGENCY_BAND_STYLE: Record<UrgencyBand, UrgencyBandStyle> = {
  Low: {
    hex: "#5b7290",
    className: "bg-urgency-low-tint text-urgency-low-ink border border-urgency-low-edge",
  },
  Medium: {
    hex: "#a68300",
    className: "bg-urgency-medium-tint text-urgency-medium-ink border border-urgency-medium-edge",
  },
  High: {
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

// Ticket Queue's single badge helper: both the Hazard Urgency Score column
// (raw number) and the Hazard Urgency Level column (label) call this and
// render its className, so the two columns can never show a mismatched
// score/badge pair for the same priority_score (the bug this replaces —
// see docs/design-system.md 3.2 and TicketsWorkspace.tsx's TicketRow/
// TicketCard).
export function getUrgencyBadgeConfig(priorityScore: number | null): UrgencyBadgeConfig {
  if (priorityScore === null) {
    return { level: "LOW", label: "—", className: "bg-line-100 text-ink-500" };
  }
  const level = urgencyLevelFromScore(priorityScore);
  return { level, ...URGENCY_BADGE_CONFIG[level] };
}
