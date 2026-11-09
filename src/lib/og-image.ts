// Kept out of seo.ts so that module stays importable by plain vitest without the
// astro:assets virtual module.

import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

import { OG_IMAGE, type OgImage } from "./seo";

// JPEG, not WebP: LinkedIn and several scrapers drop WebP cards. Cover-cropped to
// exactly 1200x630 so no platform has to crop it uncontrolled; the schema's 1.6–2.1
// ratio rule bounds how much a centre crop can take.
export async function entryOgImage(field?: { src: ImageMetadata; alt: string }): Promise<OgImage> {
  if (!field) return OG_IMAGE;
  const image = await getImage({
    src: field.src,
    width: 1200,
    height: 630,
    fit: "cover",
    position: "center",
    format: "jpg",
    quality: 80,
  });
  return { src: image.src, type: "image/jpeg", width: 1200, height: 630, alt: field.alt };
}
