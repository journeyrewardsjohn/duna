/**
 * Club setup's pure logic (H-SETUP): how proposals group on the review
 * screen, what each run state and failure says and what the person can do
 * next, the ordered prerequisite list on the setup home, what an apply will
 * write, where each applied thing lives, and where a profile field's value
 * came from. No React, no server: unit-tested in setup-model.test.ts.
 *
 * Copy rules: never say a fact is confirmed until a person kept it; never
 * name the reader or model providers; prices are drafts, nobody is invited.
 */
import type {
  SetupProfile,
  SetupProposal,
  SetupReadiness,
  SetupRun,
} from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { foregroundFor, parseHexColor } from "@duna/tideline-core";

// ---------------------------------------------------------------------------
// Review groups
// ---------------------------------------------------------------------------

export const reviewGroupKeys = [
  "identity",
  "contact",
  "places",
  "offerings",
  "team",
  "policies",
] as const;
export type ReviewGroupKey = (typeof reviewGroupKeys)[number];

export const reviewGroupLabels: Readonly<Record<ReviewGroupKey, string>> = {
  identity: "Identity and brand",
  contact: "Contact and hours",
  places: "Places and courts",
  offerings: "Offerings and prices",
  team: "Team",
  policies: "Policies",
};

/** The review group a proposal shows in. Hours sit with contact, not places. */
export function reviewGroupOf(
  proposal: Pick<SetupProposal, "category" | "fieldKey">,
): ReviewGroupKey {
  if (proposal.fieldKey === "places.hours") return "contact";
  return proposal.category;
}

export interface ReviewGroup {
  readonly key: ReviewGroupKey;
  readonly label: string;
  readonly proposals: readonly SetupProposal[];
  /** Waiting for Keep, Edit or Skip. */
  readonly pending: number;
  /** Kept or edited, not applied yet. */
  readonly accepted: number;
  readonly applied: number;
  readonly skipped: number;
  /** Pending items "Keep all" leaves for the person, with why. */
  readonly held: readonly { readonly id: string; readonly why: string }[];
}

/** The group's state in a few words: "2 to decide", "3 kept", "1 added". */
export function groupCountText(
  group: Pick<ReviewGroup, "pending" | "accepted" | "applied" | "skipped">,
): string {
  if (group.pending > 0) return `${group.pending} to decide`;
  const parts = [
    group.applied ? `${group.applied} added` : undefined,
    group.accepted ? `${group.accepted} kept` : undefined,
    group.skipped ? `${group.skipped} skipped` : undefined,
  ].filter(Boolean);
  return parts.join(" · ") || "Nothing to decide";
}

/** Superseded proposals (an older read's leftovers) never show. */
export function visibleProposals(
  proposals: readonly SetupProposal[],
): SetupProposal[] {
  return proposals.filter((proposal) => proposal.decision !== "superseded");
}

/** Why "Keep all" leaves a pending proposal for the person, or undefined. */
export function holdReason(proposal: SetupProposal): string | undefined {
  if (proposal.decision !== "pending") return undefined;
  if (proposal.candidates.length > 1) {
    return "Your website shows more than one value: pick one yourself.";
  }
  return undefined;
}

/** Proposals in review order: groups in order, each group's items as found. */
export function groupProposals(
  proposals: readonly SetupProposal[],
): ReviewGroup[] {
  const visible = visibleProposals(proposals);
  return reviewGroupKeys
    .map((key) => {
      const items = visible.filter((p) => reviewGroupOf(p) === key);
      return {
        key,
        label: reviewGroupLabels[key],
        proposals: items,
        pending: items.filter((p) => p.decision === "pending").length,
        accepted: items.filter(
          (p) => p.decision === "kept" || p.decision === "edited",
        ).length,
        applied: items.filter((p) => p.decision === "applied").length,
        skipped: items.filter((p) => p.decision === "skipped").length,
        held: items.flatMap((p) => {
          const why = holdReason(p);
          return why ? [{ id: p.id, why }] : [];
        }),
      };
    })
    .filter((group) => group.proposals.length > 0);
}

/** The words for a proposal's decision. Pending is never "confirmed". */
export function decisionLabel(decision: SetupProposal["decision"]): {
  readonly text: string;
  readonly tone?: "positive" | "info";
} {
  switch (decision) {
    case "pending":
      return { text: "Proposed" };
    case "kept":
      return { text: "You kept this", tone: "info" };
    case "edited":
      return { text: "You edited this", tone: "info" };
    case "skipped":
      return { text: "Skipped" };
    case "applied":
      return { text: "Added to your club", tone: "positive" };
    case "superseded":
      return { text: "Replaced by a newer read" };
  }
}

