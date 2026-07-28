import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import sharp from "sharp";
const piexif: any = require("piexifjs");
function dms(value: number): [[number, number], [number, number], [number, number]] { const abs = Math.abs(value), deg = Math.floor(abs), minFloat = (abs - deg) * 60, min = Math.floor(minFloat), sec = Math.round((minFloat - min) * 60 * 10000); return [[deg, 1], [min, 1], [sec, 10000]]; }
function stamp(date: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${date.getFullYear()}:${p(date.getMonth() + 1)}:${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`; }
export async function generateExifImage({ outputPath, lat, lng, date = new Date(), make = "Apple", model = "iPhone 15 Pro", color = { r: 55, g: 90, b: 120 } }: { outputPath: string; lat: number; lng: number; date?: Date; make?: string; model?: string; color?: { r: number; g: number; b: number } }) {
    const jpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: color } }).jpeg({ quality: 88 }).toBuffer(); const exif = { "0th": { [piexif.ImageIFD.Make]: make, [piexif.ImageIFD.Model]: model }, Exif: { [piexif.ExifIFD.DateTimeOriginal]: stamp(date) }, GPS: { [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? "N" : "S", [piexif.GPSIFD.GPSLatitude]: dms(lat), [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? "E" : "W", [piexif.GPSIFD.GPSLongitude]: dms(lng) }, "1st": {}, thumbnail: null };
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`; const encoded = piexif.insert(piexif.dump(exif), dataUrl); mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, Buffer.from(encoded.split(",")[1], "base64")); return outputPath;
}