"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import type { PublicTicketGeoRow } from "@/lib/types/citizens-public-map";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Leaflet needs window, so the map is client-only. Until its chunk arrives the frame shows a skeleton
// of the same size instead of an empty box.
const PublicMapClient = dynamic(() => import("./PublicMapClient"), {
  ssr: false,
  loading: () => <Skeleton aria-label="Loading map" className="size-full rounded-none motion-reduce:animate-none" />,
});

const FULL_PAGE_HEIGHT = "h-[calc(100dvh-4rem-1px)]";

export default function PublicMapClientLoader({
  barangays,
  tickets,
  heightClassName = FULL_PAGE_HEIGHT,
  preview,
}: {
  barangays: FeatureCollection;
  tickets: PublicTicketGeoRow[];
  heightClassName?: string;
  preview?: boolean;
}) {
  return (
    <div className={cn(heightClassName, "w-full")}>
      <PublicMapClient barangays={barangays} tickets={tickets} heightClassName="h-full" preview={preview} />
    </div>
  );
}
