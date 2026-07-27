"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { FeatureCollection } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import Link from "next/link";
import type { AdminTicketGeoRow } from "@/app/api/admin/tickets/geo/route";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";

function bandIcon(band: string | null) {
  const color = getUrgencyBandStyle(band).hex;
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
  });
}

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];

export default function MapClient({ office }: { office?: "CEO" | "ACDRRMO" }) {
  const [tickets, setTickets] = useState<AdminTicketGeoRow[]>([]);
  const [barangays, setBarangays] = useState<FeatureCollection | null>(null);
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

  // Static reference data — fetched once, not tied to the office filter.
  useEffect(() => {
    fetch("/api/admin/barangays/geo")
      .then((res) => res.json())
      .then(setBarangays);
  }, []);

  return (
    <div className="h-[calc(100vh-4rem)] w-full relative">
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
        {barangays && (
          // Subtle outline only — this is reference context, not the focal
          // layer. Ticket pins (rendered after, in markerPane by default)
          // stay the thing your eye goes to.
          <GeoJSON
            data={barangays}
            style={{ color: "#64748b", weight: 1, fillColor: "#64748b", fillOpacity: 0.05 }}
            onEachFeature={(feature, layer) => {
              layer.bindTooltip(feature.properties?.name ?? "", { sticky: true });
            }}
          />
        )}
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
