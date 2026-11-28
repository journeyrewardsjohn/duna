/**
 * Demo fixtures: website-workspace (owner: B8a). The demo club's site, its
 * page tree, one change in every status and lane, jobs and checks in every
 * state, a chat with every role, and publish / undo / restore events.
 * Shaped by `contracts/website-workspace.ts`; parsed in
 * packages/api/src/contracts/website-workspace.test.ts. Addresses are
 * example placeholders on Duna Hosting.
 */
import { demoOrganization, demoPeople, demoPlayer } from "../demo";
import { demoId } from "./ids";

const id = (n: number) => demoId("website-workspace", n);
const mara = {
  personId: demoPlayer.id,
  displayName: demoPlayer.displayName,
  initials: "ML",
};
const theo = {
  personId: demoPeople[0]!.id,
  displayName: demoPeople[0]!.displayName,
  initials: "TP",
};

export const websiteWorkspaceDemoIds = {
  site: id(1),
  draftSite: id(2),
  reviewChange: id(100),
  inProgressChange: id(101),
  publishedChange: id(106),
  latestPublish: id(300),
} as const;

export const websiteWorkspaceDemoSites = {
  sites: [
    {
      siteId: websiteWorkspaceDemoIds.site,
      name: demoOrganization.name,
      state: "live" as const,
      address: "south-bay-volleyball.duna.site",
      liveVersion: 7,
      publishedAt: "2026-11-26T18:00:00.000Z",
      publishedBy: mara,
      position: 1,
      siteLimit: 3,
      openChanges: 4,
    },
    {
      siteId: websiteWorkspaceDemoIds.draftSite,
      name: "Junior program",
      state: "draft" as const,
      position: 2,
      siteLimit: 3,
      openChanges: 0,
    },
  ],
};

type PageStatus = "draft" | "live" | "hidden" | "removed";
const page = (
  n: number,
  path: string,
  title: string,
  extra: Partial<{
    parent: number;
    managedBy: "club" | "duna";
    status: PageStatus;
    changeKind: "changed" | "new" | "removed";
  }> = {},
) => ({
  pageId: id(n),
  ...(extra.parent ? { parentPageId: id(extra.parent) } : {}),
  path,
  title,
  position: n % 10,
  managedBy: extra.managedBy ?? ("club" as const),
  status: extra.status ?? ("live" as const),
  ...(extra.changeKind ? { changeKind: extra.changeKind } : {}),
});

export const websiteWorkspaceDemoPages = {
  siteId: websiteWorkspaceDemoIds.site,
  pages: [
    page(10, "/", "Home", { changeKind: "changed" }),
    page(11, "/lessons", "Lessons", { parent: 10 }),
    page(12, "/lessons/private", "Private lessons", {
      parent: 11,
      changeKind: "changed",
    }),
    page(13, "/juniors", "Juniors", {
      parent: 10,
      status: "draft",
      changeKind: "new",
    }),
    page(14, "/book", "Book a court", { parent: 10, managedBy: "duna" }),
    page(15, "/events", "Events", { parent: 10, managedBy: "duna" }),
    page(16, "/about/history", "Our history", { parent: 10, status: "hidden" }),
    page(17, "/old-pricing", "Old pricing", {
      parent: 10,
      status: "removed",
      changeKind: "removed",
    }),
  ],
};

type Status =
  | "draft"
  | "asking"
  | "in-progress"
  | "ready-for-review"
  | "out-of-date"
  | "scheduled"
  | "published"
  | "discarded"
  | "failed"
  | "undone";
type Lane = "club-facts" | "content" | "design" | "new-capability";

const summary = (
  n: number,
  number: number,
  title: string,
  lane: Lane,
  status: Status,
  extra: Partial<{
    laneOverriddenFrom: Lane;
    jobsDone: number;
    jobsTotal: number;
    creditsReserved: number;
    creditsSpent: number;
  }> = {},
) => ({
  changeId: id(n),
  siteId: websiteWorkspaceDemoIds.site,
  number,
  title,
  lane,
  ...(extra.laneOverriddenFrom
    ? { laneOverriddenFrom: extra.laneOverriddenFrom }
    : {}),
  status,
  askedBy: mara,
  jobsDone: extra.jobsDone ?? 0,
  jobsTotal: extra.jobsTotal ?? 0,
  creditsReserved: extra.creditsReserved ?? 0,
  creditsSpent: extra.creditsSpent ?? 0,
  ...(status === "scheduled"
    ? { scheduledFor: "2026-12-01T16:00:00.000Z" }
    : {}),
  ...(status === "published" || status === "undone"
    ? { publishedAt: "2026-11-26T18:00:00.000Z" }
    : {}),
  updatedAt: "2026-11-27T18:00:00.000Z",
});

