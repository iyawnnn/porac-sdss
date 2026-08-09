"use client";

import dynamic from "next/dynamic";
import type { MapFilterState } from "./MapFilterBar";

// ssr:false must live in a Client Component in this Next.js version — see
// the identical pattern (and the reason) in app/(citizen)/report/page.tsx.
const MapClient = dynamic(() => import("./MapClient"), { ssr: false });

export default function MapClientLoader({
  office,
  isSystemAdmin,
  initialFilters,
  initialLayer,
}: {
  office?: "MEO" | "MDRRMO";
  isSystemAdmin: boolean;
  initialFilters: MapFilterState;
  initialLayer: "pins" | "heatmap";
}) {
  return <MapClient initialFilters={initialFilters} initialLayer={initialLayer} isSystemAdmin={isSystemAdmin} office={office} />;
}
