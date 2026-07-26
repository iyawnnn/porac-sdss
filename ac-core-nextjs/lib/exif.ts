import exifr from "exifr";

export interface ExifResult {
  lat: number | null;
  lng: number | null;
  capturedAt: Date | null;
}

// Server-side re-extraction from the uploaded buffer — client-supplied EXIF
// is spoofable and is never trusted (PLAN.md §8).
export async function extractExif(buffer: Buffer): Promise<ExifResult> {
  try {
    const data = await exifr.parse(buffer, { gps: true });
    return {
      lat: typeof data?.latitude === "number" ? data.latitude : null,
      lng: typeof data?.longitude === "number" ? data.longitude : null,
      capturedAt: data?.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : null,
    };
  } catch {
    return { lat: null, lng: null, capturedAt: null };
  }
}