export const websiteWorkspaceDemoChangeSummaries = [
  summary(
    100,
    14,
    "New hero photo and a clearer Book button",
    "design",
    "ready-for-review",
    {
      jobsDone: 3,
      jobsTotal: 3,
      creditsReserved: 25,
      creditsSpent: 20,
    },
  ),
  summary(101, 15, "Add a Juniors page", "content", "in-progress", {
    jobsDone: 2,
    jobsTotal: 6,
    creditsReserved: 25,
  }),
  summary(
    102,
    16,
    "Private lesson price from $150 to $160",
    "club-facts",
    "draft",
  ),
  summary(103, 17, "Sibling discount for juniors", "new-capability", "asking", {
    laneOverriddenFrom: "club-facts",
  }),
  summary(104, 12, "Winter hours banner", "content", "out-of-date", {
    jobsDone: 2,
    jobsTotal: 2,
    creditsReserved: 10,
    creditsSpent: 10,
  }),
  summary(105, 13, "Holiday clinic page", "content", "scheduled", {
    jobsDone: 1,
    jobsTotal: 1,
    creditsReserved: 10,
    creditsSpent: 10,
  }),
  summary(106, 11, "Coach bios", "content", "published", {
    jobsDone: 2,
    jobsTotal: 2,
    creditsSpent: 15,
  }),
  summary(107, 10, "Dark footer", "design", "discarded", {
    jobsDone: 1,
    jobsTotal: 1,
  }),
  summary(108, 9, "Members-only gallery", "new-capability", "failed", {
    jobsDone: 1,
    jobsTotal: 3,
  }),
  summary(109, 8, "Bigger logo", "design", "undone", {
    jobsDone: 1,
    jobsTotal: 1,
    creditsSpent: 5,
  }),
];

const checks = [
  {
    kind: "build" as const,
    status: "passed" as const,
    result: {},
    summary: "Built",
    checkedAt: "2026-11-27T17:58:00.000Z",
  },
  {
    kind: "checkout-test-mode" as const,
    status: "passed" as const,
    result: { bookingsTested: 2 },
    checkedAt: "2026-11-27T17:58:00.000Z",
  },
  {
    kind: "links" as const,
    status: "passed" as const,
    result: { linksChecked: 212, brokenLinks: 0 },
    summary: "0 broken of 212",
    checkedAt: "2026-11-27T17:58:00.000Z",
  },
  {
    kind: "phone-layout" as const,
    status: "warning" as const,
    result: { pagesWithOverflow: 1 },
    summary: "One wide table on Lessons",
    checkedAt: "2026-11-27T17:58:00.000Z",
  },
  {
    kind: "accessibility" as const,
    status: "failed" as const,
    result: { issues: 1 },
    summary: "Hero photo needs a description",
    checkedAt: "2026-11-27T17:58:00.000Z",
  },
  { kind: "speed" as const, status: "running" as const, result: {} },
  { kind: "pages-changed" as const, status: "pending" as const, result: {} },
  {
    kind: "duna-areas-untouched" as const,
    status: "passed" as const,
    result: {},
    summary: "Booking and checkout unchanged",
    checkedAt: "2026-11-27T17:58:00.000Z",
  },
];

const reviewDetail = {
  ...websiteWorkspaceDemoChangeSummaries[0]!,
  requestText:
    "Use the sunset photo at the top and make Book a court stand out.",
  previewUrl: "https://preview-14.south-bay-volleyball.duna.site",
  behindLive: false,
  pages: [
    { pageId: id(10), path: "/", title: "Home", kind: "changed" as const },
    {
      pageId: id(13),
      path: "/juniors",
      title: "Juniors",
      kind: "new" as const,
    },
    {
      pageId: id(17),
      path: "/old-pricing",
      title: "Old pricing",
      kind: "removed" as const,
    },
  ],
  jobs: [
    {
      jobId: id(200),
      sequence: 0,
      title: "Pick and crop the photo",
      status: "done" as const,
      startedAt: "2026-11-27T17:50:00.000Z",
      finishedAt: "2026-11-27T17:52:00.000Z",
    },
    {
      jobId: id(201),
      sequence: 1,
      title: "Restyle the Book button",
      status: "done" as const,
      startedAt: "2026-11-27T17:52:00.000Z",
      finishedAt: "2026-11-27T17:55:00.000Z",
    },
    {
      jobId: id(202),
      sequence: 2,
      title: "Run the checks",
      status: "done" as const,
      startedAt: "2026-11-27T17:55:00.000Z",
      finishedAt: "2026-11-27T17:58:00.000Z",
    },
  ],
  checks,
  messages: [
    {
      messageId: id(400),
      role: "person" as const,
      author: mara,
      body: "Use the sunset photo at the top.",
      createdAt: "2026-11-27T17:49:00.000Z",
    },
    {
      messageId: id(401),
      role: "duna" as const,
      body: "Done. The preview is ready for you to review.",
      createdAt: "2026-11-27T17:58:30.000Z",
    },
    {
      messageId: id(402),
      role: "system" as const,
      body: "20 of 25 reserved credits used.",
      createdAt: "2026-11-27T17:58:31.000Z",
    },
  ],
  publishableBy: ["owner", "manager"],
};

