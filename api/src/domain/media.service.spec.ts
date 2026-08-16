import { v2 as cloudinary } from 'cloudinary';
import exifr from 'exifr';
import { MediaService } from './media.service';

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
    const capturedAt = new Date('2026-01-15T08:30:00.000Z');
    const parseMock = exifr.parse as jest.Mock;
    parseMock.mockResolvedValueOnce({
      latitude: 15.06,
      longitude: 120.48,
      Make: 'Google',
      Model: 'Pixel 8',
      DateTimeOriginal: capturedAt,
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
        Make: 'Google',
        Model: 'Pixel 8',
      },
    });
  });
});
