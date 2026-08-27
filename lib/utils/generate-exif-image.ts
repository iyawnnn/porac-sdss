import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import sharp from "sharp";
import piexif from "piexifjs";

function dms(value: number): [[number, number], [number, number], [number, number]] {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 10000);
  return [[degrees, 1], [minutes, 1], [seconds, 10000]];
}

function stamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Deterministic 9x8 grayscale-cell grid — 9 columns by 8 rows, matching
// MediaService.computeDHash's exact resize target 1:1 (each grid cell
// resizes down to essentially one dHash sample pixel, rather than several
// cells blending into one sample) — rasterized from SVG. Distinct `variant`
// numbers produce genuinely different adjacent-pixel luminance transitions
// (unlike a flat fill, which hashes identically regardless of color — see
// generateExifImage's `variant` doc below), while the same `variant` always
// reproduces byte-identical output.
//
// Cell values are bimodal (DARK/LIGHT, not a smooth range): dHash only
// cares about the *sign* of each left-vs-right comparison, and a large,
// fixed gap between the two values keeps that sign stable through
// JPEG quantization and the resize's interpolation blur at cell
// boundaries — a subtle gradient was tried first and measured to collide
// (Hamming distance <= the app's duplicate threshold) across a realistic
// batch of ~50 variants; this bimodal version was verified not to.
const DARK = 30;
const LIGHT = 225;

// Scrambles (variant, row, col) into a pseudo-random bit — a linear
// function of position would produce a smooth gradient that dHash's
// downsample can wash back into a trivially monotonic (and therefore
// collision-prone) pattern. The multiply-xor-shift here is the same shape
// as a standard integer hash (Knuth multiplicative + xorshift), not
// cryptographic, just enough to kill the linear correlation.
function cellBit(variant: number, row: number, col: number): 0 | 1 {
  let h = (variant * 2654435761 + row * 40503 + col * 2246822519) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h & 1) as 0 | 1;
}

function variantPatternSvg(variant: number): string {
  const cols = 9;
  const rows = 8;
  const cellW = 600 / cols;
  const cellH = 400 / rows;
  let rects = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gray = cellBit(variant, row, col) ? LIGHT : DARK;
      const hex = gray.toString(16).padStart(2, "0");
      rects += `<rect x="${col * cellW}" y="${row * cellH}" width="${cellW}" height="${cellH}" fill="#${hex}${hex}${hex}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">${rects}</svg>`;
}

// Renders just the variant-patterned JPEG bytes, no EXIF at all — for
// scenarios that need a visually-distinct (non-colliding) image but must
// NOT carry any EXIF/GPS metadata (e.g. a "no EXIF" detection scenario). A
// flat/no-pattern image would be the wrong choice here even without EXIF,
// since two such images still collide on the same all-zero dHash as any
// other uniform fill.
export async function renderVariantJpeg(variant: number): Promise<Buffer> {
  return sharp(Buffer.from(variantPatternSvg(variant))).jpeg({ quality: 88 }).toBuffer();
}

export async function generateExifImage({
  outputPath,
  lat,
  lng,
  date = new Date(),
  make = "Apple",
  model = "iPhone 15 Pro",
  color = { r: 55, g: 90, b: 120 },
  variant,
}: {
  outputPath: string;
  lat: number;
  lng: number;
  date?: Date;
  make?: string;
  model?: string;
  color?: { r: number; g: number; b: number };
  // Optional. Omitted (the default): unchanged flat-color-fill behavior,
  // exactly as before — every existing caller keeps producing the same
  // output. When provided: renders a deterministic multi-cell pattern
  // instead, seeded by this number, so distinct callers get distinct
  // perceptual hashes (MediaService.computeDHash) instead of all colliding
  // on the same all-zero hash a uniform fill always produces. Pass the same
  // `variant` twice to deliberately reproduce an identical image/hash (e.g.
  // a duplicate-image detection scenario).
  variant?: number;
}) {
  const jpeg =
    variant === undefined
      ? await sharp({
          create: { width: 600, height: 400, channels: 3, background: color },
        }).jpeg({ quality: 88 }).toBuffer()
      : await sharp(Buffer.from(variantPatternSvg(variant))).jpeg({ quality: 88 }).toBuffer();
  const metadata = {
    "0th": {
      [piexif.ImageIFD.Make]: make,
      [piexif.ImageIFD.Model]: model,
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: stamp(date),
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? "N" : "S",
      [piexif.GPSIFD.GPSLatitude]: dms(lat),
      [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? "E" : "W",
      [piexif.GPSIFD.GPSLongitude]: dms(lng),
    },
    "1st": {},
    thumbnail: null,
  };
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const encoded = piexif.insert(piexif.dump(metadata), dataUrl);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(encoded.split(",")[1], "base64"));
  return outputPath;
}
