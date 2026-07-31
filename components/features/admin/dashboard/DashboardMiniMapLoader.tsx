"use client";

import dynamic from "next/dynamic";

const DashboardMiniMap = dynamic(() => import("./DashboardMiniMap"), {
  ssr: false,
  loading: () => (
    <div
      className="h-56 w-full animate-pulse rounded-lg bg-line-100"
      role="img"
      aria-label="Loading active incident density map"
    />
  ),
});

export default function DashboardMiniMapLoader() {
  return <DashboardMiniMap />;
}
