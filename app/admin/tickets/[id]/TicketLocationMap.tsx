"use client";

import { MapContainer, TileLayer, GeoJSON, Marker } from "react-leaflet";
import type { Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { styleBarangayFeature } from "@/lib/gis/map-styles";
import { bandMarkerIcon } from "@/lib/gis/markerIcon";

configureLeafletMarkerIcons();

export default function TicketLocationMap({
  lat,
  lng,
  urgencyBand,
  barangayGeoJson,
}: {
  lat: number;
  lng: number;
  urgencyBand: string | null;
  barangayGeoJson: Geometry | null;
}) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} className="h-52 w-full">
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {barangayGeoJson && <GeoJSON data={barangayGeoJson} style={styleBarangayFeature} />}
      <Marker position={[lat, lng]} icon={bandMarkerIcon(urgencyBand, { pulse: true })} />
    </MapContainer>
  );
}
