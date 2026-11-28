/**
 * Demo fixtures: training-drills (owners: B5, B6a). A library across every
 * scope and review state, scenes in every validation state and source,
 * listings in every status and pricing, and purchases in every status.
 * Shaped by `contracts/training-drills.ts`; parsed in
 * packages/api/src/contracts/training-drills.test.ts. Drill names and
 * creators are placeholders for the fictional demo club.
 */
import { demoOrganization, demoPeople, demoPlayer } from "../demo";
import { trainingSceneExamples } from "../training-scene";
import { demoId } from "./ids";

const id = (n: number) => demoId("training-drills", n);
const UPDATED = "2026-11-27T18:00:00.000Z";
const author = {
  personId: demoPeople[0]!.id,
  displayName: demoPeople[0]!.displayName,
};
const mara = { personId: demoPlayer.id, displayName: demoPlayer.displayName };
/** A fictional other club that sells drills in the store. */
const otherClubId = id(900);

type ReviewState =
  | "not-submitted"
  | "checks-running"
  | "in-review"
  | "changes-requested"
  | "approved"
  | "rejected";

const drill = (
  n: number,
  slug: string,
  title: string,
  scope: "personal" | "club" | "duna",
  status: "draft" | "review" | "published" | "archived",
  reviewState: ReviewState,
  extra: Record<string, unknown> = {},
) => ({
  id: id(n),
  slug,
  title,
  scope,
  purchased: false,
  status,
  reviewState,
  focus: "Serve-receive",
  players: { min: 3, max: 6, recommended: 4 },
  durationMinutes: 15,
  level: "Intermediate",
  equipment: ["Balls", "Cones"],
  load: 55,
  touches: 120,
  jumps: 10,
  author,
  version: 1,
  usedInPlans: 0,
  updatedAt: UPDATED,
  ...extra,
});

export const trainingDrillsDemoIds = {
  servingDrill: id(1),
  personalDrill: id(2),
  dunaDrill: id(3),
  checksDrill: id(4),
  reviewDrill: id(5),
  changesDrill: id(6),
  rejectedDrill: id(7),
  purchasedDrill: id(8),
  servingVersion: id(13),
} as const;

export const trainingDrillsDemoSummaries = [
  drill(
    1,
    "serve-receive-triangle",
    "Serve-receive triangle",
    "club",
    "published",
    "approved",
    { version: 3, usedInPlans: 4 },
  ),
  drill(
    2,
    "poke-and-recover",
    "Poke and recover",
    "personal",
    "draft",
    "not-submitted",
    { author: mara, focus: "Defence" },
  ),
  drill(
    3,
    "warm-up-ladder",
    "Warm-up ladder",
    "duna",
    "published",
    "approved",
    {
      sourceLabel: "Duna library",
      focus: "Warm-up",
      load: 25,
      touches: 40,
      jumps: 5,
    },
  ),
  drill(
    4,
    "transition-hustle",
    "Transition hustle",
    "club",
    "draft",
    "checks-running",
    { focus: "Transition" },
  ),
  drill(
    5,
    "setter-footwork",
    "Setter footwork",
    "club",
    "review",
    "in-review",
    { focus: "Setting", version: 2 },
  ),
  drill(6, "block-move", "Block move", "club", "draft", "changes-requested", {
    focus: "Blocking",
    jumps: 40,
  }),
  drill(7, "old-pepper", "Old pepper", "club", "archived", "rejected", {
    focus: "Ball control",
  }),
  drill(
    8,
    "pressure-serving",
    "Pressure serving",
    "club",
    "published",
    "approved",
    {
      purchased: true,
      sourceLabel: "[selling club]",
      author: undefined,
      focus: "Serving",
    },
  ),
  ...(
    [
      ["partner-pepper", "Partner pepper", "club", "Ball control", 2, 8],
      [
        "serving-deep-targets",
        "Serving to deep targets",
        "club",
        "Serving",
        4,
        10,
      ],
      ["dig-to-transition", "Dig to transition", "club", "Defence", 3, 12],
      ["king-of-the-court", "King of the court", "club", "Games", 6, 20],
      [
        "indoor-receive-outside",
        "Receive to outside attack",
        "club",
        "Serve-receive",
        6,
        15,
      ],
      ["short-serve-ladder", "Short serve ladder", "club", "Serving", 2, 10],
      ["line-shot-reads", "Line shot reads", "club", "Defence", 3, 12],
      ["setter-dump-drill", "Setter dump", "club", "Setting", 3, 10],
      ["block-and-pull", "Block and pull", "club", "Blocking", 2, 15],
      ["cut-shot-corners", "Cut shot corners", "club", "Attacking", 2, 12],
      ["freeball-to-kill", "Free ball to kill", "club", "Transition", 4, 15],
      ["wash-drill", "Wash drill", "club", "Games", 8, 20],
      ["hand-set-ladder", "Hand-set ladder", "personal", "Setting", 1, 8],
      ["serve-and-cover", "Serve and cover", "personal", "Serving", 2, 10],
      ["two-ball-pepper", "Two-ball pepper", "personal", "Ball control", 3, 8],
      ["sand-footwork", "Sand footwork circuit", "duna", "Warm-up", 1, 10],
      [
        "jump-landing-basics",
        "Jump-landing basics",
        "duna",
        "Conditioning",
        1,
        8,
      ],
      ["shoulder-prep", "Shoulder prep", "duna", "Warm-up", 1, 6],
      ["queen-of-the-court", "Queen of the court", "duna", "Games", 6, 20],
      ["deep-dish-defence", "Deep dish defence", "duna", "Defence", 2, 12],
      [
        "option-attack-reads",
        "Option attack reads",
        "duna",
        "Attacking",
        2,
        12,
      ],
      ["cool-down-mobility", "Cool-down mobility", "duna", "Cool-down", 1, 8],
    ] as const
  ).map(([slug, title, scope, focus, min, minutes], index) =>
    drill(
      101 + index,
      slug,
      title,
      scope,
      scope === "personal" ? "draft" : "published",
      scope === "duna" ? "approved" : "not-submitted",
      {
        focus,
        players: { min, max: Math.max(min, min * 2), recommended: min },
        durationMinutes: minutes,
        load: 30 + ((index * 7) % 50),
        touches: 20 + index * 11,
        jumps: (index * 5) % 40,
        ...(scope === "duna"
          ? { sourceLabel: "Duna library", author: undefined }
          : scope === "personal"
            ? { author: mara }
            : {}),
        usedInPlans: index % 3,
      },
    ),
  ),
].map(({ author: drillAuthor, ...rest }) =>
  drillAuthor ? { ...rest, author: drillAuthor } : rest,
);

