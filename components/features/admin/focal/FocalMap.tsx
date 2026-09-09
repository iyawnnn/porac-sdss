"use client";

import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { bandMarkerIcon } from "@/lib/gis/markerIcon";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { MUNICIPALITY } from "@/lib/municipality-config";
import type { FocalIntakeGeoRow } from "@/lib/types/admin-focal-intake";

configureLeafletMarkerIcons();

// Focal's read-only, municipality-wide intake map (Batch 4) — a
// deliberately small, separate component from the operational
// components/features/admin/map/MapClient.tsx: no heatmap layer, no
// clustering, no pins-vs-heatmap toggle, no operational filters, and no
// mutation controls anywhere in the popup. Sourced from GET
// /admin/intake/geo (FocalGuard-protected), never the operational
// GET /admin/tickets/geo endpoint. See FocalIntakeService.listIntakeGeo's
// own docblock for exactly which fields this is allowed to carry.
export function FocalMap({ reports }: { reports: FocalIntakeGeoRow[] }) {
  return (
    <MapContainer
      center={[MUNICIPALITY.centerLat, MUNICIPALITY.centerLng]}
      zoom={MUNICIPALITY.defaultZoom}
      className="h-full w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        className="map-tile-muted"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {reports.map((report) => {
        const badge = getUrgencyBadgeConfig(report.hazardUrgency.index);
        return (
          <Marker
            icon={bandMarkerIcon(badge.label === "—" ? null : badge.label)}
            key={report.reportId}
            position={[report.lat, report.lng]}
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <p className="font-medium">{report.reportReference} &middot; {report.category}</p>
                <p className="text-muted-foreground">{report.barangayName} &middot; routed to {report.routedOffice}</p>
                <p>
                  Hazard Urgency: <span className="font-medium">{badge.label}</span>
                  {report.hazardUrgency.index !== null && ` (${report.hazardUrgency.index})`}
                </p>
                <p>Intake State: <span className="font-medium">{report.intakeState}</span></p>
                <Link className="mt-1 inline-block font-medium text-primary hover:underline" href={`/admin/focal/intake/${report.reportId}`}>
                  Review report &rarr;
                </Link>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
