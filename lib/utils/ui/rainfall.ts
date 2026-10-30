import type { RainfallContextRow } from "@/lib/types/admin-tickets";

// The words Ticket Detail's rainfall panel shows (manuscript revision Phase
// 4, step 4c). A reading of 0 is real and shows as "0 mm"; a failed fetch
// never does. rainfall_mm is compared with null, never by truthiness.

export function formatRainfall(mm: number): string {
  return `${mm.toLocaleString("en-US", { maximumFractionDigits: 2 })} mm`;
}

export function rainfallStateText(row: Pick<RainfallContextRow, "status" | "rainfall_mm">): string {
  if (row.status === "UNAVAILABLE" || row.rainfall_mm === null) return "Unavailable";
  if (row.status === "STALE") return `Last known: ${formatRainfall(row.rainfall_mm)}`;
  return formatRainfall(row.rainfall_mm);
}
