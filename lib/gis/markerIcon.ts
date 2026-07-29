import L from "leaflet";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";

// Shared by the admin and citizen maps so pin sizing/colors never drift
// between the two (see lib/ui/urgency.ts header for the drift this avoids).
const PIN_SPEC: Record<string, { diameter: number; ringWidth: number; outerRing?: string }> = {
  Low: { diameter: 12, ringWidth: 1.5 },
  Medium: { diameter: 16, ringWidth: 1.5 },
  Critical: { diameter: 20, ringWidth: 2, outerRing: "#8a1d12" },
};
const DEFAULT_PIN_SPEC = { diameter: 12, ringWidth: 1.5 };

export function getPinSpec(band: string | null) {
  return PIN_SPEC[band ?? ""] ?? DEFAULT_PIN_SPEC;
}

export function bandMarkerIcon(band: string | null, options: { pulse?: boolean } = {}) {
  const color = getUrgencyBandStyle(band).hex;
  const spec = getPinSpec(band);
  const outerRing = spec.outerRing ? `box-shadow:0 0 0 1px ${spec.outerRing};` : "";
  const pulseClass = options.pulse && band === "Critical" ? "ticket-pulse" : "";
  return L.divIcon({
    className: "",
    html: `<div class="${pulseClass}" style="background:${color};width:${spec.diameter}px;height:${spec.diameter}px;border-radius:50%;border:${spec.ringWidth}px solid white;${outerRing}"></div>`,
    iconSize: [spec.diameter, spec.diameter],
    iconAnchor: [spec.diameter / 2, spec.diameter / 2],
  });
}
