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

// Pin encodes urgency on two channels — diameter and ring weight, not hue
// alone (DESIGN.md §6.2) — so the map stays readable in greyscale or for
// colorblind viewers. Critical additionally gets a second, darker outer
// ring via box-shadow (a plain CSS border can only draw one ring).
const PIN_SPEC: Record<string, { diameter: number; ringWidth: number; outerRing?: string }> = {
  Low: { diameter: 12, ringWidth: 1.5 },
  Medium: { diameter: 16, ringWidth: 1.5 },
  Critical: { diameter: 20, ringWidth: 2, outerRing: "#8a1d12" },
};
const DEFAULT_PIN_SPEC = { diameter: 12, ringWidth: 1.5 };

function bandIcon(band: string | null) {
  const color = getUrgencyBandStyle(band).hex;
  const spec = PIN_SPEC[band ?? ""] ?? DEFAULT_PIN_SPEC;
  const outerRing = spec.outerRing ? `box-shadow:0 0 0 1px ${spec.outerRing};` : "";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:${spec.diameter}px;height:${spec.diameter}px;border-radius:50%;border:${spec.ringWidth}px solid white;${outerRing}"></div>`,
    iconSize: [spec.diameter, spec.diameter],
    iconAnchor: [spec.diameter / 2, spec.diameter / 2],
  });
}

function MapLegend() {
  const bands: { band: "Low" | "Medium" | "Critical" }[] = [
    { band: "Low" },
    { band: "Medium" },
    { band: "Critical" },
  ];
  return (
    <div className="absolute bottom-4 left-2 z-[1000] rounded-md border border-line-200 bg-surface px-3 py-2 text-xs text-ink-700 shadow space-y-1.5">
      <p className="font-medium text-ink-900">Urgency</p>
      {bands.map(({ band }) => {
        const spec = PIN_SPEC[band];
        const color = getUrgencyBandStyle(band).hex;
        return (
          <div key={band} className="flex items-center gap-2">
            <span
              className="inline-block rounded-full border border-line-200 flex-shrink-0"
              style={{
                width: spec.diameter,
                height: spec.diameter,
                backgroundColor: color,
                boxShadow: spec.outerRing ? `0 0 0 1px ${spec.outerRing}` : undefined,
              }}
            />
            <span>{band}</span>
          </div>
        );
      })}
    </div>
  );
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
        <p className="absolute top-2 left-2 z-[1000] rounded-md border border-line-200 bg-surface px-3 py-1 text-sm text-ink-700 shadow">
          Loading tickets...
        </p>
      )}
      <MapLegend />
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
            style={{ color: "#808c99", weight: 0.75, fillColor: "#808c99", fillOpacity: 0.03 }}
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
                  <Link href={`/admin/tickets/${t.id}`} className="text-brand-600 hover:text-brand-700 underline">
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
