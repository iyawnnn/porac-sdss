"use client";

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { publicCategoryMarkerIcon } from "@/lib/gis/categoryMarker";

// A static preview: the same category pin and muted basemap as the public map, no interaction.
export default function LocationPreviewMap({ lat, lng, category }: { lat: number; lng: number; category: string }) {
  return (
    <div className="citizen-map isolate">
      <MapContainer
        center={[lat, lng]}
        zoom={17}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        zoomControl={false}
        className="h-56 w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          className="map-tile-muted"
        />
        <Marker position={[lat, lng]} icon={publicCategoryMarkerIcon(category)} interactive={false} keyboard={false} />
      </MapContainer>
    </div>
  );
}
