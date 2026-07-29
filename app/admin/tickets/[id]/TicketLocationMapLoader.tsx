"use client";

import dynamic from "next/dynamic";
import type { Geometry } from "geojson";

const TicketLocationMap = dynamic(() => import("./TicketLocationMap"), { ssr: false });

export default function TicketLocationMapLoader(props: {
  lat: number;
  lng: number;
  urgencyBand: string | null;
  barangayGeoJson: Geometry | null;
}) {
  return <TicketLocationMap {...props} />;
}
