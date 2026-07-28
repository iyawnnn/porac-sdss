import { v2 as cloudinary } from "cloudinary";

// Reads CLOUDINARY_URL from env automatically.
cloudinary.config({ secure: true });

export function uploadImage(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "porac-sdss-nextjs/reports" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
