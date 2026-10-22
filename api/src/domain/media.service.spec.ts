import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import exifr from 'exifr';
import sharp from 'sharp';
import { MediaService, parseCaptureTime } from './media.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
    },
  },
}));

// exifr's default export is a frozen ESM namespace object — jest.spyOn can't
// reassign .parse directly. Wrap it in a jest.fn() that calls through to the
// real implementation by default, so every test gets real exifr behavior
// unless a specific test overrides it with mockResolvedValueOnce/etc.
jest.mock('exifr', () => {
  const actual = jest.requireActual('exifr').default;
  return {
    __esModule: true,
    default: {
      parse: jest.fn((...args: unknown[]) => actual.parse(...args)),
    },
  };
});

// The smallest possible valid PNG (1x1, transparent) — real bytes, not a
// mock, so computeDHash exercises actual sharp decode behavior.
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeUploadStream(
  callbackResult: { err: Error | null; result: { secure_url: string } | null },
) {
  const uploadStream = cloudinary.uploader.upload_stream as jest.Mock;
  uploadStream.mockImplementation(
    (
      _options: unknown,
      callback: (err: Error | null, result: { secure_url: string } | null) => void,
    ) => ({
      end: () => callback(callbackResult.err, callbackResult.result),
    }),
  );
  return uploadStream;
}

describe('MediaService.uploadImage', () => {
  it('invokes Cloudinary with resource_type: "image" pinned', async () => {
    const uploadStream = makeUploadStream({
      err: null,
      result: { secure_url: 'https://res.cloudinary.com/test/image/upload/x.jpg' },
    });
    const service = new MediaService();

    await service.uploadImage(Buffer.from('fake-image-bytes'));

    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({ resource_type: 'image' }),
      expect.any(Function),
    );
  });

  it('resolves with the secure_url on a successful upload', async () => {
    makeUploadStream({
      err: null,
      result: { secure_url: 'https://res.cloudinary.com/test/image/upload/x.jpg' },
    });
    const service = new MediaService();

    const url = await service.uploadImage(Buffer.from('fake-image-bytes'));

    expect(url).toBe('https://res.cloudinary.com/test/image/upload/x.jpg');
  });

  it('rejects when Cloudinary returns an error', async () => {
    makeUploadStream({ err: new Error('quota exceeded'), result: null });
    const service = new MediaService();

    await expect(
      service.uploadImage(Buffer.from('fake-image-bytes')),
    ).rejects.toThrow('quota exceeded');
  });

  it('rejects with a generic message when Cloudinary returns neither an error nor a result', async () => {
    makeUploadStream({ err: null, result: null });
    const service = new MediaService();

    await expect(
      service.uploadImage(Buffer.from('fake-image-bytes')),
    ).rejects.toThrow('Cloudinary upload failed');
  });
});

describe('MediaService.computeDHash', () => {
  it('returns a 16-character hex string for a valid image buffer', async () => {
    const service = new MediaService();
    const buffer = Buffer.from(VALID_PNG_BASE64, 'base64');

    const hash = await service.computeDHash(buffer);

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns null instead of throwing for a malformed/corrupt buffer (hardening item 5)', async () => {
    const service = new MediaService();
    const buffer = Buffer.from('this is not an image');

    await expect(service.computeDHash(buffer)).resolves.toBeNull();
  });
});

describe('MediaService.extractExif', () => {
  it('returns an all-null result for a real image with no EXIF/GPS data present', async () => {
    const service = new MediaService();
    const buffer = Buffer.from(VALID_PNG_BASE64, 'base64');

    const result = await service.extractExif(buffer);

    expect(result).toEqual({
      lat: null,
      lng: null,
      capturedAt: null,
      make: null,
      model: null,
      data: null,
    });
  });

  it('degrades gracefully instead of throwing when exifr cannot parse the buffer at all (hardening item 8)', async () => {
    const service = new MediaService();
    // Real, unmocked exifr.parse actually throws "Unknown file format" on
    // bytes like this — verified directly against the installed library —
    // exercising the real failure path, not an assumed one.
    const buffer = Buffer.from('this is not an image at all, just text bytes');

    const result = await service.extractExif(buffer);

    expect(result).toEqual({
      lat: null,
      lng: null,
      capturedAt: null,
      make: null,
      model: null,
      data: null,
    });
  });

  it('maps GPS/make/model/capturedAt fields into the ExifResult when present', async () => {
    // 16:30 Porac time (no offset in the EXIF) is 08:30 UTC.
    const capturedAt = new Date('2026-01-15T08:30:00.000Z');
    const parseMock = exifr.parse as jest.Mock;
    parseMock.mockResolvedValueOnce({
      latitude: 15.06,
      longitude: 120.48,
      Make: 'Google',
      Model: 'Pixel 8',
      DateTimeOriginal: '2026:01:15 16:30:00',
    });
    const service = new MediaService();

    const result = await service.extractExif(Buffer.from('irrelevant-mocked'));

    expect(result).toEqual({
      lat: 15.06,
      lng: 120.48,
      capturedAt,
      make: 'Google',
      model: 'Pixel 8',
      data: {
        GPSLatitude: 15.06,
        GPSLongitude: 120.48,
        GPSLatitudeRef: 'N',
        GPSLongitudeRef: 'E',
        DateTimeOriginal: capturedAt.toISOString(),
        DateTimeOriginalOffset: '+08:00',
        DateTimeOriginalOffsetSource: 'Asia/Manila default',
        Make: 'Google',
        Model: 'Pixel 8',
      },
    });
  });
});

