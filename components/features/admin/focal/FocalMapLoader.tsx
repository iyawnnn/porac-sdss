"use client";

import dynamic from "next/dynamic";
import type { FocalIntakeGeoRow } from "@/lib/types/admin-focal-intake";

const FocalMap = dynamic(() => import("./FocalMap").then((m) => m.FocalMap), { ssr: false });

export default function FocalMapLoader({ reports }: { reports: FocalIntakeGeoRow[] }) {
  return <FocalMap reports={reports} />;
}