/** Example scenes from the drill studio; the invalid one names a missing spot. */
function sceneDocument(
  n: number,
  validationStatus: "unchecked" | "valid" | "invalid",
): Record<string, unknown> {
  const base = trainingSceneExamples[n % trainingSceneExamples.length]!;
  if (validationStatus !== "invalid") return { ...base };
  const slots = (base.slots as readonly Record<string, unknown>[]).map(
    (slot, index) =>
      index === 0 ? { ...slot, spot: "outside-the-antenna" } : slot,
  );
  return { ...base, slots };
}

const scene = (
  n: number,
  drillVersionId: string,
  validationStatus: "unchecked" | "valid" | "invalid",
  source: "coach" | "ai" | "converted",
) => ({
  id: id(n),
  drillVersionId,
  modelVersion: 2,
  /** A real v2 scene (`@duna/core/training-scene`), so players can render it. */
  document: sceneDocument(n, validationStatus),
  derived:
    validationStatus === "unchecked"
      ? {}
      : {
          touchesPerRep: 3,
          jumpsPerRep: 0.5,
          metresPerPlayer: 313,
          workRestRatio: "1:1.5",
        },
  validationStatus,
  validationIssues:
    validationStatus === "invalid"
      ? [
          {
            rule: "ref-spot",
            message: 'Unknown spot "outside-the-antenna".',
          },
        ]
      : [],
  ...(validationStatus === "unchecked"
    ? {}
    : { validatorVersion: "2.0.0", validatedAt: UPDATED }),
  source,
  hasPinnedEdits: source === "ai",
});

export const trainingDrillsDemoScenes = [
  scene(40, id(13), "valid", "coach"),
  scene(41, id(20), "invalid", "ai"),
  scene(42, id(30), "valid", "converted"),
  scene(43, id(31), "unchecked", "coach"),
  scene(44, id(32), "valid", "coach"),
  scene(45, id(33), "valid", "converted"),
];

const listing = (
  n: number,
  drillId: string,
  drillVersionId: string,
  status: "draft" | "pending-review" | "listed" | "delisted" | "rejected",
  pricing: "free" | "paid",
  amountMinor: number,
  sellerOrganization = true,
) => ({
  id: id(n),
  drillId,
  drillVersionId,
  status,
  pricing,
  price: { amountMinor, currency: "USD" as const },
  licenseTerms: "[licence terms]",
  listedAs: sellerOrganization ? demoOrganization.name : demoPlayer.displayName,
  seller: sellerOrganization
    ? {
        kind: "organization" as const,
        id: demoOrganization.id,
        displayName: demoOrganization.name,
      }
    : {
        kind: "person" as const,
        id: demoPlayer.id,
        displayName: demoPlayer.displayName,
      },
  marketplaceFeeBps: pricing === "paid" ? 1500 : 0,
  ...(status === "listed" || status === "delisted"
    ? { listedAt: UPDATED }
    : {}),
  ...(status === "delisted" ? { delistedAt: UPDATED } : {}),
});

