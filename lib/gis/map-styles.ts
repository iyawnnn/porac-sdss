import type { Feature } from "geojson";
import L from "leaflet";

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

export const BARANGAY_SELECTED_STYLE: L.PathOptions = {
  color: "#1D4ED8",
  weight: 3,
  opacity: 1,
  fillColor: "#3B82F6",
  fillOpacity: 0.16,
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

export function bindBarangayInteractions(
  feature: Feature,
  layer: L.Layer,
  {
    isSelected,
    onSelect,
  }: {
    isSelected: boolean;
    onSelect: (name: string, bounds: L.LatLngBounds) => void;
  },
) {
  const pathLayer = layer as L.Polygon;
  const name = getBarangayFeatureName(feature);
  const baseStyle = isSelected ? BARANGAY_SELECTED_STYLE : BARANGAY_POLYGON_STYLE;
  pathLayer.options.bubblingMouseEvents = false;

  pathLayer.bindTooltip(`Brgy. ${name}`, {
    sticky: true,
    direction: "top",
    className: "barangay-boundary-tooltip",
  });

  const selectBarangay = (event?: L.LeafletMouseEvent) => {
    if (event) L.DomEvent.stopPropagation(event.originalEvent);
    onSelect(name, pathLayer.getBounds());
  };

  const makeKeyboardAccessible = () => {
    const element = pathLayer.getElement();
    if (!element) return;
    element.setAttribute("tabindex", "0");
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Zoom to Brgy. ${name}`);
    element.setAttribute("aria-pressed", String(isSelected));
    L.DomEvent.on(element as HTMLElement, "keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
      keyboardEvent.preventDefault();
      selectBarangay();
    });
  };

  pathLayer.on({
    add: makeKeyboardAccessible,
    mouseover() {
      pathLayer.setStyle(BARANGAY_HOVER_STYLE);
      pathLayer.bringToFront();
      pathLayer.openTooltip();
    },
    mouseout() {
      pathLayer.setStyle(baseStyle);
      pathLayer.closeTooltip();
    },
    click: selectBarangay,
  });
}

// Kept for the public reporting and citizen map surfaces, which only need the
// non-selecting hover treatment.
export function bindBarangayHoverTooltip(feature: Feature, layer: L.Layer) {
  const pathLayer = layer as L.Path;
  const name = getBarangayFeatureName(feature);
  pathLayer.bindTooltip(`Brgy. ${name}`, { sticky: true, direction: "top", className: "barangay-boundary-tooltip" });
  pathLayer.on({
    mouseover() { pathLayer.setStyle(BARANGAY_HOVER_STYLE); pathLayer.bringToFront(); pathLayer.openTooltip(); },
    mouseout() { pathLayer.setStyle(BARANGAY_POLYGON_STYLE); pathLayer.closeTooltip(); },
  });
}