// Manuscript revision Phase 3, step 3b: DateTimeOriginal is the camera's
// wall-clock time. It is read with the photo's own offset, else as Porac
// time (UTC+08:00), never in the server's time zone; unusable dates are null.
// Real JPEGs written with piexifjs and parsed by the real exifr.
interface PiexifLike {
  TAGS: { Exif: Record<number, { name: string; type: string }> };
  ImageIFD: Record<string, number>;
  ExifIFD: Record<string, number>;
  GPSIFD: Record<string, number>;
  dump(data: Record<string, unknown>): string;
  insert(exif: string, jpeg: string): string;
}
const piexif = jest.requireActual<PiexifLike>('piexifjs');
// OffsetTime / OffsetTimeOriginal (EXIF 2.31) are missing from piexifjs's tag
// table; exifr reads them.
piexif.TAGS.Exif[36880] = { name: 'OffsetTime', type: 'Ascii' };
piexif.TAGS.Exif[36881] = { name: 'OffsetTimeOriginal', type: 'Ascii' };
const OFFSET_TIME = 36880;
const OFFSET_TIME_ORIGINAL = 36881;

async function jpegWithExif(exif: Record<number, string>): Promise<Buffer> {
  const jpeg = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();
  const withExif = piexif.insert(
    piexif.dump({
      '0th': { [piexif.ImageIFD.Make]: 'Test' },
      Exif: exif,
      GPS: {
        [piexif.GPSIFD.GPSLatitudeRef]: 'N',
        [piexif.GPSIFD.GPSLatitude]: [
          [15, 1],
          [4, 1],
          [0, 1],
        ],
        [piexif.GPSIFD.GPSLongitudeRef]: 'E',
        [piexif.GPSIFD.GPSLongitude]: [
          [120, 1],
          [32, 1],
          [0, 1],
        ],
      },
      '1st': {},
      thumbnail: null,
    }),
    `data:image/jpeg;base64,${jpeg.toString('base64')}`,
  );
  return Buffer.from(withExif.split(',')[1], 'base64');
}