// ---------------------------------------------------------------------------
// Proposal values
// ---------------------------------------------------------------------------

/** Keys of a payload that describe the proposal, not the value. */
const metaKeys = new Set([
  "confidence",
  "quotes",
  "before",
  "contrast",
  "status",
  "mergeKey",
  "geocoded",
]);

/** The value a person keeps or edits: the payload without its description. */
export function proposalValue(
  proposal: Pick<SetupProposal, "payload" | "editedPayload">,
): Record<string, unknown> {
  const source = proposal.editedPayload ?? proposal.payload;
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !metaKeys.has(key)),
  );
}

export interface ProposalQuote {
  readonly page: string;
  readonly text: string;
}

/** Where a proposal came from: the quoted words with their page. */
export function proposalQuotes(proposal: SetupProposal): ProposalQuote[] {
  const quotes = proposal.payload.quotes;
  if (Array.isArray(quotes)) {
    return quotes.flatMap((quote) => {
      const page = (quote as { page?: unknown }).page;
      const text = (quote as { text?: unknown }).text;
      return typeof page === "string" && typeof text === "string"
        ? [{ page, text }]
        : [];
    });
  }
  return [];
}

/** Stated (written on the page) or inferred (Duna's reading of it). */
export function proposalConfidence(
  proposal: SetupProposal,
): "stated" | "inferred" {
  if (proposal.payload.confidence === "inferred") return "inferred";
  if (proposal.fieldKey.startsWith("policies.")) return "inferred";
  return "stated";
}

/** "Contact page", "Home page", "Site footer". */
export function pageName(path: string): string {
  if (path === "/" || path === "") return "Home page";
  if (path === "footer") return "Site footer";
  const last = path.replace(/\/$/, "").split("/").filter(Boolean).at(-1) ?? "";
  if (!last) return "Home page";
  const words = decodeURIComponent(last).replace(/[-_]+/g, " ").trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} page`;
}

const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "8:00 AM" from "08:00". */
export function clockTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${minute} ${suffix}`;
}

export interface HoursWindow {
  readonly weekday: number;
  readonly opens: string;
  readonly closes: string;
}

/** "Mon–Fri 8:00 AM – 9:00 PM · Sat 9:00 AM – 5:00 PM". */
export function hoursSummary(weekly: readonly HoursWindow[]): string {
  if (weekly.length === 0) return "No opening hours yet";
  const sorted = [...weekly].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7),
  );
  const runs: { from: number; to: number; key: string; w: HoursWindow }[] = [];
  for (const window of sorted) {
    const key = `${window.opens}-${window.closes}`;
    const last = runs.at(-1);
    const day = (window.weekday + 6) % 7;
    if (last && last.key === key && (last.to + 1) % 7 === day) {
      last.to = day;
    } else {
      runs.push({ from: day, to: day, key, w: window });
    }
  }
  if (runs.length === 1 && sorted.length === 7) {
    return `Every day ${clockTime(runs[0]!.w.opens)} – ${clockTime(runs[0]!.w.closes)}`;
  }
  const name = (mondayIndex: number) => weekdayShort[(mondayIndex + 1) % 7]!;
  return runs
    .map(
      (run) =>
        `${run.from === run.to ? name(run.from) : `${name(run.from)}–${name(run.to)}`} ${clockTime(run.w.opens)} – ${clockTime(run.w.closes)}`,
    )
    .join(" · ");
}

/** A price as the person reads it: "$150.00 per hour". */
export function priceText(price: unknown): string | undefined {
  if (!price || typeof price !== "object") return undefined;
  const { amountMinor, currency, per } = price as {
    amountMinor?: unknown;
    currency?: unknown;
    per?: unknown;
  };
  if (typeof amountMinor !== "number" || typeof currency !== "string") {
    return undefined;
  }
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
  return typeof per === "string" && per ? `${amount} per ${per}` : amount;
}

const sportWords: Readonly<Record<string, string>> = {
  beach: "Beach volleyball",
  indoor: "Indoor volleyball",
};

const offeringKindWords: Readonly<Record<string, string>> = {
  "service/private-lesson": "Private lesson",
  "service/group-lesson": "Group lesson",
  "service/program": "Program",
  "event/clinic": "Clinic",
  "event/league": "League",
  "event/open-play": "Open play",
  "service/court-rental": "Court rental",
  "plan/membership": "Membership",
  "event/tournament": "Tournament",
  "service/other": "Offering",
};

export const offeringKindOptions = Object.entries(offeringKindWords).map(
  ([value, label]) => ({ value, label }),
);

export const staffRoleOptions = [
  { value: "coach", label: "Coach" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "front-desk", label: "Front desk" },
] as const;

