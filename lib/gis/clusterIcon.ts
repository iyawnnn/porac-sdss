import L from "leaflet";

// Neutral grey, the same as neutralMarkerIcon()'s pin. Clusters were
// coloured by the average Hazard Urgency band of their markers (with a glow
// for High) until manuscript revision Phase 1, step 6c; citizens are shown
// no system score, so every cluster now looks the same and only the size
// steps by count. Used only by the citizen public map.
const NEUTRAL_HEX = "#808c99";

export function clusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 50 ? 44 : 56;

  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${NEUTRAL_HEX}4d;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1.5px solid ${NEUTRAL_HEX};box-shadow:0 1px 4px rgba(15,23,42,0.35);color:#fff;font-weight:600;font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,0.45);">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
