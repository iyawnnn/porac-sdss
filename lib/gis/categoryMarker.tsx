import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import type { LucideIcon } from "lucide-react";
import { getCategoryMarkerSpec, glyphColor } from "./category-spec";

export { CATEGORY_MARKER_SPEC, getCategoryMarkerSpec, glyphColor, type CategoryMarkerSpec } from "./category-spec";

// Category markers. The admin map uses categoryMarkerIcon/categoryClusterIcon; the citizen
// public map uses publicCategoryMarkerIcon/publicClusterIcon (bottom of this file), which share
// the icons and colours but carry no Operational Priority. lib/gis/markerIcon.ts keeps the
// neutral pins for the Ticket Detail and Focal maps.
// Category owns the fill/icon. Operational Priority stays numeric in the
// accessible label, popup and continuous heatmap instead of a marker band.
const iconSvgCache = new Map<string, string>();
function iconSvgMarkup(Icon: LucideIcon, size: number, color = "#ffffff"): string {
  const key = `${Icon.displayName ?? Icon.name}-${size}-${color}`;
  const cached = iconSvgCache.get(key);
  if (cached) return cached;
  const svg = renderToStaticMarkup(<Icon color={color} size={size} strokeWidth={2.25} />);
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

/* ── Citizen public map (UI Phase 2B.2) ──────────────────────────────────────
   Same category icons and colours as the admin map, but no Operational
   Priority anywhere: the accessible label names the category only. Colour is
   category identity, never severity or risk, and always paired with the icon. */

const publicIconCache = new Map<string, L.DivIcon>();
// A rounded-square badge with a short pointer and a soft ground shadow: the category glyph reads
// clearly at small sizes and every state shares one outline. The anchor is the pointer's tip.
const PIN_PATH = "M11 2h12a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8h-3.2L17 34.5 14.2 30H11a8 8 0 0 1-8-8V10a8 8 0 0 1 8-8Z";

export function publicCategoryMarkerIcon(category: string, active = false): L.DivIcon {
  const key = `${category}|${active}`;
  const cached = publicIconCache.get(key);
  if (cached) return cached;
  const { color, icon: Glyph } = getCategoryMarkerSpec(category);
  const label = `${category} report`.replace(/"/g, "&quot;");
  const icon = L.divIcon({
    className: active ? "public-pin is-active" : "public-pin",
    html: `<div class="public-pin-body" role="img" aria-label="${label}"><svg class="public-pin-shape" width="34" height="40" viewBox="0 0 34 40" aria-hidden="true"><ellipse class="public-pin-ground" cx="17" cy="37" rx="5" ry="1.6"/><path d="${PIN_PATH}" fill="${color}"/><rect x="6.5" y="5.5" width="21" height="21" rx="6" fill="#fff" fill-opacity="0.16"/></svg><span class="public-pin-glyph">${iconSvgMarkup(Glyph, 15, glyphColor(color))}</span></div>`,
    iconSize: [34, 40],
    iconAnchor: [17, 37],
    // The popup tip stops just above the badge rather than overlapping it.
    popupAnchor: [0, -38],
  });
  publicIconCache.set(key, icon);
  return icon;
}

// Clusters stay neutral, so a mixed group never borrows one category's colour. Sizes step gently with count.
export function publicClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 30 : count < 100 ? 34 : 38;
  return L.divIcon({
    className: "public-cluster",
    html: `<div class="public-cluster-badge" role="img" aria-label="${count} reports nearby. Zoom in to see them." style="width:${size}px;height:${size}px">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