export const trainingDrillsDemoListings = [
  listing(60, id(1), id(13), "listed", "paid", 800),
  listing(61, id(4), id(31), "draft", "free", 0),
  listing(62, id(5), id(32), "pending-review", "paid", 500, false),
  listing(63, id(6), id(33), "rejected", "free", 0),
  listing(64, id(7), id(34), "delisted", "paid", 500),
];

/** What another club lists publicly (the store shows other clubs' drills). */
export const trainingDrillsDemoStore = [
  {
    listing: {
      ...listing(65, id(8), id(35), "listed", "paid", 600),
      seller: {
        kind: "organization" as const,
        id: otherClubId,
        displayName: "[selling club]",
      },
      listedAs: "[selling club]",
    },
    drill: trainingDrillsDemoSummaries[7]!,
  },
  {
    listing: {
      ...listing(66, id(3), id(30), "listed", "free", 0),
      seller: {
        kind: "organization" as const,
        id: otherClubId,
        displayName: "[selling club]",
      },
      listedAs: "[selling club]",
    },
    drill: trainingDrillsDemoSummaries[2]!,
  },
];

const purchase = (
  n: number,
  listingId: string,
  drillId: string,
  status: "pending" | "complete" | "refunded" | "revoked",
  amountMinor: number,
) => ({
  id: id(n),
  listingId,
  drillId,
  status,
  price: { amountMinor, currency: "USD" as const },
  buyer: { kind: "organization" as const, id: demoOrganization.id },
  checkoutRequired: status === "pending" && amountMinor > 0,
  ...(status !== "pending" && amountMinor > 0 ? { orderId: id(n + 100) } : {}),
  ...(status === "complete" && amountMinor > 0
    ? { licenseId: id(n + 200) }
    : {}),
  ...(status === "pending" ? {} : { completedAt: UPDATED }),
});

export const trainingDrillsDemoPurchases = [
  purchase(80, id(65), id(8), "complete", 600),
  purchase(81, id(66), id(3), "complete", 0),
  purchase(82, id(65), id(8), "pending", 600),
  purchase(83, id(65), id(8), "refunded", 600),
  purchase(84, id(65), id(8), "revoked", 600),
];

export const trainingDrillsDemoDetail = {
  ...trainingDrillsDemoSummaries[0]!,
  summary: "Three passers rotate after five serves.",
  purpose: "First-contact quality under a served ball.",
  targetAudience: "Intermediate juniors and adults",
  descriptionMarkdown: "[drill description]",
  coachingCues: ["Platform early", "Talk before the serve"],
  rotationRule: "After 5 serves, rotate one spot clockwise.",
  successCriteria: "3 of 5 passes to target",
  currentVersionId: id(13),
  versions: [
    {
      id: id(11),
      version: 1,
      createdBy: author,
      createdAt: "2026-10-01T18:00:00.000Z",
    },
    {
      id: id(12),
      version: 2,
      changeNote: "Added rotation rule",
      createdBy: author,
      createdAt: "2026-11-01T18:00:00.000Z",
    },
    {
      id: id(13),
      version: 3,
      changeNote: "Scene redrawn",
      createdBy: author,
      createdAt: UPDATED,
    },
  ],
  scene: trainingDrillsDemoScenes[0]!,
  reviewChecks: [
    { kind: "scene-valid" as const, status: "ok" as const, decidedAt: UPDATED },
    {
      kind: "no-personal-data" as const,
      status: "ok" as const,
      decidedAt: UPDATED,
    },
    { kind: "duna-review" as const, status: "ok" as const, decidedAt: UPDATED },
  ],
  listing: trainingDrillsDemoListings[0]!,
};

/** The drill in review: one check waiting, one failed. */
export const trainingDrillsDemoReviewChecks = [
  {
    kind: "scene-valid" as const,
    status: "failed" as const,
    note: "The serve passes outside the antenna.",
  },
  {
    kind: "no-personal-data" as const,
    status: "ok" as const,
    decidedAt: UPDATED,
  },
  { kind: "duna-review" as const, status: "waiting" as const },
];

export const trainingDrillsDemo = {
  domain: "training-drills",
  summaries: trainingDrillsDemoSummaries,
  detail: trainingDrillsDemoDetail,
  scenes: trainingDrillsDemoScenes,
  reviewChecks: trainingDrillsDemoReviewChecks,
  listings: trainingDrillsDemoListings,
  store: trainingDrillsDemoStore,
  purchases: trainingDrillsDemoPurchases,
} as const;
