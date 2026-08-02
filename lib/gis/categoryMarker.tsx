import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import {
  Construction,
  Droplet,
  Droplets,
  LightbulbOff,
  Sprout,
  Trash,
  Trash2,
  TreePine,
  Waves,
  Wrench,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { getUrgencyBandStyle } from "@/lib/utils/ui/urgency";

// Admin-map-only category markers â€” deliberately separate from
// lib/gis/markerIcon.ts (bandMarkerIcon/getPinSpec), which the citizen map
// still uses and must not change. Category -> icon/color is built directly
// from lib/types/admin-ticket-constants.ts's TICKET_CATEGORIES strings
// (single source of truth), not a duplicated list.
export interface CategoryMarkerSpec {
  icon: LucideIcon;
  color: string;
}

export const CATEGORY_MARKER_SPEC: Record<string, CategoryMarkerSpec> = {
  Flooding: { icon: Waves, color: "#2563eb" },
  "Clogged Drain": { icon: Droplets, color: "#0891b2" },
  "Fallen Tree": { icon: TreePine, color: "#16a34a" },
  Pothole: { icon: CircleDot, color: "#ea580c" },
  "Uneven Sidewalk": { icon: Construction, color: "#b45309" },
  "Streetlight Out": { icon: LightbulbOff, color: "#eab308" },
  "Leaking Pipe": { icon: Droplet, color: "#0d9488" },
  "Uncollected Garbage": { icon: Trash, color: "#78716c" },
  "Illegal Dumping": { icon: Trash2, color: "#7c3aed" },
  "Overgrown Vegetation": { icon: Sprout, color: "#65a30d" },
  Other: { icon: Wrench, color: "#64748b" },
};
const DEFAULT_CATEGORY_SPEC: CategoryMarkerSpec = CATEGORY_MARKER_SPEC.Other;

export function getCategoryMarkerSpec(category: string): CategoryMarkerSpec {
  return CATEGORY_MARKER_SPEC[category] ?? DEFAULT_CATEGORY_SPEC;
}

// Reuses the same urgency_band -> hex the rest of the app already uses
// (getUrgencyBandStyle) for the marker's outer ring, so urgency color never
// drifts from the Ticket Queue/legend/popup. Category owns the fill/icon,
// urgency owns the ring â€” the two dimensions never overwrite each other.
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

export function categoryMarkerIcon(category: string, band: string | null, options: { selected?: boolean } = {}): L.DivIcon {
  const selected = options.selected ?? false;
  const cacheKey = `${category}|${band ?? ""}|${selected}`;
  const cached = markerIconCache.get(cacheKey);
  if (cached) return cached;

  const spec = getCategoryMarkerSpec(category);
  const ringColor = getUrgencyBandStyle(band).hex;
  const diameter = selected ? 34 : 26;
  const ringWidth = selected ? 3 : 2;
  const iconSize = selected ? 16 : 13;
  const pulseClass = band === "Critical" ? "ticket-pulse" : "";
  const label = `${category}, ${band ?? "Low"} urgency`;

  const icon = L.divIcon({
    className: "",
    html: `<div class="map-marker-pin ${pulseClass}" role="img" aria-label="${label.replace(/"/g, "&quot;")}" style="width:${diameter}px;height:${diameter}px;border-radius:50% 50% 50% 0;background:${spec.color};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(15,23,42,0.35);transform:rotate(-45deg);"><span style="display:flex;transform:rotate(45deg);">${iconSvgMarkup(spec.icon, iconSize)}</span></div>`,
    iconSize: [diameter, diameter],
    iconAnchor: [diameter / 2, Math.round(diameter * 1.18)],
  });
  markerIconCache.set(cacheKey, icon);
  return icon;
}

// Cluster icons can't bake urgency into a color to reverse-match (each
// marker's fill is now its category color, not urgency), so each marker's
// band is registered here at mount time (Marker ref callback) and read back
// by categoryClusterIcon â€” a WeakMap avoids threading a parallel prop
// through react-leaflet-cluster's iconCreateFunction.
const markerUrgency = new WeakMap<L.Marker, string | null>();

export function registerMarkerUrgency(marker: L.Marker, band: string | null) {
  markerUrgency.set(marker, band);
}

export function categoryClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const children = cluster.getAllChildMarkers();
  const count = children.length;
  const bands = children.map((marker) => markerUrgency.get(marker) ?? null);
  const dominantBand = bands.includes("Critical") ? "Critical" : bands.includes("Medium") ? "Medium" : "Low";
  const ringColor = getUrgencyBandStyle(dominantBand).hex;

  const size = count < 10 ? 32 : count < 50 ? 42 : 54;
  const ringWidth = count < 10 ? 2 : count < 50 ? 2.5 : 3;

  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#1e293b;display:flex;align-items:center;justify-content:center;border:${ringWidth}px solid ${ringColor};box-shadow:0 1px 4px rgba(15,23,42,0.35);color:#fff;font-weight:600;font-size:13px;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
