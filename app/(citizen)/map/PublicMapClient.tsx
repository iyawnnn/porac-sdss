"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { FeatureCollection } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { bindBarangayHoverTooltip, styleBarangayFeature, styleMunicipalBoundary } from "@/lib/gis/map-styles";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";
import type { PublicTicketGeoRow } from "@/lib/citizens/publicMap";

configureLeafletMarkerIcons();

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];

function hazardIcon(band: string | null) {
  const color = getUrgencyBandStyle(band).hex;
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function PublicMapClient({
  barangays,
  tickets,
}: {
  barangays: FeatureCollection;
  tickets: PublicTicketGeoRow[];
}) {
  const [municipalBoundary, setMunicipalBoundary] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/assets/gis/porac_osm_boundary.json")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMunicipalBoundary);
  }, []);

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full relative">
      <div className="absolute left-3 top-3 z-[1000] rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-700 shadow">
        <p className="font-medium text-ink-900">Public Hazard Map</p>
        <p>{tickets.length} active public reports</p>
      </div>
      <MapContainer center={CITY_CENTER} zoom={MUNICIPALITY.defaultZoom} className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {municipalBoundary && <GeoJSON data={municipalBoundary} style={styleMunicipalBoundary} />}
        <GeoJSON data={barangays} style={styleBarangayFeature} onEachFeature={bindBarangayHoverTooltip} />
        <MarkerClusterGroup chunkedLoading>
          {tickets.map((ticket) => (
            <Marker key={ticket.id} position={[ticket.lat, ticket.lng]} icon={hazardIcon(ticket.urgency_band)}>
              <Popup>
                <div className="text-sm">
                  <strong>#{ticket.id} - {ticket.category}</strong>
                  <br />
                  {ticket.barangay_name}
                  <br />
                  Status: {ticket.status}
                  <br />
                  Urgency: {ticket.urgency_band ?? "Pending"}
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