/** "1 day before", "24 hours before", "2 hours before". */
export function noticeText(minutes: unknown): string | undefined {
  if (typeof minutes !== "number") return undefined;
  if (minutes % 1440 === 0 && minutes >= 1440) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? "" : "s"} before`;
}

/** One proposal value as a short line of plain words. */
export function valueText(
  fieldKey: string,
  value: Readonly<Record<string, unknown>>,
  label?: string,
): string {
  const str = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : undefined;
  switch (fieldKey) {
    case "identity.name":
    case "identity.tagline":
    case "identity.about":
    case "contact.email":
      return str("value") ?? "";
    case "contact.phone":
      return str("written") ?? str("value") ?? "";
    case "identity.sports": {
      const values = Array.isArray(value.values)
        ? (value.values as string[])
        : [];
      return values.map((v) => sportWords[v] ?? v).join(" and ");
    }
    case "identity.logo":
      return str("url") ?? "";
    case "identity.colors":
      return [str("primary"), str("accent")].filter(Boolean).join(" and ");
    case "contact.social":
      return str("url") ?? "";
    case "places.hours":
      return Array.isArray(value.weekly)
        ? hoursSummary(value.weekly as HoursWindow[])
        : (str("summary") ?? "");
    case "places.venue": {
      const courts =
        typeof value.courtCount === "number"
          ? value.courtCount
          : typeof value.courts === "number"
            ? value.courts
            : undefined;
      const parts = [
        str("name") ?? label,
        str("addressText"),
        courts !== undefined
          ? `${courts} court${courts === 1 ? "" : "s"}`
          : undefined,
        str("surface"),
        str("environment"),
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "offerings.item": {
      const kind = str("kind");
      const title = str("title") ?? label;
      const kindWord = kind ? offeringKindWords[kind] : undefined;
      const parts = [
        title,
        kindWord && kindWord !== title ? kindWord : undefined,
        typeof value.durationMinutes === "number"
          ? `${value.durationMinutes} min`
          : undefined,
        priceText(value.price) ?? "No price yet",
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "team.member":
    case "team.invite": {
      const role = str("role");
      const roleLabel =
        staffRoleOptions.find((option) => option.value === role)?.label ?? role;
      return [str("displayName"), str("title") ?? roleLabel]
        .filter(Boolean)
        .join(" · ");
    }
    default: {
      if (fieldKey.startsWith("policies.")) {
        return [
          str("summary") ?? str("title"),
          noticeText(value.refundBeforeMinutes),
        ]
          .filter(Boolean)
          .join(" · ");
      }
      const primary = value.value ?? value.url ?? value.summary;
      return typeof primary === "string" ? primary : "";
    }
  }
}

// ---------------------------------------------------------------------------
// Editing: one form, two drivers
// ---------------------------------------------------------------------------

export type EditFieldKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "color"
  | "money"
  | "select"
  | "sports"
  | "hours";

export interface EditField {
  readonly key: string;
  readonly label: string;
  readonly kind: EditFieldKind;
  readonly hint?: string;
  readonly optional?: boolean;
  readonly options?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

const socialOptions = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
  "other",
].map((value) => ({
  value,
  label: value === "x" ? "X" : `${value[0]!.toUpperCase()}${value.slice(1)}`,
}));

/** The fields the edit form shows for a proposal: the same form a person fills. */
export function editFields(fieldKey: string): readonly EditField[] {
  switch (fieldKey) {
    case "identity.name":
      return [{ key: "value", label: "Club name", kind: "text" }];
    case "identity.tagline":
      return [{ key: "value", label: "Tagline", kind: "text" }];
    case "identity.about":
      return [{ key: "value", label: "About the club", kind: "textarea" }];
    case "identity.sports":
      return [{ key: "values", label: "Sports", kind: "sports" }];
    case "identity.logo":
      return [{ key: "url", label: "Logo address", kind: "url" }];
    case "identity.colors":
      return [
        { key: "primary", label: "Club colour", kind: "color" },
        {
          key: "accent",
          label: "Second colour",
          kind: "color",
          optional: true,
        },
      ];
    case "contact.phone":
      return [
        {
          key: "value",
          label: "Phone",
          kind: "tel",
          hint: "With the country code outside North America.",
        },
      ];
    case "contact.email":
      return [{ key: "value", label: "Email", kind: "email" }];
    case "contact.social":
      return [
        {
          key: "network",
          label: "Network",
          kind: "select",
          options: socialOptions,
        },
        { key: "url", label: "Address", kind: "url" },
      ];
    case "places.hours":
      return [{ key: "weekly", label: "Opening hours", kind: "hours" }];
    case "places.venue":
      return [
        { key: "name", label: "Place name", kind: "text" },
        { key: "address.line1", label: "Street", kind: "text", optional: true },
        {
          key: "address.locality",
          label: "City",
          kind: "text",
          optional: true,
        },
        {
          key: "address.administrativeArea",
          label: "State or region",
          kind: "text",
          optional: true,
        },
        {
          key: "address.postalCode",
          label: "Postcode",
          kind: "text",
          optional: true,
        },
        {
          key: "courtCount",
          label: "Courts",
          kind: "number",
          optional: true,
          hint: "Courts are added as drafts; none are ever removed.",
        },
        {
          key: "environment",
          label: "Indoor or outdoor",
          kind: "select",
          optional: true,
          options: [
            { value: "outdoor", label: "Outdoor" },
            { value: "indoor", label: "Indoor" },
          ],
        },
        {
          key: "surface",
          label: "Surface",
          kind: "select",
          optional: true,
          options: [
            { value: "sand", label: "Sand" },
            { value: "grass", label: "Grass" },
            { value: "hard", label: "Hard court" },
            { value: "wood", label: "Wood" },
            { value: "synthetic", label: "Synthetic" },
          ],
        },
      ];
    case "offerings.item":
      return [
        { key: "title", label: "Name", kind: "text" },
        {
          key: "kind",
          label: "Kind",
          kind: "select",
          options: offeringKindOptions,
        },
        {
          key: "durationMinutes",
          label: "Length in minutes",
          kind: "number",
          optional: true,
        },
        {
          key: "price",
          label: "Price",
          kind: "money",
          optional: true,
          hint: "Saved on a draft. Nothing goes on sale from here.",
        },
        {
          key: "description",
          label: "Description",
          kind: "textarea",
          optional: true,
        },
      ];
    case "team.member":
    case "team.invite":
      return [
        { key: "displayName", label: "Name", kind: "text" },
        {
          key: "role",
          label: "Role",
          kind: "select",
          options: [...staffRoleOptions],
        },
        { key: "title", label: "Title", kind: "text", optional: true },
      ];
    default:
      if (fieldKey.startsWith("policies.")) {
        return [
          { key: "title", label: "Policy name", kind: "text" },
          { key: "summary", label: "What it says", kind: "textarea" },
          {
            key: "refundBeforeMinutes",
            label: "Notice for a refund, in hours",
            kind: "number",
            optional: true,
            hint: "Saved as an inactive draft policy.",
          },
        ];
      }
      return [{ key: "value", label: "Value", kind: "text" }];
  }
}

/** Reads `a.b` out of a value. */
export function readPath(
  value: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

/** Writes `a.b` into a copy of a value; empty strings remove the key. */
export function writePath(
  value: Readonly<Record<string, unknown>>,
  path: string,
  next: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  const copy: Record<string, unknown> = { ...value };
  if (!head) return copy;
  if (rest.length === 0) {
    if (next === "" || next === undefined) delete copy[head];
    else copy[head] = next;
    return copy;
  }
  const child =
    copy[head] && typeof copy[head] === "object"
      ? (copy[head] as Record<string, unknown>)
      : {};
  copy[head] = writePath(child, rest.join("."), next);
  return copy;
}

// ---------------------------------------------------------------------------
// Runs: what each state says, and what the person can do next
// ---------------------------------------------------------------------------

export const setupFailureReasons = [
  "no-response",
  "no-such-host",
  "address-not-allowed",
  "blocked-by-site",
  "nothing-readable",
  "too-large",
  "timed-out",
] as const;
export type SetupFailureReason = (typeof setupFailureReasons)[number];

/** A way forward from a run's state. */
export type RunNextStep =
  | "cancel"
  | "review"
  | "try-another-address"
  | "try-again"
  | "by-hand"
  | "setup-home";

export interface RunCopy {
  readonly title: string;
  readonly body: string;
  readonly tone: "info" | "positive" | "warning";
  /** In order; the first is the primary action. */
  readonly next: readonly RunNextStep[];
}

const failureCopy: Readonly<Record<SetupFailureReason, RunCopy>> = {
  "no-response": {
    title: "Your website did not answer",
    body: "Your website did not answer. Check the address, or try again later.",
    tone: "warning",
    next: ["try-again", "try-another-address", "by-hand"],
  },
  "no-such-host": {
    title: "That address does not exist",
    body: "That address does not exist. Check the spelling of your website.",
    tone: "warning",
    next: ["try-another-address", "by-hand"],
  },
  "address-not-allowed": {
    title: "Duna can't read that address",
    body: "Duna can only read a public website address (http or https, no special ports).",
    tone: "warning",
    next: ["try-another-address", "by-hand"],
  },
  "blocked-by-site": {
    title: "Your website asked not to be read",
    body: "Your website asked not to be read by tools like Duna. You can fill in your club by hand.",
    tone: "warning",
    next: ["by-hand", "try-another-address"],
  },
  "nothing-readable": {
    title: "Nothing readable on your website",
    body: "Duna could not find readable text on your website. You can fill in your club by hand.",
    tone: "warning",
    next: ["by-hand", "try-another-address"],
  },
  "too-large": {
    title: "Your website's pages are too large",
    body: "Your website's pages are too large to read. You can fill in your club by hand.",
    tone: "warning",
    next: ["by-hand", "try-another-address"],
  },
  "timed-out": {
    title: "Reading took too long",
    body: "Reading your website took too long. Try again, or fill in your club by hand.",
    tone: "warning",
    next: ["try-again", "by-hand"],
  },
};

export function isSetupFailureReason(
  value: string | undefined,
): value is SetupFailureReason {
  return (setupFailureReasons as readonly string[]).includes(value ?? "");
}

/** The address as people say it: "club.example". */
export function siteName(url: string | undefined): string {
  if (!url) return "your website";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** What a run's state says, and the ways forward, for every status and outcome. */
export function runCopy(
  run: Pick<
    SetupRun,
    | "status"
    | "outcome"
    | "failureReason"
    | "sourceKind"
    | "sourceUrl"
    | "itemsFound"
    | "pagesRead"
    | "pagesTotal"
  >,
): RunCopy {
  const site = siteName(run.sourceUrl);
  const source = run.sourceKind === "description" ? "your description" : site;
  switch (run.status) {
    case "queued":
      return {
        title: `Getting ready to read ${source}`,
        body: "Duna starts with your home page, then reads up to seven more pages one topic at a time.",
        tone: "info",
        next: ["cancel"],
      };
    case "reading":
      return {
        title: `Reading ${source}`,
        body:
          run.pagesTotal > 0
            ? `${run.pagesRead} of ${run.pagesTotal} pages read so far. You can leave this page: the read carries on and you can come back to it.`
            : "You can leave this page: the read carries on and you can come back to it.",
        tone: "info",
        next: ["cancel"],
      };
    case "review": {
      if (run.outcome === "found-very-little") {
        return {
          title: "Duna found very little",
          body: `Duna found only ${run.itemsFound} thing${run.itemsFound === 1 ? "" : "s"} on ${site}. Review them, then fill in the rest by hand.`,
          tone: "warning",
          next: ["review", "by-hand"],
        };
      }
      if (run.outcome === "no-website") {
        return {
          title: "Duna read your description",
          body: `Duna proposes ${run.itemsFound} thing${run.itemsFound === 1 ? "" : "s"} from what you wrote. Nothing is added until you keep it.`,
          tone: "positive",
          next: ["review"],
        };
      }
      return {
        title: `Duna found ${run.itemsFound} thing${run.itemsFound === 1 ? "" : "s"} on ${site}`,
        body: "Nothing is added to your club until you keep it and apply.",
        tone: "positive",
        next: ["review"],
      };
    }
    case "applied":
      return {
        title: "Applied to your club",
        body: "What you kept is in your club. Prices and policies are drafts; nobody was invited.",
        tone: "positive",
        next: ["setup-home", "review"],
      };
    case "failed": {
      if (isSetupFailureReason(run.failureReason)) {
        return failureCopy[run.failureReason];
      }
      return {
        title: "Duna could not read your website",
        body: "Something stopped the read. Try again, or fill in your club by hand.",
        tone: "warning",
        next: ["try-again", "by-hand"],
      };
    }
    case "cancelled":
      return {
        title: "You stopped the read",
        body: "Nothing it found was kept. Start again whenever you like, or fill in your club by hand.",
        tone: "info",
        next: ["try-again", "by-hand"],
      };
  }
}

/** Whether the run is still going (the screen polls it). */
export function isRunActive(run: Pick<SetupRun, "status">): boolean {
  return run.status === "queued" || run.status === "reading";
}

export const runNextLabels: Readonly<Record<RunNextStep, string>> = {
  cancel: "Stop reading",
  review: "Review what Duna found",
  "try-another-address": "Try another address",
  "try-again": "Try again",
  "by-hand": "Fill it in by hand",
  "setup-home": "See what's next",
};

export const pageStatusLabels: Readonly<
  Record<SetupRun["pages"][number]["status"], string>
> = {
  queued: "Waiting",
  reading: "Reading now",
  read: "Read",
  failed: "Couldn't read",
  skipped: "Skipped",
};

/** "https://club.example/contact" → "/contact". */
export function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

/** Accepts "club.com", "www.club.com/path", "https://club.com"; undefined when it can't be an address. */
export function normaliseWebsiteInput(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname.includes(".")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Apply: what will be written, and where it went
// ---------------------------------------------------------------------------

export interface ApplyLine {
  readonly id: string;
  readonly group: ReviewGroupKey;
  readonly text: string;
}

/** One sentence per kept item: exactly what Apply writes. */
export function applyLine(proposal: SetupProposal): string {
  const value = proposalValue(proposal);
  const text = valueText(proposal.fieldKey, value, proposal.label);
  const before = proposal.payload.before;
  const changes = before !== undefined && before !== null;
  switch (proposal.fieldKey) {
    case "identity.name":
      return `Renames your club to “${text}”`;
    case "identity.tagline":
      return `${changes ? "Changes" : "Sets"} your tagline`;
    case "identity.about":
      return `${changes ? "Changes" : "Sets"} your club's description`;
    case "identity.sports":
      return `Adds ${text.toLowerCase()} to your club's sports`;
    case "identity.logo":
      return "Sets your logo (your club page is not republished)";
    case "identity.colors":
      return `Sets your club colour to ${String(value.primary ?? "")}`;
    case "contact.phone":
      return `${changes ? "Changes" : "Sets"} your phone to ${text}`;
    case "contact.email":
      return `${changes ? "Changes" : "Sets"} your email to ${text}`;
    case "contact.social":
      return `Adds your ${proposal.label} link`;
    case "places.hours":
      return `${changes ? "Changes" : "Sets"} your opening hours: ${text}`;
    case "places.venue":
      return changes
        ? `Adds draft courts to ${String(value.name ?? proposal.label)} (none removed or renamed)`
        : `Creates a draft place, ${text}`;
    case "offerings.item":
      return changes
        ? `Saves the website's price on ${String(value.title ?? proposal.label)} as a suggestion; its live price is not changed`
        : `Creates a private draft offering, ${text} (not on sale)`;
    case "team.member":
    case "team.invite":
      return `Adds ${String(value.displayName ?? proposal.label)} as a draft team profile (nobody is invited)`;
    default:
      if (proposal.fieldKey.startsWith("policies.")) {
        return typeof value.refundBeforeMinutes === "number"
          ? `Saves “${proposal.label}” as an inactive draft refund policy`
          : `Saves “${proposal.label}” as a note in your club's knowledge`;
      }
      return `Saves ${proposal.label}`;
  }
}

