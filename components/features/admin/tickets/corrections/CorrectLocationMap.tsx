"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import { configureLeafletMarkerIcons, createDefaultMarkerIcon } from "@/lib/gis/leaflet-icons";
import { neutralMarkerIcon } from "@/lib/gis/markerIcon";

configureLeafletMarkerIcons();

// Leaflet measures its container once; the dialog animates open, so
// re-measure whenever the container's size settles.
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function PickPoint({ onPick }: { onPick: (point: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// The location correction dialog's map (manuscript revision Phase 3, step
// 3e): the ticket's current point as a neutral pin, and the new point as a
// draggable pin set by clicking. Rendered inside the dialog, so it stacks
// with it, above the page.
export default function CorrectLocationMap({
  current,
  picked,
  onPick,
}: {
  current: { lat: number; lng: number };
  picked: { lat: number; lng: number } | null;
  onPick: (point: { lat: number; lng: number }) => void;
}) {
  return (
    <MapContainer center={[current.lat, current.lng]} className="isolate h-full w-full" zoom={17}>
      <MapResizeHandler />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        className="map-tile-muted"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PickPoint onPick={onPick} />
      <Marker icon={neutralMarkerIcon()} position={[current.lat, current.lng]} title="Current location" />
      {picked && (
        <Marker
          draggable
          eventHandlers={{
            dragend(e) {
              const point = (e.target as L.Marker).getLatLng();
              onPick({ lat: point.lat, lng: point.lng });
            },
          }}
          icon={createDefaultMarkerIcon()}
          position={[picked.lat, picked.lng]}
          title="New location"
        />
      )}
    </MapContainer>
  );
}
