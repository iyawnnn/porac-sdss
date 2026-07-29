"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import type { AdminTicketGeoRow } from "@/app/api/admin/tickets/geo/route";

configureLeafletMarkerIcons();

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];

// Same gradient/intensity approach as app/admin/map/MapClient.tsx's
// HeatmapLayer, kept local since this is the only other call site.
function HeatLayer({ tickets }: { tickets: AdminTicketGeoRow[] }) {
  const map = useMap();

  useEffect(() => {
    const points: L.HeatLatLngTuple[] = tickets.map((ticket) => [
      ticket.lat,
      ticket.lng,
      Math.max((ticket.priority_index ?? 1) / 100, 0.15),
    ]);
    const layer = L.heatLayer(points, {
      radius: 24,
      blur: 18,
      maxZoom: MUNICIPALITY.defaultZoom + 2,
      gradient: { 0.2: "#2b6cb0", 0.5: "#d99a00", 0.75: "#e2680e", 1: "#c42b1c" },
    }).addTo(map);

    return () => {
      layer.remove();
    };
  }, [map, tickets]);

  return null;
}

export default function DashboardMiniMap() {
  const [tickets, setTickets] = useState<AdminTicketGeoRow[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/tickets/geo")
      .then((res) => (res.ok ? res.json() : []))
      .then(setTickets)
      .catch(() => setTickets([]));
  }, []);

  if (!tickets) {
    return (
      <div
        className="h-56 w-full animate-pulse rounded-lg bg-line-100"
        role="img"
        aria-label="Loading active incident density map"
      />
    );
  }

  return (
    <MapContainer
      center={CITY_CENTER}
      zoom={MUNICIPALITY.defaultZoom - 1}
      className="h-56 w-full"
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <HeatLayer tickets={tickets} />
    </MapContainer>
  );
}
