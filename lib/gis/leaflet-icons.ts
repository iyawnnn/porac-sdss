import L from "leaflet";

let configured = false;

export function configureLeafletMarkerIcons() {
  if (configured) return;
  configured = true;

  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: "/assets/leaflet/marker-icon.png",
    iconRetinaUrl: "/assets/leaflet/marker-icon-2x.png",
    shadowUrl: "/assets/leaflet/marker-shadow.png",
  });
}

export function createDefaultMarkerIcon() {
  configureLeafletMarkerIcons();
  return new L.Icon.Default();
}
