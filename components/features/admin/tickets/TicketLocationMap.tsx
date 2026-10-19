"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from "react-leaflet";
import type { Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { styleBarangayFeature } from "@/lib/gis/map-styles";
import { bandMarkerIcon } from "@/lib/gis/markerIcon";

configureLeafletMarkerIcons();

// Leaflet measures its container once on mount and never re-checks — if
// that measurement races a still-settling flex/grid layout (or the
// container is later resized, e.g. a viewport change), the map keeps a
// stale internal size and its canvas can overflow its own wrapper. A
// ResizeObserver + invalidateSize() is the standard react-leaflet fix.
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function TicketLocationMap({
  lat,
  lng,
  barangayGeoJson,
}: {
  lat: number;
  lng: number;
  barangayGeoJson: Geometry | null;
}) {
  // `isolate` makes the map its own stacking context. Leaflet gives its
  // panes z-index 400+ and its controls 1000, and without this those
  // values compete with the page's dialogs (z-50, portalled to <body>) —
  // the barangay outline was drawing over the "Mark resolved" dialog and
  // catching its clicks.
  return (
    <MapContainer center={[lat, lng]} zoom={15} className="isolate h-full w-full">
      <MapResizeHandler />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        className="map-tile-muted"
      />
      {barangayGeoJson && <GeoJSON data={barangayGeoJson} style={styleBarangayFeature} />}
      {/* Neutral pin: no caller passes a Hazard Urgency band since manuscript
          revision Phase 1, step 6b, and the pulse only ever fired for High. */}
      <Marker position={[lat, lng]} icon={bandMarkerIcon(null)} />
    </MapContainer>
  );
}
