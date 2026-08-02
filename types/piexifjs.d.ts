declare module "piexifjs" {
  type ExifValue = string | number | null | Array<[number, number]> | Record<number, unknown>;
  type ExifData = Record<string, Record<number, ExifValue> | null>;

  interface Piexif {
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    dump(data: ExifData): string;
    insert(exif: string, jpeg: string): string;
  }

  const piexif: Piexif;
  export default piexif;
}
