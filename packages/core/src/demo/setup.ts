/**
 * Demo fixtures: setup (owner: B1). The demo club's profile, one setup run
 * per run status and outcome (the CS-States hard cases), and proposals in
 * every category and decision. Shaped by `contracts/setup.ts`; parsed in
 * packages/api/src/contracts/w3-fixtures.test.ts. Example values are
 * placeholders for the fictional demo club, never a real business.
 */
import { demoOrganization } from "../demo";
import { demoId } from "./ids";

const at = (iso: string) => iso;
const reviewRun = demoId("setup", 1);

export const setupDemoIds = {
  reviewRun,
  readingRun: demoId("setup", 2),
  queuedRun: demoId("setup", 3),
  appliedRun: demoId("setup", 4),
  unreachableRun: demoId("setup", 5),
  noWebsiteRun: demoId("setup", 6),
  foundLittleRun: demoId("setup", 7),
  cancelledRun: demoId("setup", 8),
} as const;

const page = (
  n: number,
  path: string,
  status: "queued" | "reading" | "read" | "failed" | "skipped",
  itemsFound = 0,
) => ({
  id: demoId("setup", 100 + n),
  position: n,
  url: `https://club.example/${path}`,
  title: path === "" ? "Home" : path[0]!.toUpperCase() + path.slice(1),
  status,
  itemsFound,
});

export const setupDemoProfile = {
  organizationId: demoOrganization.id,
  name: demoOrganization.name,
  phoneE164: "+13105550142",
  email: "hello@club.example",
  websiteUrl: "https://club.example",
  tagline: "[club tagline]",
  about: "[about the club]",
  hours: {
    weekly: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opens: "08:00",
      closes: "21:00",
    })),
    exceptions: [{ date: "2026-12-25", closed: true, note: "Holiday" }],
  },
  socials: { instagram: "https://instagram.example/club" },
  fieldSources: {
    phoneE164: {
      source: "website" as const,
      page: "/contact",
      confirmed: false,
    },
    email: { source: "website" as const, page: "/contact", confirmed: true },
    hours: { source: "person" as const, confirmed: true },
  },
  websiteLastReadAt: at("2026-11-27T18:12:00.000Z"),
  updatedAt: at("2026-11-27T18:20:00.000Z"),
};

const baseRun = {
  sourceKind: "website" as const,
  sourceUrl: "https://club.example",
  pagesTotal: 0,
  pagesRead: 0,
  itemsFound: 0,
  pages: [] as ReturnType<typeof page>[],
};

export const setupDemoRuns = [
  {
    ...baseRun,
    id: reviewRun,
    status: "review" as const,
    outcome: "complete" as const,
    pagesTotal: 8,
    pagesRead: 8,
    itemsFound: 19,
    pages: [
      page(0, "", "read", 5),
      page(1, "contact", "read", 4),
      page(2, "lessons", "read", 6),
      page(3, "coaches", "read", 2),
      page(4, "juniors", "read", 1),
      page(5, "membership", "read", 1),
      page(6, "policies", "read", 0),
      page(7, "blog", "skipped", 0),
    ],
    startedAt: at("2026-11-27T18:10:00.000Z"),
    finishedAt: at("2026-11-27T18:12:00.000Z"),
  },
  {
    ...baseRun,
    id: setupDemoIds.readingRun,
    status: "reading" as const,
    pagesTotal: 8,
    pagesRead: 5,
    itemsFound: 14,
    pages: [
      page(0, "", "read", 5),
      page(1, "contact", "read", 4),
      page(2, "lessons", "read", 5),
      page(3, "coaches", "reading"),
      page(4, "juniors", "queued"),
      page(5, "membership", "queued"),
      page(6, "policies", "queued"),
      page(7, "about", "failed"),
    ],
    startedAt: at("2026-11-27T18:10:00.000Z"),
  },
  { ...baseRun, id: setupDemoIds.queuedRun, status: "queued" as const },
  {
    ...baseRun,
    id: setupDemoIds.appliedRun,
    status: "applied" as const,
    outcome: "complete" as const,
    pagesTotal: 6,
    pagesRead: 6,
    itemsFound: 11,
    startedAt: at("2026-11-20T15:00:00.000Z"),
    finishedAt: at("2026-11-20T15:03:00.000Z"),
  },
  {
    ...baseRun,
    id: setupDemoIds.unreachableRun,
    status: "failed" as const,
    outcome: "site-unreachable" as const,
    failureReason: "no-response",
    startedAt: at("2026-11-26T10:00:00.000Z"),
    finishedAt: at("2026-11-26T10:00:30.000Z"),
  },
  {
    id: setupDemoIds.noWebsiteRun,
    sourceKind: "description" as const,
    status: "review" as const,
    outcome: "no-website" as const,
    pagesTotal: 0,
    pagesRead: 0,
    itemsFound: 6,
    pages: [],
    startedAt: at("2026-11-26T11:00:00.000Z"),
    finishedAt: at("2026-11-26T11:00:20.000Z"),
  },
  {
    ...baseRun,
    id: setupDemoIds.foundLittleRun,
    status: "review" as const,
    outcome: "found-very-little" as const,
    pagesTotal: 1,
    pagesRead: 1,
    itemsFound: 2,
    pages: [page(0, "", "read", 2)],
    startedAt: at("2026-11-26T12:00:00.000Z"),
    finishedAt: at("2026-11-26T12:00:40.000Z"),
  },
  {
    ...baseRun,
    id: setupDemoIds.cancelledRun,
    status: "cancelled" as const,
    startedAt: at("2026-11-25T09:00:00.000Z"),
    finishedAt: at("2026-11-25T09:00:05.000Z"),
  },
];

