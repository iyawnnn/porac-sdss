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
  OffsetTimeOriginal?: unknown;
  OffsetTime?: unknown;
}

// Manuscript revision Phase 3, step 3b: the capture time used by the
// evidence checks (reports.service.ts). EXIF DateTimeOriginal is the
// camera's wall-clock time ("YYYY:MM:DD HH:MM:SS") with no zone, so it is
// read as text and given an offset here, never left to exifr, whose own Date
// used the server's time zone.
// Porac's local time (Asia/Manila, UTC+08:00, no daylight saving), used when
// the photo records no offset of its own.
const DEFAULT_CAPTURE_OFFSET = '+08:00';
// Earlier capture years (including the "0000:00:00 00:00:00" placeholder some
// cameras write) are treated as unusable.
const MIN_CAPTURE_YEAR = 2000;

export interface CaptureTime {
  capturedAt: Date;
  // The offset used, e.g. '+08:00', and where it came from.
  offset: string;
  offsetSource: 'OffsetTimeOriginal' | 'OffsetTime' | 'Asia/Manila default';
}

// '+08:00' / '-05:30' -> minutes east of UTC, or null if malformed.
function offsetMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59) return null;
  return (match[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

// Only DateTimeOriginal is used: there is deliberately no fallback to
// DateTime, DateTimeDigitized or file dates, which record editing or saving
// rather than capture. The offset comes from OffsetTimeOriginal, else
// OffsetTime, else Asia/Manila. Returns null when the capture time is
// missing or unusable (unparseable, an impossible date, or before 2000). The
// result never depends on the server's time zone.
export function parseCaptureTime(
  dateTimeOriginal: unknown,
  offsetTimeOriginal: unknown,
  offsetTime: unknown,
): CaptureTime | null {
  if (typeof dateTimeOriginal !== 'string') return null;
  const match =
    /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(
      dateTimeOriginal.trim(),
    );
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (year < MIN_CAPTURE_YEAR || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wallClockMs);
  // Rejects month 0/13 and days the month doesn't have (Date.UTC rolls them).
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const fromOriginal = offsetMinutes(offsetTimeOriginal);
  const fromOffsetTime = offsetMinutes(offsetTime);
  const [offset, minutes, offsetSource]: [
    string,
    number,
    CaptureTime['offsetSource'],
  ] =
    fromOriginal !== null
      ? [
          (offsetTimeOriginal as string).trim(),
          fromOriginal,
          'OffsetTimeOriginal',
        ]
      : fromOffsetTime !== null
        ? [(offsetTime as string).trim(), fromOffsetTime, 'OffsetTime']
        : [DEFAULT_CAPTURE_OFFSET, 8 * 60, 'Asia/Manila default'];
  return {
    capturedAt: new Date(wallClockMs - minutes * 60 * 1000),
    offset,
    offsetSource,
  };
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
      // reviveValues: false keeps DateTimeOriginal as the raw EXIF text for
      // parseCaptureTime (exifr's revived Date depends on the server's time
      // zone); latitude/longitude are still computed as numbers.
      const d = (await exifr.parse(buffer, {
        gps: true,
        translateValues: false,
        reviveValues: false,
      })) as RawExif | undefined;
      const lat = typeof d?.latitude === 'number' ? d.latitude : null;
      const lng = typeof d?.longitude === 'number' ? d.longitude : null;
      const make = typeof d?.Make === 'string' ? d.Make : null;
      const model = typeof d?.Model === 'string' ? d.Model : null;
      const capture = parseCaptureTime(
        d?.DateTimeOriginal,
        d?.OffsetTimeOriginal,
        d?.OffsetTime,
      );
      const capturedAt = capture?.capturedAt ?? null;
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
                DateTimeOriginalOffset: capture?.offset ?? null,
                DateTimeOriginalOffsetSource: capture?.offsetSource ?? null,
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
