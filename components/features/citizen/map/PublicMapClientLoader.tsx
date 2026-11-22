"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import type { PublicTicketGeoRow } from "@/lib/types/citizens-public-map";

const PublicMapClient = dynamic(() => import("./PublicMapClient"), { ssr: false });

export default function PublicMapClientLoader({
  barangays,
  tickets,
  heightClassName,
  preview,
}: {
  barangays: FeatureCollection;
  tickets: PublicTicketGeoRow[];
  heightClassName?: string;
  preview?: boolean;
}) {
  return <PublicMapClient barangays={barangays} tickets={tickets} heightClassName={heightClassName} preview={preview} />;
}
