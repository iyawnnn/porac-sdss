"use client";

import dynamic from "next/dynamic";

// ssr:false must live in a Client Component in this Next.js version — see
// the identical pattern (and the reason) in app/(citizen)/report/page.tsx.
const MapClient = dynamic(() => import("./MapClient"), { ssr: false });

export default function MapClientLoader({
  office,
  myOffice,
}: {
  office?: "CEO" | "ACDRRMO";
  myOffice?: "CEO" | "ACDRRMO";
}) {
  return <MapClient office={office} myOffice={myOffice} />;
}
