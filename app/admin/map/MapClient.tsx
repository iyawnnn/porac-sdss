"use client";

import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { FeatureCollection } from "geojson";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { AdminTicketGeoRow } from "@/app/api/admin/tickets/geo/route";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { bindBarangayHoverTooltip, styleBarangayFeature, styleMunicipalBoundary } from "@/lib/gis/map-styles";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";
import { bandMarkerIcon, getPinSpec } from "@/lib/gis/markerIcon";
import { clusterIcon } from "@/lib/gis/clusterIcon";
import { MapControls } from "./MapControls";
import { TicketPopup } from "./TicketPopup";

configureLeafletMarkerIcons();

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];

type MapMode = "pins" | "heatmap";

function HeatmapLayer({ tickets }: { tickets: AdminTicketGeoRow[] }) {
  const map = useMap();

  useEffect(() => {
    const points: L.HeatLatLngTuple[] = tickets.map((ticket) => [
      ticket.lat,
      ticket.lng,
      Math.max((ticket.priority_index ?? 1) / 100, 0.15),
    ]);
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 20,
      maxZoom: MUNICIPALITY.defaultZoom + 2,
      gradient: { 0.2: "#2b6cb0", 0.5: "#d99a00", 0.75: "#e2680e", 1: "#c42b1c" },
    }).addTo(map);

    return () => {
      layer.remove();
    };
  }, [map, tickets]);

  return null;
}

function MapLegend({ mode }: { mode: MapMode }) {
  if (mode === "heatmap") {
    return <div className="absolute bottom-4 left-2 z-[1000] rounded-md border border-line-200 bg-surface px-3 py-2 text-xs text-ink-700 shadow"><p className="font-medium text-ink-900">Priority density</p><p className="mt-1 text-ink-500">Blue = lower · red = higher</p></div>;
  }

  return <div className="absolute bottom-4 left-2 z-[1000] rounded-md border border-line-200 bg-surface px-3 py-2 text-xs text-ink-700 shadow space-y-1.5"><p className="font-medium text-ink-900">Urgency</p>{(["Low", "Medium", "Critical"] as const).map((band) => {
    const spec = getPinSpec(band);
    const color = getUrgencyBandStyle(band).hex;
    return <div key={band} className="flex items-center gap-2"><span className="inline-block rounded-full border border-line-200 flex-shrink-0" style={{ width: spec.diameter, height: spec.diameter, backgroundColor: color, boxShadow: spec.outerRing ? `0 0 0 1px ${spec.outerRing}` : undefined }} /><span>{band}</span></div>;
  })}</div>;
}

export default function MapClient({ office }: { office?: "MEO" | "MDRRMO" }) {
  const [tickets, setTickets] = useState<AdminTicketGeoRow[]>([]);
  const [barangays, setBarangays] = useState<FeatureCollection | null>(null);
  const [municipalBoundary, setMunicipalBoundary] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<MapMode>("pins");
  const [showBoundaries, setShowBoundaries] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = office ? `?office=${office}` : "";
    fetch(`/api/admin/tickets/geo${qs}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Unable to load tickets")))
      .then((data: AdminTicketGeoRow[]) => setTickets(data))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [office]);

  useEffect(() => {
    fetch("/api/admin/barangays/geo").then((res) => res.json()).then(setBarangays);
    fetch("/assets/gis/porac_osm_boundary.json").then((res) => res.ok ? res.json() : null).then(setMunicipalBoundary);
  }, []);

  return <div className="h-[calc(100vh-4rem)] w-full relative">
    {loading && <p className="absolute top-2 left-2 z-[1000] rounded-md border border-line-200 bg-surface px-3 py-1 text-sm text-ink-700 shadow">Loading tickets...</p>}
    <MapControls
      mode={mode}
      onModeChange={setMode}
      showBoundaries={showBoundaries}
      onToggleBoundaries={() => setShowBoundaries((prev) => !prev)}
    />
    <MapLegend mode={mode} />
    <MapContainer center={CITY_CENTER} zoom={MUNICIPALITY.defaultZoom} className="h-full w-full">
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {showBoundaries && municipalBoundary && <GeoJSON data={municipalBoundary} style={styleMunicipalBoundary} />}
      {showBoundaries && barangays && <GeoJSON data={barangays} style={styleBarangayFeature} onEachFeature={bindBarangayHoverTooltip} />}
      {mode === "heatmap" ? <HeatmapLayer tickets={tickets} /> : <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>{tickets.map((ticket) => <Marker key={ticket.id} position={[ticket.lat, ticket.lng]} icon={bandMarkerIcon(ticket.urgency_band, { pulse: true })}><Popup><TicketPopup ticket={ticket} /></Popup></Marker>)}</MarkerClusterGroup>}
    </MapContainer>
  </div>;
}