import type {
  TrainingDrillsDetail,
  TrainingDrillsListing,
  TrainingDrillsPurchase,
  TrainingDrillsSummary,
} from "@duna/api";
import {
  resolveTrainingScene,
  type ResolvedTrainingScene,
  type TrainingSceneValidation,
  validateTrainingScene,
} from "@duna/core/training-scene";

/**
 * The drill library in words (H-TRAIN). Pure. Scenes are read only through
 * `@duna/core/training-scene` (validate, resolve): nothing here re-derives
 * a drawing.
 */

export type LibraryTab = "personal" | "club" | "duna" | "purchased" | "store";
export type Tone =
  "info" | "positive" | "warning" | "danger" | "attention" | "neutral";

export const libraryTabs: readonly {
  readonly id: LibraryTab;
  readonly label: string;
  readonly empty: string;
}[] = [
  {
    id: "personal",
    label: "Mine",
    empty: "Drills you make start here, private to you until you share them.",
  },
  {
    id: "club",
    label: "My club",
    empty: "Drills shared with the club show here for every coach.",
  },
  {
    id: "duna",
    label: "Duna",
    empty: "Duna's own drills show here.",
  },
  {
    id: "purchased",
    label: "Purchased",
    empty: "Drills your club gets from the store show here.",
  },
  {
    id: "store",
    label: "Store",
    empty: "No other club lists a drill that matches yet.",
  },
];

export function isLibraryTab(value: unknown): value is LibraryTab {
  return libraryTabs.some((tab) => tab.id === value);
}

export const scopeLabels: Record<TrainingDrillsSummary["scope"], string> = {
  personal: "Private to you",
  club: "Shared with the club",
  duna: "Duna library",
};

/** "Serve-receive · 3–6 players · 15 min · Intermediate". */
export function drillFacts(
  drill: Pick<
    TrainingDrillsSummary,
    "focus" | "players" | "durationMinutes" | "level"
  >,
): string {
  const players =
    drill.players.min === drill.players.max
      ? `${drill.players.min} players`
      : `${drill.players.min}–${drill.players.max} players`;
  return `${drill.focus} · ${players} · ${drill.durationMinutes} min · ${drill.level}`;
}

export function reviewStateCopy(state: TrainingDrillsSummary["reviewState"]): {
  readonly label: string;
  readonly tone: Tone;
} {
  switch (state) {
    case "not-submitted":
      return { label: "Not submitted", tone: "neutral" };
    case "checks-running":
      return { label: "Checks running", tone: "info" };
    case "in-review":
      return { label: "Waiting for Duna's review", tone: "info" };
    case "changes-requested":
      return { label: "Changes needed", tone: "attention" };
    case "approved":
      return { label: "Approved for the store", tone: "positive" };
    case "rejected":
      return { label: "Not accepted", tone: "neutral" };
  }
}

type Check = TrainingDrillsDetail["reviewChecks"][number];

/** Each automatic check, explained in words a coach can act on. */
export function checkWords(check: Check): {
  readonly title: string;
  readonly detail: string;
  readonly tone: Tone;
} {
  const status =
    check.status === "ok"
      ? "Passed"
      : check.status === "failed"
        ? "Failed"
        : "Waiting";
  switch (check.kind) {
    case "scene-valid":
      return {
        title: `Drawing check: ${status}`,
        tone:
          check.status === "failed"
            ? "attention"
            : check.status === "ok"
              ? "positive"
              : "info",
        detail:
          check.status === "failed"
            ? `${check.note ?? "The drawing has problems."} Fix the drawing (start again from an example or paste a corrected scene), save a new version and submit again.`
            : check.status === "ok"
              ? "The drawing is complete and every player, ball and movement checks out."
              : "Duna checks the drawing when you submit.",
      };
    case "no-personal-data":
      return {
        title: `Personal details check: ${status}`,
        tone:
          check.status === "failed"
            ? "attention"
            : check.status === "ok"
              ? "positive"
              : "info",
        detail:
          check.status === "failed"
            ? `${check.note ?? "Remove personal details."} Store drills can't carry emails, phone numbers, social handles or links to photos and videos of people.`
            : check.status === "ok"
              ? "No emails, phone numbers, handles or photo links were found."
              : "Duna looks for contact details and photo links when you submit.",
      };
    case "duna-review":
      return {
        title: `Duna review: ${status}`,
        tone:
          check.status === "failed"
            ? "attention"
            : check.status === "ok"
              ? "positive"
              : "info",
        detail:
          check.status === "ok"
            ? "Duna approved this drill for the store."
            : check.status === "failed"
              ? (check.note ?? "Duna didn't accept this version.")
              : "Waiting for a person at Duna. There is no decision yet, and nothing is listed until it is approved.",
      };
  }
}

