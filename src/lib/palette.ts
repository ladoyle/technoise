// The palette as /styleguide/ prints it — content, like resume.ts, not a helper.
//
// Two facts are declared here and nothing else is: each brand base's literal hex
// (mirrored from src/styles/tokens.css) and, per swatch, which base each semantic
// token resolves to in each scheme (mirrored from the same file's :root and
// dark-scheme blocks). Every string the page prints — the hex captions and the WCAG
// contrast ratios — is derived from those two. The ratios in particular are computed,
// never transcribed: a printed ratio is a claim about conformance, and a hand-typed
// one is a claim nobody re-measured.
//
// The duplication that remains is the hex, and it is the same kind the brand SVGs
// carry: unavoidable, because a caption cannot print a var(). It is pinned the same
// way — tests/palette-tokens.test.ts reads tokens.css at test time and fails if either
// declared fact drifts. That test, not a reviewer's memory, is what keeps the page
// honest; a token edit that is not mirrored here goes red instead of leaving the page
// printing a superseded hex beside a live, correct chip.

import { contrastRatio } from "./contrast";

export type Scheme = "light" | "dark";

/** Brand bases and derived tints, byte-for-byte as tokens.css's :root declares them. */
export const BASES = {
  cream: "#fdf9f3",
  ink: "#0c3242",
  signal: "#0c83ae",
  "signal-700": "#0a6f94",
  pulse: "#f75e1a",
  "pulse-700": "#b94614",
  slate: "#c2d1d8",
  "signal-300": "#6ec9e8",
  "pulse-300": "#ff9f6b",
  "ink-muted": "#48646e",
  "ink-sunken": "#1f4250",
  "ink-border": "#55727e",
  "cream-muted": "#cdd1d0",
  "cream-sunken": "#efede8",
} as const;

export type BaseName = keyof typeof BASES;

/** What a ratio on this page is measured against: the page colour of its own scheme. */
export const PAGE_BASE: Record<Scheme, BaseName> = { light: "cream", dark: "ink" };

interface SwatchSource {
  token: string;
  role: string;
  bases: Record<Scheme, BaseName>;
  /** Name the base beside its hex, for the two rows whose value *is* the page pair. */
  showBaseName?: boolean;
  /** Qualifier for a measurement that is not a text-on-background claim. */
  ratioNote?: string;
  /** One decimal reads every row but the sunken pair, where 1.1 / 1.3 hides the point. */
  decimals?: number;
  /** A colour that *is* the page surface has no ratio against it. */
  measured?: boolean;
}

const SOURCES: SwatchSource[] = [
  {
    token: "--surface",
    role: "Page",
    bases: { light: "cream", dark: "ink" },
    showBaseName: true,
    measured: false,
  },
  {
    token: "--surface-sunken",
    role: "Code, callouts",
    bases: { light: "cream-sunken", dark: "ink-sunken" },
    ratioNote: "vs page",
    decimals: 2,
  },
  {
    token: "--text",
    role: "Body text",
    bases: { light: "ink", dark: "cream" },
    showBaseName: true,
  },
  { token: "--text-muted", role: "Meta, captions", bases: { light: "ink-muted", dark: "cream-muted" } },
  { token: "--link", role: "Body links", bases: { light: "signal-700", dark: "signal-300" } },
  { token: "--accent-text", role: "Orange as text", bases: { light: "pulse-700", dark: "pulse-300" } },
  {
    token: "--accent-fill",
    role: "Primary button fill",
    bases: { light: "pulse", dark: "pulse" },
    ratioNote: "vs page",
  },
  { token: "--border", role: "Rules, hairlines", bases: { light: "slate", dark: "ink-border" } },
  { token: "--focus", role: "Focus ring", bases: { light: "signal", dark: "signal-300" } },
  { token: "--rule", role: "Quote rule", bases: { light: "signal", dark: "signal-300" } },
];

export interface Swatch {
  token: string;
  role: string;
  bases: Record<Scheme, BaseName>;
  /** Display hex for each scheme, e.g. "#0A6F94" or "cream #FDF9F3". */
  light: string;
  dark: string;
  /** Display ratio, e.g. "5.4:1 / 7.2:1", collapsed to one figure when both agree. */
  ratio: string;
  /** The unrounded measurements behind that string, or null for the page colour. */
  ratios: Record<Scheme, number> | null;
}

const caption = (base: BaseName, showBaseName: boolean): string =>
  `${showBaseName ? `${base} ` : ""}${BASES[base].toUpperCase()}`;

const format = (ratio: number, decimals: number): string => `${ratio.toFixed(decimals)}:1`;

export const SWATCHES: Swatch[] = SOURCES.map((source) => {
  const ratios =
    source.measured === false
      ? null
      : {
          light: contrastRatio(BASES[source.bases.light], BASES[PAGE_BASE.light]),
          dark: contrastRatio(BASES[source.bases.dark], BASES[PAGE_BASE.dark]),
        };

  let ratio = "—";
  if (ratios) {
    const decimals = source.decimals ?? 1;
    const light = format(ratios.light, decimals);
    const dark = format(ratios.dark, decimals);
    ratio = light === dark ? light : `${light} / ${dark}`;
    if (source.ratioNote) ratio += ` ${source.ratioNote}`;
  }

  return {
    token: source.token,
    role: source.role,
    bases: source.bases,
    light: caption(source.bases.light, source.showBaseName === true),
    dark: caption(source.bases.dark, source.showBaseName === true),
    ratio,
    ratios,
  };
});
