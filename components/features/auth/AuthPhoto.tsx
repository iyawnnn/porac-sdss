import Image from "next/image";

// The one place to change the auth photograph. Replace the file, update
// `src`/`position` here and the provenance paragraph in docs/design-system.md 8.5
// (plus a credit inside this panel if the new licence needs one).
const AUTH_PHOTO = {
  src: "/images/auth-porac-jalung.jpg",
  /** `object-position`: which part of the photo survives the crop. */
  position: "50% 45%",
} as const;

// Fills its parent. Decorative, so no alt text: the page heading already says where you are.
// `object-cover` scales the photo to the panel height, so it renders wider than the panel;
// `sizes` asks for a variant that large so tall screens do not upscale a small one.
export function AuthPhoto() {
  return (
    <Image
      src={AUTH_PHOTO.src}
      alt=""
      fill
      sizes="(min-width: 768px) 100vw, 1px"
      style={{ objectPosition: AUTH_PHOTO.position }}
      className="object-cover dark:brightness-[0.7]"
    />
  );
}