export function listingStateCopy(status: TrainingDrillsListing["status"]): {
  readonly label: string;
  readonly tone: Tone;
} {
  switch (status) {
    case "draft":
      return { label: "Listing not sent", tone: "neutral" };
    case "pending-review":
      return { label: "Listed once approved", tone: "info" };
    case "listed":
      return { label: "In the store", tone: "positive" };
    case "delisted":
      return { label: "Taken out of the store", tone: "neutral" };
    case "rejected":
      return { label: "Listing not accepted", tone: "neutral" };
  }
}

export function moneyWords(price: {
  readonly amountMinor: number;
  readonly currency: string;
}): string {
  if (price.amountMinor === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
  }).format(price.amountMinor / 100);
}

/** What a purchase means now, honestly: paid ones wait for a checkout that doesn't exist yet. */
export function purchaseWords(purchase: TrainingDrillsPurchase): {
  readonly label: string;
  readonly detail: string;
  readonly tone: Tone;
} {
  switch (purchase.status) {
    case "complete":
      return {
        label: "In your library",
        detail: "It's in Purchased, ready to use in plans.",
        tone: "positive",
      };
    case "pending":
      return {
        label: "Waiting for payment",
        detail:
          "Paying for store drills isn't available yet, so this stays pending. Nothing was charged.",
        tone: "info",
      };
    case "refunded":
      return {
        label: "Refunded",
        detail: "The purchase was refunded.",
        tone: "neutral",
      };
    case "revoked":
      return {
        label: "Licence ended",
        detail: "This drill's licence was ended.",
        tone: "neutral",
      };
  }
}

/* ------------------------------------------------------------ scenes */

export interface SceneRead {
  readonly validation: TrainingSceneValidation;
  readonly resolved?: ResolvedTrainingScene;
}

/** Validates and resolves a scene document (the shared module, nothing else). */
export function readScene(document: unknown): SceneRead {
  return {
    validation: validateTrainingScene(document),
    resolved: resolveTrainingScene(document),
  };
}

function teaching(document: unknown): {
  readonly objective?: string;
  readonly success?: readonly string[];
} {
  if (!document || typeof document !== "object") return {};
  const value = (document as { teaching?: unknown }).teaching;
  if (!value || typeof value !== "object") return {};
  const objective = (value as { objective?: unknown }).objective;
  const success = (value as { successCriteria?: unknown }).successCriteria;
  return {
    ...(typeof objective === "string" ? { objective } : {}),
    ...(Array.isArray(success)
      ? {
          success: success.filter(
            (row): row is string => typeof row === "string",
          ),
        }
      : {}),
  };
}

const courtWords: Record<string, string> = {
  beach: "a beach court",
  "beach-half": "a beach court",
  indoor: "an indoor court",
  "indoor-half": "an indoor court",
  none: "open space",
};

/**
 * The drawing in one paragraph a new coach understands without the picture:
 * the court, who stands where (by label and side of the net), how many
 * balls, the objective.
 */
export function sceneDescription(
  resolved: ResolvedTrainingScene,
  document?: unknown,
): string {
  const court =
    courtWords[resolved.court.type] ??
    (resolved.court.noCourt ? "open space" : `a ${resolved.court.type} court`);
  const sides = {
    A: [] as string[],
    B: [] as string[],
    neutral: [] as string[],
  };
  for (const slot of resolved.slots) {
    if (slot.waiting) continue;
    sides[slot.side].push(slot.label);
  }
  const parts = [
    `${resolved.title} on ${court}${resolved.court.half ? " (half court)" : ""}.`,
    sides.A.length > 0
      ? `This side of the net: ${sides.A.join(", ")}.`
      : undefined,
    sides.B.length > 0 ? `Across the net: ${sides.B.join(", ")}.` : undefined,
    sides.neutral.length > 0
      ? `Off court: ${sides.neutral.join(", ")}.`
      : undefined,
    resolved.balls.length > 0
      ? `${resolved.balls.length} ${resolved.balls.length === 1 ? "ball" : "balls"}.`
      : undefined,
  ];
  const teach = teaching(document);
  if (teach.objective) parts.push(`Objective: ${teach.objective}`);
  return parts.filter(Boolean).join(" ");
}

/** A scene's steps as numbered captions ("1. A1 serves to P1"). */
export function sceneSteps(resolved: ResolvedTrainingScene): string[] {
  return resolved.steps.map((step) => step.caption);
}

/** The validator's issues as sentences a coach can fix. */
export function sceneIssueWords(validation: TrainingSceneValidation): string[] {
  return validation.issues
    .filter((issue) => issue.level === "error")
    .slice(0, 8)
    .map((issue) =>
      issue.repair ? `${issue.message} ${issue.repair}` : issue.message,
    );
}

/** Parses a pasted scene document: JSON only, never executed. */
export function parseSceneText(
  text: string,
):
  | { readonly ok: true; readonly document: Record<string, unknown> }
  | { readonly ok: false; readonly message: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "Paste a scene document first." };
  if (trimmed.length > 65_536) {
    return { ok: false, message: "That scene is larger than 64 KB." };
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "A scene is a JSON object ({ … })." };
    }
    return { ok: true, document: value as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      message: "That isn't valid JSON. Check for a missing comma or quote.",
    };
  }
}