/** What Apply would write now: every kept or edited item, by group. */
export function applySummary(proposals: readonly SetupProposal[]): {
  readonly lines: readonly ApplyLine[];
  readonly count: number;
  /** Touches prices or policies: the strong confirmation. */
  readonly strong: boolean;
  readonly groups: readonly ReviewGroupKey[];
} {
  const accepted = visibleProposals(proposals).filter(
    (p) => p.decision === "kept" || p.decision === "edited",
  );
  const lines = reviewGroupKeys.flatMap((group) =>
    accepted
      .filter((p) => reviewGroupOf(p) === group)
      .map((p) => ({ id: p.id, group, text: applyLine(p) })),
  );
  const strong = accepted.some(
    (p) =>
      p.fieldKey.startsWith("policies.") ||
      (p.fieldKey === "offerings.item" &&
        priceText(proposalValue(p).price) !== undefined),
  );
  return {
    lines,
    count: lines.length,
    strong,
    groups: [...new Set(lines.map((line) => line.group))],
  };
}

/** Where an applied item now lives in HQ, with words for the link. */
export function appliedEntityLink(
  entity: SetupProposal["appliedEntity"],
): { readonly href: string; readonly label: string } | undefined {
  if (!entity) return undefined;
  switch (entity.type) {
    case "venue":
      return {
        href: hqHref("place", { venueId: entity.id }),
        label: "Open the place",
      };
    case "catalog_item":
      return {
        href: hqHref("offering", { itemId: entity.id }),
        label: "Open the draft offering",
      };
    case "organization_staff_profile":
      return { href: "/team", label: "Open Team" };
    case "organization_refund_policy":
      return {
        href: hqHref("moneyRefundPolicies"),
        label: "Open refund policies",
      };
    case "organization_knowledge_note":
      return {
        href: `${hqHref("setupIdentity")}#knowledge`,
        label: "Open your club's knowledge",
      };
    case "organization_profile":
    case "organization":
    case "organization_theme":
      return { href: hqHref("setupIdentity"), label: "Open identity" };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// The setup home: prerequisites in order
// ---------------------------------------------------------------------------

export type PrerequisiteKey =
  | "identity"
  | "places"
  | "duna-pay"
  | "offerings"
  | "team"
  | "website"
  | "policies";

export type PrerequisiteState = "done" | "needs-you" | "optional";

export interface Prerequisite {
  readonly key: PrerequisiteKey;
  readonly label: string;
  readonly state: PrerequisiteState;
  /** One line: what is true now. */
  readonly detail: string;
  /** The one next action. */
  readonly action: { readonly label: string; readonly href: string };
  /** A step that has to come first, linked straight to its fix. */
  readonly blockedBy?: {
    readonly key: PrerequisiteKey;
    readonly label: string;
    readonly href: string;
  };
}

type Section = SetupReadiness["sections"][number];

export interface PrerequisiteFacts {
  readonly venues: number;
  readonly courts: number;
  readonly offerings: number;
  readonly liveOfferings: number;
}

const order: readonly PrerequisiteKey[] = [
  "identity",
  "places",
  "duna-pay",
  "offerings",
  "team",
  "website",
  "policies",
];

const optionalKeys = new Set<PrerequisiteKey>(["team", "website", "policies"]);

function sectionOf(
  readiness: SetupReadiness,
  key: Section["key"],
): Section | undefined {
  return readiness.sections.find((section) => section.key === key);
}

function done(section: Section | undefined): boolean {
  return section?.state === "complete";
}

/**
 * The setup home's ordered list: identity (with contact and hours), places
 * and courts, Duna Pay, the first offering, then the optional team, website
 * and policies. Each carries its true state from the readiness read and the
 * club's records, and one next action. A step that needs another first links
 * straight to that fix.
 */
export function prerequisites(
  readiness: SetupReadiness,
  facts: PrerequisiteFacts,
): Prerequisite[] {
  const identity = sectionOf(readiness, "identity");
  const contact = sectionOf(readiness, "contact");
  const hours = sectionOf(readiness, "hours");
  const places = sectionOf(readiness, "places");
  const pay = sectionOf(readiness, "duna-pay");
  const offerings = sectionOf(readiness, "offerings");
  const team = sectionOf(readiness, "team");
  const website = sectionOf(readiness, "website");
  const policies = sectionOf(readiness, "policies");

  const identityParts = [identity, contact, hours];
  const identityDone = identityParts.every(done);
  const attention = identityParts.find((s) => s?.state === "needs-attention");
  const payDone = done(pay);
  const placesDone = done(places) || (facts.venues > 0 && facts.courts > 0);

  const items: Record<PrerequisiteKey, Prerequisite> = {
    identity: {
      key: "identity",
      label: "Identity",
      state: identityDone ? "done" : "needs-you",
      detail: identityDone
        ? "Name, contact and opening hours are set"
        : (attention?.note ??
          [
            done(identity) ? undefined : "your club's name and story",
            done(contact) ? undefined : "how to reach you",
            done(hours) ? undefined : "opening hours",
          ]
            .filter(Boolean)
            .join(", ")
            .replace(/^./, (c) => `Add ${c}`)),
      action: identityDone
        ? { label: "Review identity", href: hqHref("setupIdentity") }
        : { label: "Finish identity", href: hqHref("setupIdentity") },
    },
    places: {
      key: "places",
      label: "Places and courts",
      state: placesDone ? "done" : "needs-you",
      detail:
        facts.venues === 0
          ? "No place yet: add where you play"
          : `${facts.venues} place${facts.venues === 1 ? "" : "s"}, ${facts.courts} court${facts.courts === 1 ? "" : "s"}${places?.note ? ` · ${places.note}` : ""}`,
      action:
        facts.venues === 0
          ? { label: "Add a place", href: hqHref("placeCreate") }
          : { label: "Open places", href: hqHref("places") },
    },
    "duna-pay": {
      key: "duna-pay",
      label: "Duna Pay",
      state: payDone ? "done" : "needs-you",
      detail: payDone
        ? "Ready to take payments"
        : (pay?.note ?? "Needed before anything goes on sale"),
      action: {
        label: payDone ? "Open Duna Pay" : "Set up payments",
        href: hqHref("moneyDunaPay"),
      },
    },
    offerings: {
      key: "offerings",
      label: "First offering",
      state: facts.liveOfferings > 0 ? "done" : "needs-you",
      detail:
        facts.liveOfferings > 0
          ? `${facts.liveOfferings} on sale`
          : facts.offerings > 0
            ? `${facts.offerings} draft${facts.offerings === 1 ? "" : "s"}, none on sale yet`
            : (offerings?.note ??
              "A lesson, membership or pack people can book"),
      action:
        facts.offerings > 0
          ? { label: "Open offerings", href: "/offerings" }
          : { label: "Create an offering", href: hqHref("offeringCreate") },
      ...(facts.liveOfferings === 0 && !payDone
        ? {
            blockedBy: {
              key: "duna-pay" as const,
              label: "Goes on sale once Duna Pay is ready",
              href: hqHref("moneyDunaPay"),
            },
          }
        : {}),
    },
    team: {
      key: "team",
      label: "Team",
      state: done(team) ? "done" : "optional",
      detail: team?.note ?? "Coaches and front desk, when you're ready",
      action: { label: "Open Team", href: "/team" },
    },
    website: {
      key: "website",
      label: "Website",
      state: done(website) ? "done" : "optional",
      detail: done(website)
        ? "Your club page is set up"
        : (website?.note ?? "A public page people can book from"),
      action: { label: "Open Website", href: hqHref("website") },
    },
    policies: {
      key: "policies",
      label: "Policies",
      state: done(policies) ? "done" : "optional",
      detail: policies?.note ?? "Cancellation and refund terms",
      action: {
        label: "Open refund policies",
        href: hqHref("moneyRefundPolicies"),
      },
    },
  };
  // A place is needed before courts can be booked; a place with no courts says so.
  if (!placesDone && facts.venues > 0 && facts.courts === 0) {
    items.places = {
      ...items.places,
      detail: "Your place has no courts yet",
      action: { label: "Open places", href: hqHref("places") },
    };
  }
  return order.map((key) => ({
    ...items[key],
    state:
      items[key].state === "done"
        ? "done"
        : optionalKeys.has(key)
          ? "optional"
          : "needs-you",
  }));
}

/** The one next action on the setup home: the first step that needs the person. */
export function nextPrerequisite(
  list: readonly Prerequisite[],
): Prerequisite | undefined {
  return list.find((item) => item.state === "needs-you");
}

export const prerequisiteStateLabels: Readonly<
  Record<PrerequisiteState, string>
> = {
  done: "Done",
  "needs-you": "Needs you",
  optional: "Optional",
};

// ---------------------------------------------------------------------------
// Identity: provenance and brand contrast
// ---------------------------------------------------------------------------

/** Where a profile field's value came from, in words. */
export function provenance(
  profile: Pick<SetupProfile, "fieldSources" | "websiteLastReadAt">,
  field: string,
  timeZone = "UTC",
): string | undefined {
  const source = profile.fieldSources[field];
  if (!source) return undefined;
  if (source.source === "person") return "You edited this";
  if (source.confirmed) return "You confirmed this";
  const when = profile.websiteLastReadAt
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone,
      }).format(new Date(profile.websiteLastReadAt))
    : undefined;
  const from =
    source.source === "website"
      ? "From your website"
      : source.source === "description"
        ? "From your description"
        : source.source === "google-listing"
          ? "From your listing"
          : "Suggested by Duna";
  return when ? `${from} on ${when}` : from;
}

