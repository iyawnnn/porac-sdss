import type { Feature } from "geojson";
import type L from "leaflet";

export const MUNICIPAL_BOUNDARY_STYLE: L.PathOptions = {
  color: "#0F172A",
  weight: 3.5,
  opacity: 1,
  fillOpacity: 0,
};

export const BARANGAY_POLYGON_STYLE: L.PathOptions = {
  color: "#2563EB",
  weight: 1.5,
  opacity: 0.75,
  fillColor: "#3B82F6",
  fillOpacity: 0.05,
};

export const BARANGAY_HOVER_STYLE: L.PathOptions = {
  color: "#1D4ED8",
  weight: 3,
  opacity: 1,
  fillColor: "#3B82F6",
  fillOpacity: 0.22,
};

export function getBarangayFeatureName(feature: Feature) {
  const properties = feature.properties ?? {};
  const value = properties.name ?? properties.NAME_4 ?? properties.ADM4_EN;
  return typeof value === "string" && value.trim().length > 0 ? value : "Unknown";
}

export function styleBarangayFeature() {
  return BARANGAY_POLYGON_STYLE;
}

export function styleMunicipalBoundary() {
  return MUNICIPAL_BOUNDARY_STYLE;
}

export function bindBarangayHoverTooltip(feature: Feature, layer: L.Layer) {
  const pathLayer = layer as L.Path;
  const name = getBarangayFeatureName(feature);

  pathLayer.bindTooltip(`Barangay ${name}`, {
    sticky: true,
    direction: "top",
    className: "barangay-boundary-tooltip",
  });

  pathLayer.on({
    mouseover() {
      pathLayer.setStyle(BARANGAY_HOVER_STYLE);
      pathLayer.bringToFront();
      pathLayer.openTooltip();
    },
    mouseout() {
      pathLayer.setStyle(BARANGAY_POLYGON_STYLE);
      pathLayer.closeTooltip();
    }
  });
}
