import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import exifr from 'exifr';
import sharp from 'sharp';

export interface ExifResult {
  lat: number | null;
  lng: number | null;
  capturedAt: Date | null;
  make: string | null;
  model: string | null;
  data: Record<string, unknown> | null;
}

// exifr's parse() returns Promise<any> (its return shape depends on the
// Options passed in) — narrow to just the fields this app reads.
interface RawExif {
  latitude?: unknown;
  longitude?: unknown;
  Make?: unknown;
  Model?: unknown;
  DateTimeOriginal?: unknown;
}

@Injectable()
export class MediaService {
  constructor() {
    // `import { v2 as cloudinary } from 'cloudinary'` runs at module-load
    // time, before Nest's ConfigModule has populated process.env —
    // cloudinary's own uploader.js calls its internal config() once at
    // import too, caching an empty (API-key-less) config forever. Passing
    // `true` here forces that cache to re-parse process.env.CLOUDINARY_URL
    // now that it's actually set, instead of silently keeping the stale
    // empty one (see cloudinary/lib/config.js's `cloudinary_config == null`
    // guard — a plain `.config({...})` call only merges on top of it).
    cloudinary.config(true);
    cloudinary.config({ secure: true });
  }

  uploadImage(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        // Explicit rather than relying on Cloudinary's own default (which
        // is already 'image' when omitted) — pins the provider boundary so
        // it can't silently change under an account-level upload preset or
        // a future SDK default change.
        { folder: 'porac-sdss-nextjs/reports', resource_type: 'image' },
        (err, result) => {
          if (err || !result)
            return reject(
              new Error(err?.message ?? 'Cloudinary upload failed'),
            );
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }

  async extractExif(buffer: Buffer): Promise<ExifResult> {
    try {
      const d = (await exifr.parse(buffer, {
        gps: true,
        translateValues: false,
      })) as RawExif | undefined;
      const lat = typeof d?.latitude === 'number' ? d.latitude : null;
      const lng = typeof d?.longitude === 'number' ? d.longitude : null;
      const make = typeof d?.Make === 'string' ? d.Make : null;
      const model = typeof d?.Model === 'string' ? d.Model : null;
      const capturedAt =
        d?.DateTimeOriginal instanceof Date ? d.DateTimeOriginal : null;
      return {
        lat,
        lng,
        capturedAt,
        make,
        model,
        data:
          lat === null || lng === null
            ? null
            : {
                GPSLatitude: lat,
                GPSLongitude: lng,
                GPSLatitudeRef: lat >= 0 ? 'N' : 'S',
                GPSLongitudeRef: lng >= 0 ? 'E' : 'W',
                DateTimeOriginal: capturedAt ? capturedAt.toISOString() : null,
                Make: make,
                Model: model,
              },
      };
    } catch {
      return {
        lat: null,
        lng: null,
        capturedAt: null,
        make: null,
        model: null,
        data: null,
      };
    }
  }

  // dHash: resize to 9x8 grayscale, compare each pixel to its right neighbor.
  // 8x8 comparisons = 64 bits, stored as a 16-char hex string. An optional
  // duplicate-detection enhancement, not a core requirement — reports.
  // image_phash is nullable and the dedup query already filters it IS NOT
  // NULL, so a decode failure here degrades gracefully (same shape as
  // extractExif's own catch above) rather than failing the whole
  // submission over a photo the citizen still legitimately wants to report.
  async computeDHash(buffer: Buffer): Promise<string | null> {
    try {
      const { data } = await sharp(buffer)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let bits = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const left = data[row * 9 + col];
          const right = data[row * 9 + col + 1];
          bits += left < right ? '1' : '0';
        }
      }
      return BigInt('0b' + bits)
        .toString(16)
        .padStart(16, '0');
    } catch {
      return null;
    }
  }

  hammingDistanceHex(hexA: string, hexB: string): number {
    const zero = BigInt(0);
    const one = BigInt(1);
    let xor = BigInt('0x' + hexA) ^ BigInt('0x' + hexB);
    let count = 0;
    while (xor > zero) {
      count += Number(xor & one);
      xor >>= one;
    }
    return count;
  }
}
