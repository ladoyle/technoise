// Kept out of seo.ts so that module stays importable by plain vitest without the
// astro:assets virtual module.

import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

import { OG_IMAGE, assertOgImageSize, type OgImage } from "./seo";

// JPEG, not WebP: LinkedIn and several scrapers drop WebP cards. Cover-cropped to
// exactly 1200x630 so no platform has to crop it uncontrolled; the 1.6–2.1
// ratio rule bounds how much a centre crop can take. `where` names the entry in the
// build error, since the schema cannot see dimensions to reject it earlier.
export async function entryOgImage(
  field: { src: ImageMetadata | string; alt?: string } | undefined,
  where: string,
): Promise<OgImage> {
  if (!field) return OG_IMAGE;
  // image() passes a remote URL through as a bare string with no dimensions, and
  // getImage() would return it unprocessed under our hardcoded JPEG 1200x630 tags.
  if (typeof field.src === "string") {
    throw new Error(`${where}: ogImage.src must be a local file under src/assets/og/, not ${field.src}.`);
  }
  assertOgImageSize(field.src.width, field.src.height, where);
  const image = await getImage({
    src: field.src,
    width: 1200,
    height: 630,
    fit: "cover",
    position: "center",
    format: "jpg",
    quality: 80,
  });
  // No fallback to OG_IMAGE.alt: it describes a different picture.
  const alt = field.alt ? { alt: field.alt } : {};
  return { src: image.src, type: "image/jpeg", width: 1200, height: 630, ...alt };
}
