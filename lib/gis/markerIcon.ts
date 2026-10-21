import L from "leaflet";
import { priorityBandHex, priorityBandLabel } from "@/lib/utils/ui/priority";

// Map pins. Hazard Urgency pins (bandMarkerIcon/getPinSpec, coloured by the
// urgency band) were removed with the urgency helpers in manuscript revision
// Phase 1, step 7b; what remains is the neutral pin (citizen public map,
// Ticket Detail location map) and the Operational Priority pin (Focal map).

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

// Sizes keyed by Operational Priority's display band (priorityBandLabel), so
// High pins stay larger. Same sizes the pins have always used.
const PRIORITY_PIN_SPEC: Record<string, { diameter: number; ringWidth: number; outerRing?: string }> = {
  Low: { diameter: 12, ringWidth: 1.5 },
  Medium: { diameter: 16, ringWidth: 1.5 },
  High: { diameter: 20, ringWidth: 2, outerRing: "#8a1d12" },
};

// Filled with Operational Priority's display-band colour and never pulsing —
// a pulse signals a hazard, which Operational Priority does not measure.
// Used by the Focal map since manuscript revision Phase 1, step 6b.
export function priorityMarkerIcon(priorityIndex: number | null) {
  const spec = PRIORITY_PIN_SPEC[priorityBandLabel(priorityIndex)] ?? NEUTRAL_PIN;
  return pinIcon(priorityBandHex(priorityIndex), spec);
}
