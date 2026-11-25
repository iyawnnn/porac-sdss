"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const LocationPreviewMap = dynamic(() => import("./LocationPreviewMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full rounded-none motion-reduce:animate-none" />,
});

export default function LocationPreviewMapLoader(props: { lat: number; lng: number; category: string }) {
  return <LocationPreviewMap {...props} />;
}
