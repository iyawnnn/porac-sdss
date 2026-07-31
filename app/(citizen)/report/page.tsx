"use client";

import dynamic from "next/dynamic";

// Leaflet needs window/document, so the map form is client-only.
const ReportForm = dynamic(() => import("@/components/features/citizen/report/ReportForm"), { ssr: false });

export default function ReportPage() {
  return <ReportForm />;
}
