// The production parser keeps raw EXIF text and applies the recorded offset,
// falling back to Asia/Manila; it never revives dates in the host time zone.
export { extractImageExif as extractExif } from '../../src/domain/media.service';
export type { ExifResult } from '../../src/domain/media.service';