const proposal = (
  n: number,
  category:
    "identity" | "contact" | "places" | "offerings" | "team" | "policies",
  fieldKey: string,
  label: string,
  payload: Record<string, unknown>,
  extra: Partial<{
    decision:
      "pending" | "kept" | "edited" | "skipped" | "applied" | "superseded";
    candidates: Record<string, unknown>[];
    needsCheck: boolean;
    checkNote: string;
    editedPayload: Record<string, unknown>;
    sourcePages: string[];
  }> = {},
) => {
  const decision = extra.decision ?? "pending";
  return {
    id: demoId("setup", 200 + n),
    runId: reviewRun,
    category,
    fieldKey,
    label,
    payload,
    candidates: extra.candidates ?? [],
    sourcePages: extra.sourcePages ?? ["/"],
    needsCheck: extra.needsCheck ?? false,
    ...(extra.checkNote ? { checkNote: extra.checkNote } : {}),
    decision,
    ...(extra.editedPayload ? { editedPayload: extra.editedPayload } : {}),
    ...(decision !== "pending" && decision !== "superseded"
      ? { decidedAt: at("2026-11-27T18:15:00.000Z") }
      : {}),
    ...(decision === "applied"
      ? {
          appliedAt: at("2026-11-27T18:16:00.000Z"),
          appliedEntity: {
            type: "organization_profile",
            id: demoOrganization.id,
          },
        }
      : {}),
  };
};

export const setupDemoProposals = [
  proposal(
    1,
    "identity",
    "identity.name",
    "Club name",
    { value: demoOrganization.name },
    { decision: "applied" },
  ),
  proposal(
    2,
    "identity",
    "identity.tagline",
    "Tagline",
    { value: "[club tagline]" },
    { decision: "kept" },
  ),
  proposal(
    3,
    "contact",
    "contact.phone",
    "Phone",
    { value: "+13105550142" },
    {
      needsCheck: true,
      checkNote: "Two numbers on the site: pick one",
      candidates: [{ value: "+13105550142" }, { value: "+13105550199" }],
      sourcePages: ["/contact", "footer"],
    },
  ),
  proposal(
    4,
    "contact",
    "contact.email",
    "Email",
    { value: "hello@club.example" },
    {
      decision: "edited",
      editedPayload: { value: "frontdesk@club.example" },
      sourcePages: ["/contact"],
    },
  ),
  proposal(5, "places", "places.venue", "Venue", {
    name: "[venue name]",
    courts: 8,
    litCourts: [1, 2, 3, 4, 5, 6],
  }),
  proposal(
    6,
    "places",
    "places.hours",
    "Hours",
    { summary: "Every day 8:00 AM – 9:00 PM" },
    { decision: "kept" },
  ),
  proposal(
    7,
    "offerings",
    "offerings.item",
    "Private lesson",
    {
      kind: "service/private-lesson",
      durationMinutes: 60,
      price: { amountMinor: 15000, currency: "USD" },
    },
    { sourcePages: ["/lessons"] },
  ),
  proposal(
    8,
    "offerings",
    "offerings.item",
    "Junior program",
    {
      kind: "service/program",
      note: "Ages 12–16, Saturdays",
    },
    { needsCheck: true, checkNote: "No price on the site" },
  ),
  proposal(
    9,
    "team",
    "team.invite",
    "Head coach",
    { displayName: "[coach name]", role: "coach" },
    { decision: "skipped" },
  ),
  proposal(10, "policies", "policies.cancellation", "Cancellation policy", {
    refundBeforeMinutes: 1440,
  }),
  proposal(
    11,
    "policies",
    "policies.waiver",
    "Waiver",
    { title: "[waiver title]" },
    { decision: "superseded" },
  ),
];

export const setupDemoReadiness = {
  done: 3,
  total: 9,
  bookingsOpen: false,
  sections: [
    {
      key: "identity" as const,
      label: "Identity",
      state: "complete" as const,
      href: "/setup/identity",
    },
    {
      key: "contact" as const,
      label: "Contact",
      state: "needs-attention" as const,
      note: "Pick a phone",
      href: "/setup/contact",
    },
    {
      key: "places" as const,
      label: "Places and courts",
      state: "in-progress" as const,
      note: "Courts 7–8",
      href: "/setup/places",
    },
    {
      key: "hours" as const,
      label: "Hours",
      state: "complete" as const,
      href: "/setup/hours",
    },
    {
      key: "offerings" as const,
      label: "Offerings",
      state: "in-progress" as const,
      note: "4 drafts",
      href: "/offerings",
    },
    {
      key: "team" as const,
      label: "Team",
      state: "in-progress" as const,
      note: "2 not sent",
      href: "/team",
    },
    {
      key: "policies" as const,
      label: "Policies",
      state: "not-started" as const,
      href: "/setup/policies",
    },
    {
      key: "duna-pay" as const,
      label: "Duna Pay",
      state: "not-started" as const,
      href: "/money/duna-pay",
    },
    {
      key: "website" as const,
      label: "Website",
      state: "complete" as const,
      href: "/website",
    },
  ],
};

export const setupDemo = {
  domain: "setup",
  profile: setupDemoProfile,
  runs: setupDemoRuns,
  proposals: setupDemoProposals,
  readiness: setupDemoReadiness,
} as const;
