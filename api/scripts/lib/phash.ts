import sharp from 'sharp';

// Mirrors api/src/domain/media.service.ts's computeDHash/hammingDistanceHex
// exactly (same algorithm, same bit order) so seed-time duplicate-image
// detection matches what the real API would compute for the same file.
// Re-exported here for scripts the same way api/scripts/lib/exif.ts
// re-exports MediaService.extractExif.
export async function computeDHash(buffer: Buffer): Promise<string | null> {
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

export function hammingDistanceHex(hexA: string, hexB: string): number {
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
