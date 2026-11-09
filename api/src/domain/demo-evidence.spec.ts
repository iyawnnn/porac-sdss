import { execFileSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { renderExifImage } from '../../../lib/utils/generate-exif-image';
import { extractExif } from '../../scripts/lib/exif';
import { extractImageExif } from './media.service';
import { evidenceCheckFlags } from '../reports/reports.service';
import { haversineMeters } from '../common/utils/distance';

const NOW = new Date('2026-11-09T08:30:00.000Z');
const pin = { lat: 15.0733, lng: 120.5406 };
describe('demo evidence uses the production parser and flag rules', () => {
  it('the seed parser is the production parser, without a duplicate implementation', () => {
    expect(extractExif).toBe(extractImageExif);
  });
  it.each([
    [
      '60 m mismatch',
      'Pothole / Road Surface Damage',
      60,
      0,
      true,
      false,
      ['LOCATION_MISMATCH'],
    ],
    ['40 m control', 'Pothole / Road Surface Damage', 40, 0, true, false, []],
    ['no GPS', 'Localized Flooding', 0, 0, false, false, []],
    [
      '27-hour flood',
      'Localized Flooding',
      0,
      27,
      true,
      false,
      ['STALE_EVIDENCE'],
    ],
    [
      'three-day pothole',
      'Pothole / Road Surface Damage',
      0,
      72,
      true,
      false,
      [],
    ],
    [
      'future capture',
      'Localized Flooding',
      0,
      -4,
      true,
      false,
      ['TIMESTAMP_ANOMALY'],
    ],
    [
      'missing capture',
      'Localized Flooding',
      0,
      0,
      true,
      true,
      ['MISSING_METADATA'],
    ],
  ] as const)(
    '%s is accepted with the expected review flags',
    async (_name, category, metres, hours, gps, missing, expected) => {
      const image = await renderExifImage({
        lat: pin.lat + metres / 111000,
        lng: pin.lng,
        date: missing ? null : new Date(NOW.getTime() - hours * 3600000),
        gps,
        variant: 701,
      });
      const exif = await extractExif(image);
      const mismatch =
        exif.lat === null || exif.lng === null
          ? null
          : haversineMeters(pin.lat, pin.lng, exif.lat, exif.lng);
      expect(
        evidenceCheckFlags({
          locationMismatchM: mismatch,
          capturedAt: exif.capturedAt,
          submittedAt: NOW,
          submittedCategory: category,
        }),
      ).toEqual(expected);
    },
  );
  it('an unusable capture time gives MISSING_METADATA', async () => {
    const image = await renderExifImage({
      ...pin,
      date: new Date('invalid'),
      variant: 703,
    });
    const exif = await extractExif(image);
    expect(exif.capturedAt).toBeNull();
    expect(
      evidenceCheckFlags({
        locationMismatchM: 0,
        capturedAt: exif.capturedAt,
        submittedAt: NOW,
        submittedCategory: 'Localized Flooding',
      }),
    ).toEqual(['MISSING_METADATA']);
  });
  // Jest's env proxy does not change Node's native clock. Use real child
  // processes and assert their offsets as well as the parsed instant.
  it.each([
    ['UTC', 0],
    ['Asia/Manila', -480],
    ['America/New_York', 300],
  ] as const)(
    'generated EXIF round-trips to the same instant in %s',
    (zone, offset) => {
      const apiRoot = join(__dirname, '../..');
      const probe = [
        "require('tsx/cjs');",
        'const {renderExifImage}=require(' +
          JSON.stringify(
            join(__dirname, '../../../lib/utils/generate-exif-image.ts'),
          ) +
          ');',
        'const {extractExif}=require(' +
          JSON.stringify(join(__dirname, '../../scripts/lib/exif.ts')) +
          ');',
        'void (async()=>{const image=await renderExifImage({lat:15.0733,lng:120.5406,date:new Date("2026-11-09T08:30:00.000Z"),variant:702});const exif=await extractExif(image);console.log(JSON.stringify({offset:new Date("2026-01-01T00:00:00Z").getTimezoneOffset(),capturedAt:exif.capturedAt?.toISOString()}));})();',
      ].join('\n');
      const result = JSON.parse(
        execFileSync(process.execPath, ['-e', probe], {
          cwd: apiRoot,
          env: {
            ...process.env,
            NODE_PATH: [join(apiRoot, 'node_modules'), process.env.NODE_PATH]
              .filter(Boolean)
              .join(delimiter),
            TZ: zone,
            TSX_TSCONFIG_PATH: join(apiRoot, 'tsconfig.json'),
          },
          encoding: 'utf8',
        }),
      ) as { offset: number; capturedAt: string };
      expect(result).toEqual({ offset, capturedAt: NOW.toISOString() });
    },
    30_000,
  );
});
