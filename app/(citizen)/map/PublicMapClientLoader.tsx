"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import type { PublicTicketGeoRow } from "@/lib/citizens/publicMap";

const PublicMapClient = dynamic(() => import("./PublicMapClient"), { ssr: false });

export default function PublicMapClientLoader({
  barangays,
  tickets,
  heightClassName,
}: {
  barangays: FeatureCollection;
  tickets: PublicTicketGeoRow[];
  heightClassName?: string;
}) {
  return <PublicMapClient barangays={barangays} tickets={tickets} heightClassName={heightClassName} />;
}
