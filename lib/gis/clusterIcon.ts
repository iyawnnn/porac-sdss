import L from "leaflet";
import { getUrgencyBandStyle } from "@/lib/utils/ui/urgency";

// Reverse-lookup a child marker's urgency weight from its divIcon HTML
// (bandMarkerIcon() already bakes the band's hex into the marker) instead of
// threading a parallel "urgency" marker option through react-leaflet.
// Shared by the admin and citizen maps so cluster styling matches.
const WEIGHT_BY_HEX: Record<string, number> = {
  [getUrgencyBandStyle("Low").hex]: 0,
  [getUrgencyBandStyle("Medium").hex]: 0.5,
  [getUrgencyBandStyle("Critical").hex]: 1,
};

function markerWeight(marker: L.Marker): number {
  const icon = marker.options.icon as L.DivIcon | undefined;
  const html = icon?.options.html;
  if (typeof html !== "string") return 0;
  for (const [hex, weight] of Object.entries(WEIGHT_BY_HEX)) {
    if (html.includes(hex)) return weight;
  }
  return 0;
}

export function clusterIcon(cluster: L.MarkerCluster) {
  const children = cluster.getAllChildMarkers();
  const count = children.length;
  const avgWeight = children.reduce((sum, marker) => sum + markerWeight(marker), 0) / count;

  const size = count < 10 ? 34 : count < 50 ? 44 : 56;
  const band = avgWeight >= 0.75 ? "Critical" : avgWeight >= 0.35 ? "Medium" : "Low";
  const hex = getUrgencyBandStyle(band).hex;
  const glow = band === "Critical" ? `0 0 14px 3px ${hex}80, ` : "";

  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${hex}4d;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1.5px solid ${hex};box-shadow:${glow}0 1px 4px rgba(15,23,42,0.35);color:#fff;font-weight:600;font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,0.45);">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
