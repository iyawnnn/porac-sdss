"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import Link from "next/link";
import type { AdminTicketGeoRow } from "@/app/api/admin/tickets/geo/route";

const BAND_COLOR: Record<string, string> = {
  Low: "#16a34a",
  Medium: "#f59e0b",
  Critical: "#dc2626",
};

function bandIcon(band: string | null) {
  const color = BAND_COLOR[band ?? ""] ?? "#6b7280";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
  });
}

const CITY_CENTER: [number, number] = [15.14, 120.57];

export default function MapClient({
  office,
  myOffice,
}: {
  office?: "CEO" | "ACDRRMO";
  myOffice?: "CEO" | "ACDRRMO";
}) {
  const [tickets, setTickets] = useState<AdminTicketGeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = office ? `?office=${office}` : "";
    fetch(`/api/admin/tickets/geo${qs}`)
      .then((res) => res.json())
      .then((data: AdminTicketGeoRow[]) => {
        setTickets(data);
        setLoading(false);
      });
  }, [office]);

  return (
    <div className="h-[calc(100vh-4rem)] w-full relative">
      <div className="absolute top-2 left-2 z-[1000] bg-white px-3 py-1 rounded shadow text-sm flex items-center gap-3">
        <span>
          Showing: <strong>{office ?? "All offices (full city)"}</strong>
        </span>
        {office !== undefined && (
          <Link href="/admin/map?office=all" className="text-blue-600 underline">
            View full city
          </Link>
        )}
        {office === undefined && myOffice && (
          <Link href="/admin/map" className="text-blue-600 underline">
            View my office ({myOffice})
          </Link>
        )}
      </div>
      {loading && (
        <p className="absolute top-12 left-2 z-[1000] bg-white px-3 py-1 rounded shadow text-sm">
          Loading tickets...
        </p>
      )}
      <MapContainer center={CITY_CENTER} zoom={12} className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MarkerClusterGroup chunkedLoading>
          {tickets.map((t) => (
            <Marker key={t.id} position={[t.lat, t.lng]} icon={bandIcon(t.urgency_band)}>
              <Popup>
                <div className="text-sm">
                  <strong>
                    #{t.id} — {t.category}
                  </strong>
                  <br />
                  {t.barangay_name}
                  <br />
                  Urgency: {t.urgency_band} ({t.urgency_score?.toFixed(3)})
                  <br />
                  Office: {t.assigned_office} · Status: {t.status}
                  <br />
                  <Link href={`/admin/tickets/${t.id}`} className="text-blue-600 underline">
                    View details
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
