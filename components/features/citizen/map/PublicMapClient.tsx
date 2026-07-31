"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { bindBarangayHoverTooltip, styleBarangayFeature, styleMunicipalBoundary } from "@/lib/gis/map-styles";
import { getUrgencyBandStyle } from "@/lib/utils/ui/urgency";
import { bandMarkerIcon, getPinSpec } from "@/lib/gis/markerIcon";
import { clusterIcon } from "@/lib/gis/clusterIcon";
import type { PublicTicketGeoRow } from "@/lib/types/citizens-public-map";
import { PublicTicketPopup } from "./PublicTicketPopup";

configureLeafletMarkerIcons();

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];

// Same floating glass treatment as the admin map's controls/panels — kept as
// one-off arbitrary utilities rather than @theme tokens, see MapClient.tsx.
const GLASS_PANEL = "rounded-xl border border-slate-200/60 bg-white/90 shadow-xl backdrop-blur-md";

function MapLegend() {
  return (
    <div className={`absolute bottom-4 left-2 z-[1000] space-y-1.5 px-3 py-2 text-xs text-ink-700 ${GLASS_PANEL}`}>
      <p className="font-medium text-ink-900">Urgency</p>
      {(["Low", "Medium", "Critical"] as const).map((band) => {
        const spec = getPinSpec(band);
        const color = getUrgencyBandStyle(band).hex;
        return (
          <div key={band} className="flex items-center gap-2">
            <span
              className="inline-block flex-shrink-0 rounded-full border border-line-200"
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

export default function PublicMapClient({
  barangays,
  tickets,
  heightClassName = "h-[calc(100vh-3.5rem)]",
}: {
  barangays: FeatureCollection;
  tickets: PublicTicketGeoRow[];
  heightClassName?: string;
}) {
  const [municipalBoundary, setMunicipalBoundary] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/assets/gis/porac_osm_boundary.json")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMunicipalBoundary);
  }, []);

  return (
    <div className={`${heightClassName} w-full relative`}>
      <div className={`absolute left-3 top-3 z-[1000] px-3 py-2 text-sm text-ink-700 ${GLASS_PANEL}`}>
        <p className="font-medium text-ink-900">Public Hazard Map</p>
        <p>{tickets.length} active public reports</p>
      </div>
      <MapLegend />
      <MapContainer center={CITY_CENTER} zoom={MUNICIPALITY.defaultZoom} className="h-full w-full">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {municipalBoundary && <GeoJSON data={municipalBoundary} style={styleMunicipalBoundary} />}
        <GeoJSON data={barangays} style={styleBarangayFeature} onEachFeature={bindBarangayHoverTooltip} />
        <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
          {tickets.map((ticket) => (
            <Marker key={ticket.id} position={[ticket.lat, ticket.lng]} icon={bandMarkerIcon(ticket.urgency_band)}>
              <Popup>
                <PublicTicketPopup ticket={ticket} />
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
