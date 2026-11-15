import L from "leaflet";

// Map pins stay neutral. Focal pins vary continuously by numeric Operational
// Priority; citizen and Ticket Detail pins carry no score.

const NEUTRAL_HEX = "#808c99";
const NEUTRAL_PIN = { diameter: 12, ringWidth: 1.5 };

function pinIcon(color: string, spec: { diameter: number; ringWidth: number; outerRing?: string }) {
  const outerRing = spec.outerRing ? `box-shadow:0 0 0 1px ${spec.outerRing};` : "";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:${spec.diameter}px;height:${spec.diameter}px;border-radius:50%;border:${spec.ringWidth}px solid white;${outerRing}"></div>`,
    iconSize: [spec.diameter, spec.diameter],
    iconAnchor: [spec.diameter / 2, spec.diameter / 2],
  });
}

// The round grey pin, carrying no score. Used wherever citizens or staff see
// a location without a system score attached.
export function neutralMarkerIcon() {
  return pinIcon(NEUTRAL_HEX, NEUTRAL_PIN);
}

// Used by the Focal map; size is a continuous numeric cue, not a band.
export function priorityMarkerIcon(priorityIndex: number | null) {
  const diameter = priorityIndex === null
    ? NEUTRAL_PIN.diameter
    : 12 + Math.round(Math.max(1, Math.min(100, priorityIndex)) * 0.08);
  return pinIcon(NEUTRAL_HEX, { diameter, ringWidth: diameter >= 18 ? 2 : 1.5 });
}