const inProgressDetail = {
  ...websiteWorkspaceDemoChangeSummaries[1]!,
  requestText: "Add a page for our junior program with ages and times.",
  behindLive: false,
  pages: [
    {
      pageId: id(13),
      path: "/juniors",
      title: "Juniors",
      kind: "new" as const,
    },
  ],
  jobs: [
    {
      jobId: id(210),
      sequence: 0,
      title: "Draft the page",
      status: "done" as const,
    },
    {
      jobId: id(211),
      sequence: 1,
      title: "Add it to the menu",
      status: "done" as const,
    },
    {
      jobId: id(212),
      sequence: 2,
      title: "Write the age groups",
      status: "working" as const,
      startedAt: "2026-11-27T18:00:00.000Z",
    },
    {
      jobId: id(213),
      sequence: 3,
      title: "Choose photos",
      status: "needs-you" as const,
      question: "Can we use photos of juniors, or keep it to courts only?",
    },
    {
      jobId: id(214),
      sequence: 4,
      title: "Run the checks",
      status: "queued" as const,
    },
    {
      jobId: id(215),
      sequence: 5,
      title: "Translate to Spanish",
      status: "cancelled" as const,
    },
  ],
  checks: [],
  messages: [],
  publishableBy: ["owner", "manager"],
};

const factDetail = {
  ...websiteWorkspaceDemoChangeSummaries[2]!,
  requestText: "Private lessons are $160 from January.",
  behindLive: false,
  pages: [],
  jobs: [],
  checks: [],
  messages: [],
  factProposal: {
    entityType: "catalog_item",
    entityId: id(900),
    field: "price",
    before: { amountMinor: 15000, currency: "USD" },
    after: { amountMinor: 16000, currency: "USD" },
    effectiveFrom: "2027-01-01",
  },
  publishableBy: ["owner"],
};

const capabilityDetail = {
  ...websiteWorkspaceDemoChangeSummaries[3]!,
  requestText: "Give families 10% off the second junior.",
  behindLive: false,
  pages: [],
  jobs: [],
  checks: [],
  messages: [
    {
      messageId: id(410),
      role: "duna" as const,
      body: "Question 1 of 2: does the discount apply to camps too?",
      createdAt: "2026-11-27T18:05:00.000Z",
    },
  ],
  capabilityPlan: {
    summary: "A sibling discount at checkout for junior programs.",
    prerequisites: [
      { label: "Duna Pay is on", met: false },
      { label: "Member accounts needed", met: true },
    ],
    storedDataImpact:
      "Stores which juniors share a household; no new payment data.",
  },
  publishableBy: ["owner"],
};

const failedDetail = {
  ...websiteWorkspaceDemoChangeSummaries[8]!,
  requestText: "A gallery only members can see.",
  behindLive: false,
  pages: [],
  jobs: [
    {
      jobId: id(220),
      sequence: 0,
      title: "Plan the gallery",
      status: "done" as const,
    },
    {
      jobId: id(221),
      sequence: 1,
      title: "Build the members check",
      status: "failed" as const,
      errorCode: "build-failed",
    },
  ],
  checks: [],
  messages: [],
  publishableBy: ["owner"],
};

const plainDetail = (summaryIndex: number, behindLive = false) => ({
  ...websiteWorkspaceDemoChangeSummaries[summaryIndex]!,
  requestText: websiteWorkspaceDemoChangeSummaries[summaryIndex]!.title,
  behindLive,
  pages: [],
  jobs: [],
  checks: [],
  messages: [],
  publishableBy: ["owner", "manager"],
});

export const websiteWorkspaceDemoChanges = [
  reviewDetail,
  inProgressDetail,
  factDetail,
  capabilityDetail,
  plainDetail(4, true),
  plainDetail(5),
  plainDetail(6),
  plainDetail(7),
  failedDetail,
  plainDetail(9),
];

export const websiteWorkspaceDemoVersions = {
  siteId: websiteWorkspaceDemoIds.site,
  events: [
    {
      eventId: websiteWorkspaceDemoIds.latestPublish,
      siteId: websiteWorkspaceDemoIds.site,
      kind: "restore" as const,
      version: 7,
      reversesEventId: id(301),
      actor: mara,
      occurredAt: "2026-11-26T18:00:00.000Z",
      liveNow: true,
    },
    {
      eventId: id(301),
      siteId: websiteWorkspaceDemoIds.site,
      kind: "undo" as const,
      version: 6,
      changeId: id(109),
      changeNumber: 8,
      reversesEventId: id(302),
      actor: theo,
      occurredAt: "2026-11-25T18:00:00.000Z",
      liveNow: false,
    },
    {
      eventId: id(302),
      siteId: websiteWorkspaceDemoIds.site,
      kind: "publish" as const,
      version: 5,
      changeId: id(109),
      changeNumber: 8,
      actor: mara,
      occurredAt: "2026-11-24T18:00:00.000Z",
      liveNow: false,
    },
  ],
};

export const websiteWorkspaceDemo = {
  domain: "website-workspace",
  sites: websiteWorkspaceDemoSites,
  pages: websiteWorkspaceDemoPages,
  changes: websiteWorkspaceDemoChanges,
  versions: websiteWorkspaceDemoVersions,
} as const;
