export type Mark = { viewBox: string; width: string; height: string; body: string };

// Shared by Header.astro and Footer.astro so the two inlined lockups cannot drift apart —
// a brand SVG re-exported into a different shape has to fail both call sites at once. The
// caller supplies the `?raw` string rather than a path, which keeps public/brand/ visible
// as the source of truth at each call site and keeps the orphan-file guard able to see it.
export const brandMark = (file: string, source: string): Mark => {
  const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1];
  const styleEnd = source.indexOf("</style>");
  const svgEnd = source.lastIndexOf("</svg>");
  const box = viewBox?.trim().split(/\s+/) ?? [];

  // A build-time throw rather than a silent fallback: a brand SVG that stops matching
  // this shape must stop the build, not render a mark with no geometry.
  if (!viewBox || box.length !== 4 || styleEnd < 0 || svgEnd < 0) {
    throw new Error(`public/brand/${file} is not the expected single-<style> brand SVG`);
  }

  return {
    viewBox,
    width: box[2],
    height: box[3],
    body: source.slice(styleEnd + "</style>".length, svgEnd),
  };
};
