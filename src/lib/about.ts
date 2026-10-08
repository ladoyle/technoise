// One module for the About page's content, so the visible page and its structured data
// cannot disagree about a job title, a sentence or a skill. Content, not logic — and
// deliberately free of image imports, because vitest imports this file directly.
//
// A privacy rule governs this file and is enforced by its types: /about/ may never
// publish a phone number or a city/state/other location. There is no location,
// locality, region, address or telephone field for either to land in, and
// tests/nav-contract.test.ts walks this module's keys so one added before anything
// renders it still fails the suite.
//
// `profiles` derives from SITE.author.sameAs, so a profile link is added or removed
// in one place and lights up the visible contact list, the JSON-LD `sameAs` and the
// site footer's Elsewhere block together — never write a profile URL literally in
// this file. That third consumer is why the export lives in a content module rather
// than in the page: it is the site's one derivation point for a profile URL.

import { SITE } from "./seo";

export interface SkillGroup {
  label: string;
  items: string[];
}

export interface About {
  name: string;
  jobTitle: string;
  email: string;
  lede: string;
  paragraphs: string[];
  skills: SkillGroup[];
  portraitAlt: string;
}

export const ABOUT: About = {
  name: "Luke Doyle",
  jobTitle: "Lead Software Engineer",
  email: "doyleluke76@gmail.com",
  lede: "I'm Luke, a lead software engineer building systems that people rely on with skills people can trust.",
  paragraphs: [
    "Starting in security, I broke things on purpose to learn how they fail. That knowledge taught me how to build systems that hold up under pressure, and how to choose technology that lasts instead of technology that merely trends.",
    "These skills have followed me through every level of my career. From the automotive industry to finance, I've grown from writing code to designing the platforms built from it, and then to leading the teams that build them. Each step reinforced the same lesson: reliability at scale comes from good decisions made early. The best way I've found to make those decisions stick is to share what I know, so mentoring is as much a part of my work as building.",
    "Lately, I put my expertise into AI-assisted development and AI-powered systems, to better the ways that people work. I treat prompts and agent workflows like any other engineering surface, something to design, measure, and improve, so the tools save real time instead of adding noise. In the end, my goal is simple: build things that work, and let the people who depend on them rest easy.",
  ],
  skills: [
    { label: "Systems", items: ["distributed systems", "API design", "data pipelines"] },
    { label: "Cloud", items: ["AWS", "Kubernetes", "Docker", "Terraform"] },
    { label: "Languages", items: ["Java", "Python", "Go"] },
    { label: "Data", items: ["Snowflake", "Kafka", "PySpark"] },
    { label: "AI-assisted development", items: ["prompt engineering", "agent workflows"] },
    { label: "Leadership", items: ["mentoring", "Agile delivery"] },
  ],
  // Empty while the portrait is a flat placeholder: there is nothing in it to describe.
  // The real alt text arrives with the real photo.
  portraitAlt: "",
};

export interface Profile {
  label: string;
  href: string;
}

const PROFILE_LABELS: Record<string, string> = {
  "www.linkedin.com": "LinkedIn",
  "linkedin.com": "LinkedIn",
  "github.com": "GitHub",
};

// Derived, never written literally: one profile URL lives in SITE.author.sameAs and
// feeds the visible contact list, the JSON-LD and the site footer alike. A host with
// no label here is dropped rather than rendered under a guessed name, so callers must
// tolerate an empty list rather than assume two entries.
//
// Two guards on what reaches an href. The scheme is checked because new URL() parses an
// authority for any scheme, so "javascript://github.com/..." has host "github.com" and
// would otherwise earn the GitHub label and render as a live link; the duller version of
// the same slip is a typo'd "htps://" shipping a dead link under a correct-looking name.
// The lookup uses hasOwn because PROFILE_LABELS is an object literal, so an inherited key
// like "constructor" is truthy and would put a function where this type promises a string.
export const profiles: Profile[] = SITE.author.sameAs.flatMap((href) => {
  const { protocol, host } = new URL(href);
  if (protocol !== "https:" || !Object.hasOwn(PROFILE_LABELS, host)) return [];
  return [{ label: PROFILE_LABELS[host], href }];
});
