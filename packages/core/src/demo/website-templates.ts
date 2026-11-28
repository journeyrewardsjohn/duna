/**
 * Demo fixtures: website-templates (owner: B8b). Five available templates
 * (placeholder names, no real brands) plus one draft and one retired
 * version, and a site started from each origin. Shaped by
 * `contracts/website-templates.ts`; parsed in
 * packages/api/src/contracts/website-templates.test.ts.
 */
import { demoId } from "./ids";
import { websiteWorkspaceDemoIds } from "./website-workspace";

const id = (n: number) => demoId("website-templates", n);

type Status = "draft" | "available" | "retired";
const template = (
  n: number,
  key: string,
  name: string,
  description: string,
  pagePaths: string[],
  status: Status = "available",
  version = 1,
) => ({
  templateId: id(n),
  key,
  version,
  name,
  description,
  status,
  previewImageUrl: `/media/website-templates/${key}.webp`,
  pagePaths,
});

export const websiteTemplatesDemoTemplates = [
  template(
    1,
    "shoreline",
    "Shoreline",
    "A calm club home with booking up front.",
    ["/", "/book", "/lessons", "/events", "/about"],
  ),
  template(
    2,
    "academy",
    "Academy",
    "For coaching programs: levels, coaches and schedules.",
    ["/", "/programs", "/coaches", "/book"],
  ),
  template(
    3,
    "tournament",
    "Tournament",
    "Events first: draws, results and registration.",
    ["/", "/events", "/results", "/register"],
  ),
  template(
    4,
    "courts",
    "Courts",
    "For facilities: courts, hours, access and rules.",
    ["/", "/courts", "/hours", "/rules"],
  ),
  template(
    5,
    "coach",
    "Coach",
    "One coach: lessons, availability and reviews.",
    ["/", "/lessons", "/book", "/about"],
  ),
  template(
    6,
    "shoreline",
    "Shoreline",
    "Next version in review.",
    ["/", "/book", "/lessons", "/events", "/about", "/juniors"],
    "draft",
    2,
  ),
  template(
    7,
    "boardwalk",
    "Boardwalk",
    "Retired layout kept for existing sites.",
    ["/", "/book"],
    "retired",
  ),
];

/** Onboarding answers by question key (string, yes/no or a list). */
export type WebsiteTemplatesDemoAnswers = Record<
  string,
  string | boolean | string[]
>;

export interface WebsiteTemplatesDemoSiteStart {
  readonly siteId: string;
  readonly origin: "template" | "existing-site";
  readonly templateId?: string;
  readonly templateName?: string;
  readonly existingSiteUrl?: string;
  readonly answers: WebsiteTemplatesDemoAnswers;
  readonly remainingQuestions: { key: string; prompt: string }[];
  readonly completedAt?: string;
}

export const websiteTemplatesDemoSiteStarts: WebsiteTemplatesDemoSiteStart[] = [
  {
    siteId: websiteWorkspaceDemoIds.site,
    origin: "existing-site",
    existingSiteUrl: "https://club.example",
    answers: {
      "keep-pages": ["/", "/lessons", "/coaches"],
      "booking-on-home": true,
      tone: "Friendly and clear",
    },
    remainingQuestions: [],
    completedAt: "2026-11-20T15:30:00.000Z",
  },
  {
    siteId: websiteWorkspaceDemoIds.draftSite,
    origin: "template",
    templateId: id(2),
    templateName: "Academy",
    answers: { "program-ages": "12–16" },
    remainingQuestions: [
      {
        key: "coach-photos",
        prompt: "Do you have photos of your coaches to use?",
      },
    ],
  },
];

export const websiteTemplatesDemo = {
  domain: "website-templates",
  templates: websiteTemplatesDemoTemplates,
  siteStarts: websiteTemplatesDemoSiteStarts,
} as const;
