"use client";

import dynamic from "next/dynamic";

const LocationPreviewMap = dynamic(() => import("./LocationPreviewMap"), { ssr: false });

export default function LocationPreviewMapLoader({ lat, lng }: { lat: number; lng: number }) {
  return <LocationPreviewMap lat={lat} lng={lng} />;
}