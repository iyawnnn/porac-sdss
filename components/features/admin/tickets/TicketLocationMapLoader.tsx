"use client";

import dynamic from "next/dynamic";
import type { Geometry } from "geojson";

const TicketLocationMap = dynamic(() => import("./TicketLocationMap"), { ssr: false });

export default function TicketLocationMapLoader(props: {
  lat: number;
  lng: number;
  // Optional since manuscript revision Phase 1, step 5: Ticket Detail no
  // longer passes a Hazard Urgency band. Focal Intake still does until
  // step 6 removes it there.
  urgencyBand?: string | null;
  barangayGeoJson: Geometry | null;
}) {
  return <TicketLocationMap {...props} />;
}