describe('MediaService.extractExif capture time (Phase 3, step 3b)', () => {
  // Jest runs tests in a sandbox where setting process.env.TZ never reaches
  // Node's clock, so each time zone gets its own child process running the
  // real extractExif through tsx, and reports the zone offset it ran under.
  it('gives the same instant under TZ=UTC and TZ=Asia/Manila, reading a time with no offset as Porac time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-time-'));
    try {
      const image = join(dir, 'photo.jpg');
      writeFileSync(
        image,
        await jpegWithExif({
          [piexif.ExifIFD.DateTimeOriginal]: '2026:10:20 14:30:00',
        }),
      );
      const probe = join(dir, 'probe.ts');
      writeFileSync(
        probe,
        [
          `import { readFileSync } from 'fs';`,
          `import { MediaService } from ${JSON.stringify(join(__dirname, 'media.service'))};`,
          `void new MediaService().extractExif(readFileSync(process.argv[2])).then((r) =>`,
          `  console.log(JSON.stringify({ zoneOffset: new Date(2026, 0, 1).getTimezoneOffset(), capturedAt: r.capturedAt?.toISOString() ?? null, data: r.data })));`,
        ].join('\n'),
      );
      const apiRoot = join(__dirname, '..', '..');
      const runUnder = (tz: string) =>
        JSON.parse(
          execFileSync(
            process.execPath,
            [
              join(apiRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
              probe,
              image,
            ],
            { cwd: apiRoot, env: { ...process.env, TZ: tz }, encoding: 'utf8' },
          ),
        ) as {
          zoneOffset: number;
          capturedAt: string | null;
          data: Record<string, unknown> | null;
        };

      const underUtc = runUnder('UTC');
      const underManila = runUnder('Asia/Manila');

      expect(underUtc.zoneOffset).toBe(0);
      expect(underManila.zoneOffset).toBe(-480);
      expect(underUtc.capturedAt).toBe('2026-10-20T06:30:00.000Z');
      expect(underManila.capturedAt).toBe('2026-10-20T06:30:00.000Z');
      expect(underUtc.data).toEqual(underManila.data);
      expect(underUtc.data).toMatchObject({
        DateTimeOriginal: '2026-10-20T06:30:00.000Z',
        DateTimeOriginalOffset: '+08:00',
        DateTimeOriginalOffsetSource: 'Asia/Manila default',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('honors OffsetTimeOriginal over OffsetTime', async () => {
    const buffer = await jpegWithExif({
      [piexif.ExifIFD.DateTimeOriginal]: '2026:10:20 14:30:00',
      [OFFSET_TIME_ORIGINAL]: '+02:00',
      [OFFSET_TIME]: '+05:00',
    });
    const result = await new MediaService().extractExif(buffer);
    expect(result.capturedAt?.toISOString()).toBe('2026-10-20T12:30:00.000Z');
    expect(result.data).toMatchObject({
      DateTimeOriginalOffset: '+02:00',
      DateTimeOriginalOffsetSource: 'OffsetTimeOriginal',
    });
  });

  it('uses OffsetTime when OffsetTimeOriginal is absent', async () => {
    const buffer = await jpegWithExif({
      [piexif.ExifIFD.DateTimeOriginal]: '2026:10:20 14:30:00',
      [OFFSET_TIME]: '-05:00',
    });
    const result = await new MediaService().extractExif(buffer);
    expect(result.capturedAt?.toISOString()).toBe('2026-10-20T19:30:00.000Z');
    expect(result.data).toMatchObject({
      DateTimeOriginalOffset: '-05:00',
      DateTimeOriginalOffsetSource: 'OffsetTime',
    });
  });

  it.each([
    '0000:00:00 00:00:00',
    'not a date',
    '1999:12:31 23:59:59',
    '2026:02:30 10:00:00',
    '2026:13:01 10:00:00',
    '2026:10:20 24:00:00',
  ])(
    'treats DateTimeOriginal %p as unusable (capturedAt null)',
    async (value) => {
      const buffer = await jpegWithExif({
        [piexif.ExifIFD.DateTimeOriginal]: value,
      });
      const result = await new MediaService().extractExif(buffer);
      expect(result.capturedAt).toBeNull();
      // GPS is still read; only the capture time is dropped.
      expect(result.lat).toBeCloseTo(15.0667, 4);
      expect(result.data).toMatchObject({
        DateTimeOriginal: null,
        DateTimeOriginalOffset: null,
        DateTimeOriginalOffsetSource: null,
      });
    },
  );
});

describe('parseCaptureTime', () => {
  it('reads a wall-clock time with no offset as UTC+08:00', () => {
    expect(
      parseCaptureTime('2026:10:20 14:30:00', undefined, undefined),
    ).toEqual({
      capturedAt: new Date('2026-10-20T06:30:00.000Z'),
      offset: '+08:00',
      offsetSource: 'Asia/Manila default',
    });
  });

  it('skips a malformed or out-of-range offset to the next source', () => {
    expect(
      parseCaptureTime('2026:10:20 14:30:00', '+8', '-05:30')?.offsetSource,
    ).toBe('OffsetTime');
    expect(
      parseCaptureTime('2026:10:20 14:30:00', '+15:00', undefined)?.offset,
    ).toBe('+08:00');
  });

  it('applies a half-hour offset', () => {
    expect(
      parseCaptureTime('2026:10:20 14:30:00', '-05:30', undefined)?.capturedAt,
    ).toEqual(new Date('2026-10-20T20:00:00.000Z'));
  });

  it('returns null for a missing or non-text capture time', () => {
    expect(parseCaptureTime(undefined, '+08:00', undefined)).toBeNull();
    expect(
      parseCaptureTime(new Date('2026-10-20T06:30:00Z'), undefined, undefined),
    ).toBeNull();
  });
});
