import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import {
  Construction,
  Droplet,
  Droplets,
  LightbulbOff,
  Mountain,
  Sprout,
  Trash,
  Trash2,
  TreePine,
  Waves,
  Wrench,
  CircleDot,
  Disc,
  type LucideIcon,
} from "lucide-react";

// Admin-map-only category markers â€” deliberately separate from
// lib/gis/markerIcon.ts (neutralMarkerIcon/priorityMarkerIcon), which the
// citizen, Ticket Detail and Focal maps use. Category -> icon/color is built directly
// from lib/types/admin-ticket-constants.ts's TICKET_CATEGORIES strings
// (single source of truth), not a duplicated list.
export interface CategoryMarkerSpec {
  icon: LucideIcon;
  color: string;
}

export const CATEGORY_MARKER_SPEC: Record<string, CategoryMarkerSpec> = {
  // Manuscript-aligned category strings (Phase 3 follow-up).
  // Names and the drainage/manhole split from manuscript revision Phase 2,
  // step 2a; the renamed ones keep their old icon and colour.
  "Pothole / Road Surface Damage": { icon: CircleDot, color: "#ea580c" },
  "Damaged Manhole Cover": { icon: Disc, color: "#4338ca" },
  "Clogged Drainage / Damaged Culvert": { icon: Droplets, color: "#0891b2" },
  "Localized Flooding": { icon: Waves, color: "#2563eb" },
  "Rain-Induced Slope Failure/Landslide": { icon: Mountain, color: "#78350f" },
  "Lahar or Volcanic Debris-Flow Threat": { icon: Waves, color: "#9a3412" },
  "Fallen Tree or Storm-Related Road Obstruction": { icon: TreePine, color: "#16a34a" },
  "Illegal Dumping Affecting Drainage or Road": { icon: Trash2, color: "#7c3aed" },
  "Overgrown Vegetation Obstructing Road or Signage": { icon: Sprout, color: "#65a30d" },
  "Leaking Pipe / Water Supply Concern": { icon: Droplet, color: "#0d9488" },
  "Other Minor Infrastructure Hazard": { icon: Wrench, color: "#64748b" },
  // Unchanged names, shared by both the legacy and new category sets.
  "Uneven Sidewalk": { icon: Construction, color: "#b45309" },
  "Streetlight Out": { icon: LightbulbOff, color: "#eab308" },

  // Legacy category strings — kept so historical tickets keep their
  // original marker instead of falling back to the generic "Other" icon.
  Flooding: { icon: Waves, color: "#2563eb" },
  "Clogged Drain": { icon: Droplets, color: "#0891b2" },
  "Fallen Tree": { icon: TreePine, color: "#16a34a" },
  Pothole: { icon: CircleDot, color: "#ea580c" },
  "Leaking Pipe": { icon: Droplet, color: "#0d9488" },
  "Uncollected Garbage": { icon: Trash, color: "#78716c" },
  "Illegal Dumping": { icon: Trash2, color: "#7c3aed" },
  "Overgrown Vegetation": { icon: Sprout, color: "#65a30d" },
  Other: { icon: Wrench, color: "#64748b" },
  // Retired in manuscript revision Phase 2, step 2a (see LEGACY_CATEGORIES in
  // api/src/contracts/schemas.ts).
  "Drainage / Culvert / Manhole Issue": { icon: Droplets, color: "#0891b2" },
  "Landslide / Slope Failure": { icon: Mountain, color: "#78350f" },
  "Lahar / Debris-Flow Threat": { icon: Waves, color: "#9a3412" },
  "Fallen Tree / Storm-Related Obstruction": { icon: TreePine, color: "#16a34a" },
};
const DEFAULT_CATEGORY_SPEC: CategoryMarkerSpec = CATEGORY_MARKER_SPEC.Other;

export function getCategoryMarkerSpec(category: string): CategoryMarkerSpec {
  return CATEGORY_MARKER_SPEC[category] ?? DEFAULT_CATEGORY_SPEC;
}

// Category owns the fill/icon. Operational Priority stays numeric in the
// accessible label, popup and continuous heatmap instead of a marker band.
const iconSvgCache = new Map<string, string>();
function iconSvgMarkup(Icon: LucideIcon, size: number): string {
  const key = `${Icon.displayName ?? Icon.name}-${size}`;
  const cached = iconSvgCache.get(key);
  if (cached) return cached;
  const svg = renderToStaticMarkup(<Icon color="#ffffff" size={size} strokeWidth={2.25} />);
  iconSvgCache.set(key, svg);
  return svg;
}

const markerIconCache = new Map<string, L.DivIcon>();

export function categoryMarkerIcon(category: string, priorityIndex: number | null, options: { selected?: boolean } = {}): L.DivIcon {
  const selected = options.selected ?? false;
  const cacheKey = `${category}|${priorityIndex ?? "unset"}|${selected}`;
  const cached = markerIconCache.get(cacheKey);
  if (cached) return cached;

  const spec = getCategoryMarkerSpec(category);
  const diameter = selected ? 34 : 26;
  const ringWidth = selected ? 3 : 2;
  const iconSize = selected ? 16 : 13;
  const label = priorityIndex === null ? `${category}, operational priority not set` : `${category}, operational priority ${priorityIndex} of 100`;

  const icon = L.divIcon({
    className: "",
    html: `<div class="map-marker-pin" role="img" aria-label="${label.replace(/"/g, "&quot;")}" style="width:${diameter}px;height:${diameter}px;border-radius:50% 50% 50% 0;background:${spec.color};display:flex;align-items:center;justify-content:center;border:${ringWidth}px solid #fff;box-shadow:0 1px 3px rgba(15,23,42,0.35);transform:rotate(-45deg);"><span style="display:flex;transform:rotate(45deg);">${iconSvgMarkup(spec.icon, iconSize)}</span></div>`,
    iconSize: [diameter, diameter],
    iconAnchor: [diameter / 2, Math.round(diameter * 1.18)],
  });
  markerIconCache.set(cacheKey, icon);
  return icon;
}

export function registerMarkerPriority(_marker: L.Marker, _priorityIndex: number | null) {
  // Kept for react-leaflet's existing ref callback; marker clusters are neutral.
  void _marker;
  void _priorityIndex;
}

export function categoryClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const children = cluster.getAllChildMarkers();
  const count = children.length;

  const size = count < 10 ? 32 : count < 50 ? 42 : 54;
  const ringWidth = count < 10 ? 2 : count < 50 ? 2.5 : 3;

  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#1e293b;display:flex;align-items:center;justify-content:center;border:${ringWidth}px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,0.35);color:#fff;font-weight:600;font-size:13px;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