const SOLAR = { r: 0xf2, g: 0x54, b: 0x2d };

export interface ColourCheck {
  readonly valid: boolean;
  readonly hex: string;
  /** Night Court or Salt, whichever reads better on it. */
  readonly foreground: string;
  readonly ratio: number;
  readonly passesText: boolean;
  readonly passesGraphics: boolean;
  /** Too close to Duna's live colour, which only ever means "live". */
  readonly nearLive: boolean;
  /** Plain words for the result. */
  readonly verdict: string;
}

/** The contrast result for a club colour, in numbers and words. */
export function checkColour(value: string): ColourCheck {
  const rgb = parseHexColor(value);
  const choice = foregroundFor(value);
  const hex = rgb
    ? `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
    : value;
  const nearLive = rgb
    ? Math.hypot(rgb.r - SOLAR.r, rgb.g - SOLAR.g, rgb.b - SOLAR.b) < 48
    : false;
  const verdict = !rgb
    ? "Use a colour like #1A2B3C."
    : nearLive
      ? "Too close to Duna's live colour, which only ever means something is live. Choose another."
      : choice.passesText
        ? `Text on it reads clearly (${choice.ratio.toFixed(1)}:1).`
        : choice.passesGraphics
          ? `Fine for your mark (${choice.ratio.toFixed(1)}:1); Duna adjusts it for small text.`
          : `Hard to read on (${choice.ratio.toFixed(1)}:1); Duna adjusts it for buttons and text.`;
  return {
    valid: Boolean(rgb),
    hex,
    foreground: choice.foreground,
    ratio: choice.ratio,
    passesText: choice.passesText,
    passesGraphics: choice.passesGraphics,
    nearLive,
    verdict,
  };
}

export type MarkForm = "logo" | "tile" | "monogram";

export const markFormOptions: readonly {
  readonly value: MarkForm;
  readonly label: string;
}[] = [
  { value: "logo", label: "Logo on colour" },
  { value: "tile", label: "Image tile" },
  { value: "monogram", label: "Monogram" },
];
