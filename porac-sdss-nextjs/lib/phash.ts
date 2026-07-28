import sharp from "sharp";

// dHash: resize to 9x8 grayscale, compare each pixel to its right neighbor.
// 8x8 comparisons = 64 bits, stored as a 16-char hex string.
export async function computeDHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left < right ? "1" : "0";
    }
  }
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

export function hammingDistanceHex(hexA: string, hexB: string): number {
  const zero = BigInt(0);
  const one = BigInt(1);
  let xor = BigInt("0x" + hexA) ^ BigInt("0x" + hexB);
  let count = 0;
  while (xor > zero) {
    count += Number(xor & one);
    xor >>= one;
  }
  return count;
}
