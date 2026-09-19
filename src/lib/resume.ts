// One module for the resume's content, so the visible page and its structured data
// cannot disagree about a job title, a date or a skill.
//
// A privacy rule governs this file and is enforced by its types: there is no
// location, locality, region, address or telephone field for a phone number or a
// city to land in, and none appears in the data below. The two place-words present
// are inseparable parts of institution proper names, not the owner's whereabouts.
//
// `profiles` derives from SITE.author.sameAs, so a profile link is added or removed
// in one place and lights up the visible contact list, the JSON-LD `sameAs` and the
// site footer's Elsewhere block together — never write a profile URL literally in
// this file. That third consumer is why the export outlives this page: it is the
// site's one derivation point for a profile URL, not the resume's alone.

import { SITE } from "./seo";

export interface Period {
  start: string; // "YYYY-MM"
  end?: string; // omitted = current
}

export interface Role {
  title: string;
  org: string;
  periods: Period[];
  bullets: string[];
}

export interface SkillGroup {
  label: string;
  items: string[];
}

export interface Degree {
  credential: string;
  institution: string;
  period: Period;
}

export interface Resume {
  name: string;
  title: string;
  focus: string;
  email: string;
  summary: string;
  roles: Role[];
  skills: SkillGroup[];
  education: Degree[];
}

export const RESUME: Resume = {
  name: "Luke Doyle",
  title: "Lead Software Engineer",
  focus: "Distributed systems, cloud engineering, AI-assisted development.",
  email: "doyleluke76@gmail.com",
  summary:
    "Lead Software Engineer with 6+ years of experience designing and implementing cloud-based systems that serve millions of customers and terabytes of data. Experience spans distributed APIs, AWS, data processing, Kubernetes, Java, Python, Go, and AI-assisted development. Promoted twice at JPMorgan Chase, progressing from Associate to Senior to Lead Software Engineer.",
  roles: [
    {
      title: "Lead Software Engineer",
      org: "JPMorgan Chase",
      periods: [{ start: "2025-01" }],
      bullets: [
        "Led multiple teams through design, implementation, and monitoring of distributed APIs serving more than 5 million customers with sub-second response times.",
        "Developed prompt-engineering workflows for AI agents using Copilot, improving context management by 40% and reducing developer time by 20%.",
        "Managed delivery of a Google Ads integration within six months using Agile engineering practices to provide merchant usage metrics.",
      ],
    },
    {
      title: "Senior Software Engineer",
      org: "JPMorgan Chase",
      periods: [{ start: "2023-01", end: "2024-12" }],
      bullets: [
        "Architected an API Gateway network with load balancers to asynchronously scale data services to more than 3 million customers.",
        "Mentored and trained junior engineers on AWS networking and distributed-system patterns through presentations, documentation, and one-on-one sessions.",
      ],
    },
    {
      title: "Associate Software Engineer",
      org: "JPMorgan Chase",
      periods: [{ start: "2021-10", end: "2022-12" }],
      bullets: [
        "Integrated Snowflake to replace EMR-based processing, reducing ETL runtime by 50%.",
        "Implemented AWS EMR data-processing systems with PySpark to refine large datasets for more than 1 million clients and publish results to UI teams through Kafka.",
        "Coordinated production releases with documentation, testing evidence, and software tracking, supporting application reliability above 99%.",
      ],
    },
    {
      title: "Junior Software Engineer",
      org: "VDart Digital",
      periods: [{ start: "2020-08", end: "2021-09" }],
      bullets: [
        "Modernized the Toyota mobile application REST API from a Java 8/Spring implementation to Go on Kubernetes, improving scalability and increasing reliability 5x.",
      ],
    },
    {
      title: "Cybersecurity Intern",
      org: "Tevora",
      periods: [
        { start: "2020-01", end: "2020-03" },
        { start: "2019-06", end: "2019-08" },
      ],
      bullets: [
        "Penetration-tested an Ethereum client against two known attack vectors.",
        "Enhanced license-plate recognition for the Tesla Surveillance Scout project by creating Python/OpenCV image filters.",
        "Automated open-source intelligence gathering with a Python web scraper and BeautifulSoup, reducing OSINT time by 10%.",
      ],
    },
  ],
  skills: [
    {
      label: "Languages and frameworks",
      items: ["Java", "Spring Boot", "Python", "Go", "C/C++", "Bash", "Lombok", "REST APIs"],
    },
    {
      label: "Cloud and infrastructure",
      items: [
        "AWS ECS",
        "AWS API Gateway",
        "AWS Lambda",
        "AWS Glue",
        "Amazon CloudWatch",
        "Kubernetes",
        "Docker",
        "Terraform",
        "Linux",
      ],
    },
    {
      label: "Data and messaging",
      items: ["Snowflake", "DynamoDB", "Apache Kafka", "PySpark", "ETL"],
    },
    {
      label: "Development and AI",
      items: ["Copilot", "prompt engineering", "distributed systems", "API design", "CRUD"],
    },
  ],
  education: [
    {
      credential: "B.S. Computer Science",
      institution: "University of California, Irvine",
      period: { start: "2018-09", end: "2020-06" },
    },
    {
      credential: "A.S. Computer Science",
      institution: "LA Valley College",
      period: { start: "2011-08", end: "2018-06" },
    },
  ],
};

// timeZone is required for the same reason src/lib/content.ts needs it: the date is
// constructed at UTC midnight, and a build machine behind UTC would otherwise render
// the previous month.
const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMonth(ym: string): string {
  return monthFormat.format(new Date(`${ym}-01T00:00:00Z`));
}

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
export const profiles: Profile[] = SITE.author.sameAs.flatMap((href) => {
  const label = PROFILE_LABELS[new URL(href).host];
  return label ? [{ label, href }] : [];
});
