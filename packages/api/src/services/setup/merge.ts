/**
 * Merging and diffing (pure). The same fact found on several pages becomes
 * one proposal with all its sources; different values for a fact that has
 * one value (a phone, a name) become `candidates` for the person to pick
 * from, or "Neither". A re-read proposes only what differs from the club's
 * current records, each with the current value as `before`.
 */
import { setupLimits } from "./limits";
import {
  normaliseKey,
  type SetupCategory,
  type SetupConfidence,
  type SetupFact,
  type SetupQuote,
} from "./validate";

export interface SetupProposalDraft {
  readonly category: SetupCategory;
  readonly fieldKey: string;
  readonly mergeKey: string;
  readonly label: string;
  /** Value fields plus `confidence`, `quotes` and (on a re-read) `before`. */
  readonly payload: Record<string, unknown>;
  readonly candidates: Record<string, unknown>[];
  readonly sourcePages: string[];
  readonly needsCheck: boolean;
  readonly checkNote?: string;
}

/** Keys whose facts are lists that combine instead of conflicting. */
const combining = new Set(["identity.sports", "places.hours"]);

/** Entity facts fill each other's gaps; only the named field can conflict. */
const entityConflictField: Readonly<
  Record<string, (v: Readonly<Record<string, unknown>>) => unknown>
> = {
  "places.venue": (v) => v.courtCount ?? undefined,
  "offerings.item": (v) =>
    (v.price as { amountMinor?: number } | null)?.amountMinor ?? undefined,
  "team.member": (v) => v.role,
};

function valueKey(
  fieldKey: string,
  value: Readonly<Record<string, unknown>>,
): string {
  const conflict = entityConflictField[fieldKey];
  if (conflict) return JSON.stringify(conflict(value) ?? null);
  if (fieldKey.startsWith("policies.")) {
    return JSON.stringify(value.refundBeforeMinutes ?? null);
  }
  const primary =
    "value" in value ? value.value : "url" in value ? value.url : value;
  return JSON.stringify(primary, (_key, v: unknown) =>
    typeof v === "string" ? normaliseKey(v) : v,
  );
}

/** Fills missing or null fields of the first value from the others. */
function fillGaps(
  values: readonly Readonly<Record<string, unknown>>[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...values[0] };
  for (const value of values.slice(1)) {
    for (const [key, field] of Object.entries(value)) {
      if (merged[key] === undefined || merged[key] === null)
        merged[key] = field;
    }
  }
  return merged;
}

const unique = <T>(values: readonly T[]) => [...new Set(values)];

function combineValues(
  fieldKey: string,
  facts: readonly SetupFact[],
): Record<string, unknown> {
  if (fieldKey === "identity.sports") {
    return {
      values: unique(
        facts.flatMap((fact) => (fact.value.values as string[]) ?? []),
      ).sort(),
    };
  }
  const byDay = new Map<number, { opens: string; closes: string }>();
  for (const fact of facts) {
    for (const window of (fact.value.weekly as {
      weekday: number;
      opens: string;
      closes: string;
    }[]) ?? []) {
      if (!byDay.has(window.weekday)) byDay.set(window.weekday, window);
    }
  }
  return {
    weekly: [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([weekday, w]) => ({ weekday, opens: w.opens, closes: w.closes })),
  };
}

function hoursConflict(facts: readonly SetupFact[]): boolean {
  const seen = new Map<number, string>();
  for (const fact of facts) {
    for (const w of (fact.value.weekly as {
      weekday: number;
      opens: string;
      closes: string;
    }[]) ?? []) {
      const key = `${w.opens}-${w.closes}`;
      const prior = seen.get(w.weekday);
      if (prior && prior !== key) return true;
      seen.set(w.weekday, key);
    }
  }
  return false;
}

/** Merges validated facts from every page into one proposal per fact. */
export function mergeFacts(facts: readonly SetupFact[]): SetupProposalDraft[] {
  const groups = new Map<string, SetupFact[]>();
  for (const fact of facts) {
    const group = groups.get(fact.mergeKey) ?? [];
    group.push(fact);
    groups.set(fact.mergeKey, group);
  }
  const drafts: SetupProposalDraft[] = [];
  for (const [mergeKey, group] of groups) {
    const first = group[0]!;
    const sourcePages = unique(group.map((fact) => fact.quote.page));
    const quotes: SetupQuote[] = [];
    for (const fact of group) {
      if (
        quotes.length < setupLimits.maxQuotesPerProposal &&
        !quotes.some((q) => q.page === fact.quote.page)
      ) {
        quotes.push(fact.quote);
      }
    }
    const confidence: SetupConfidence = group.some(
      (fact) => fact.confidence === "stated",
    )
      ? "stated"
      : "inferred";
    const checks = unique(group.flatMap((fact) => fact.checks));

    let value: Record<string, unknown>;
    let candidates: Record<string, unknown>[] = [];
    if (combining.has(first.fieldKey)) {
      value = combineValues(first.fieldKey, group);
      if (first.fieldKey === "places.hours" && hoursConflict(group)) {
        checks.unshift("Different hours on different pages: check each day");
      }
    } else {
      // Distinct values, most-cited first (ties keep page order).
      const distinct = new Map<
        string,
        { values: Readonly<Record<string, unknown>>[]; pages: string[] }
      >();
      for (const fact of group) {
        const key = valueKey(first.fieldKey, fact.value);
        const entry = distinct.get(key) ?? { values: [], pages: [] };
        entry.values.push(fact.value);
        entry.pages.push(fact.quote.page);
        distinct.set(key, entry);
      }
      const ranked = [...distinct.values()]
        .sort((a, b) => unique(b.pages).length - unique(a.pages).length)
        .map((entry) => ({
          value: fillGaps(entry.values),
          pages: entry.pages,
        }));
      value = ranked[0]!.value;
      // An unstated number (no price, no court count) is a gap, not a conflict.
      if (entityConflictField[first.fieldKey]) {
        const stated = ranked.filter(
          (entry) =>
            entityConflictField[first.fieldKey]!(entry.value) !== undefined,
        );
        const gapsOnly = ranked.filter((entry) => !stated.includes(entry));
        if (stated.length <= 1) {
          value = fillGaps([
            ...stated.map((e) => e.value),
            ...gapsOnly.map((e) => e.value),
          ]);
          ranked.splice(0, ranked.length, {
            value,
            pages: ranked.flatMap((e) => e.pages),
          });
        }
      }
      if (ranked.length > 1) {
        candidates = ranked.map((entry) => ({
          ...entry.value,
          sourcePages: unique(entry.pages),
        }));
        checks.unshift("Conflicting values: pick one, or Neither");
      }
    }
    // A gap filled from another page is no longer a gap.
    for (const [note, filled] of [
      ["No price on the site", value.price],
      ["The number of courts was not stated", value.courtCount],
    ] as const) {
      const index = checks.indexOf(note);
      if (index >= 0 && filled !== null && filled !== undefined) {
        checks.splice(index, 1);
      }
    }
    drafts.push({
      category: first.category,
      fieldKey: first.fieldKey,
      mergeKey,
      label: first.label,
      payload: { ...value, confidence, quotes },
      candidates,
      sourcePages,
      needsCheck: checks.length > 0,
      ...(checks.length ? { checkNote: checks.join(". ") } : {}),
    });
  }
  const order: readonly SetupCategory[] = [
    "identity",
    "contact",
    "places",
    "offerings",
    "team",
    "policies",
  ];
  return drafts.sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );
}

/** The club's current records, read once per finalisation (./current.ts). */
export interface SetupCurrentRecords {
  readonly name: string;
  readonly volleyballTypes: readonly string[];
  readonly tagline?: string;
  readonly about?: string;
  readonly phoneE164?: string;
  readonly email?: string;
  readonly socials: Readonly<Record<string, string>>;
  readonly hours: readonly { weekday: number; opens: string; closes: string }[];
  readonly logoUrl?: string;
  readonly palette?: { readonly primary?: string; readonly accent?: string };
  /** Normalised venue name → court count. */
  readonly venues: ReadonlyMap<string, number>;
  /** Normalised person names on the team (staff and draft staff). */
  readonly team: ReadonlySet<string>;
  /** Normalised offering title → card price minor units (undefined: none). */
  readonly offerings: ReadonlyMap<string, number | undefined>;
  /** Policy kind → summary/terms text, refund window. */
  readonly policies: ReadonlyMap<
    string,
    { text: string; refundBeforeMinutes?: number | null }
  >;
  /** Profile fields a person set or confirmed (never overwritten silently). */
  readonly personFields: ReadonlySet<string>;
}

const same = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string"
    ? normaliseKey(a) === normaliseKey(b)
    : JSON.stringify(a) === JSON.stringify(b);

/** The current value for a draft, or undefined when the club has none. */
function currentFor(
  draft: SetupProposalDraft,
  current: SetupCurrentRecords,
): { before: unknown; equal: boolean; personField?: string } | undefined {
  const p = draft.payload;
  switch (draft.fieldKey) {
    case "identity.name":
      return { before: current.name, equal: same(p.value, current.name) };
    case "identity.tagline":
      return current.tagline === undefined
        ? undefined
        : {
            before: current.tagline,
            equal: same(p.value, current.tagline),
            personField: "tagline",
          };
    case "identity.about":
      return current.about === undefined
        ? undefined
        : {
            before: current.about,
            equal: same(p.value, current.about),
            personField: "about",
          };
    case "identity.sports": {
      const proposed = (p.values as string[]) ?? [];
      return {
        before: [...current.volleyballTypes],
        equal: proposed.every((v) => current.volleyballTypes.includes(v)),
      };
    }
    case "identity.logo":
      return current.logoUrl === undefined
        ? undefined
        : { before: current.logoUrl, equal: same(p.url, current.logoUrl) };
    case "identity.colors":
      return current.palette?.primary === undefined
        ? undefined
        : {
            before: current.palette,
            equal:
              String(p.primary).toUpperCase() ===
              String(current.palette.primary).toUpperCase(),
          };
    case "contact.phone":
      return current.phoneE164 === undefined
        ? undefined
        : {
            before: current.phoneE164,
            equal: p.value === current.phoneE164,
            personField: "phoneE164",
          };
    case "contact.email":
      return current.email === undefined
        ? undefined
        : {
            before: current.email,
            equal: same(p.value, current.email),
            personField: "email",
          };
    case "contact.social": {
      const before = current.socials[String(p.network)];
      return before === undefined
        ? undefined
        : { before, equal: same(p.url, before), personField: "socials" };
    }
    case "places.hours":
      return current.hours.length === 0
        ? undefined
        : {
            before: { weekly: current.hours },
            equal: same(p.weekly, current.hours),
            personField: "hours",
          };
    case "places.venue": {
      const key = normaliseKey(String(p.name));
      if (!current.venues.has(key)) return undefined;
      const courts = current.venues.get(key);
      return {
        before: { name: p.name, courtCount: courts },
        equal:
          p.courtCount === null ||
          p.courtCount === undefined ||
          p.courtCount === courts,
      };
    }
    case "team.member": {
      const key = normaliseKey(String(p.displayName));
      return current.team.has(key)
        ? { before: { displayName: p.displayName }, equal: true }
        : undefined;
    }
    case "offerings.item": {
      const key = normaliseKey(String(p.title));
      if (!current.offerings.has(key)) return undefined;
      const beforeMinor = current.offerings.get(key);
      const price = p.price as { amountMinor?: number } | null;
      return {
        before: { title: p.title, amountMinor: beforeMinor ?? null },
        equal: !price || price.amountMinor === beforeMinor,
      };
    }
    default: {
      if (!draft.fieldKey.startsWith("policies.")) return undefined;
      const existing = current.policies.get(String(p.kind));
      if (!existing) return undefined;
      return {
        before: existing,
        equal:
          (p.refundBeforeMinutes ?? null) ===
            (existing.refundBeforeMinutes ?? null) &&
          normaliseKey(existing.text).includes(
            normaliseKey(String(p.summary)).slice(0, 60),
          ),
      };
    }
  }
}

/**
 * Keeps only drafts that differ from the club's current records and adds
 * `before` to each one that changes an existing value. A value a person set
 * themselves is still proposed when the site differs, flagged so it is
 * never mistaken for a correction.
 */
export function diffAgainstCurrent(
  drafts: readonly SetupProposalDraft[],
  current: SetupCurrentRecords,
): SetupProposalDraft[] {
  return drafts.flatMap((draft) => {
    const existing = currentFor(draft, current);
    if (!existing) return [draft];
    if (existing.equal) return [];
    const notes = draft.checkNote ? [draft.checkNote] : [];
    if (
      existing.personField &&
      current.personFields.has(existing.personField)
    ) {
      notes.unshift("You set this yourself: your website says something else");
    }
    return [
      {
        ...draft,
        payload: { ...draft.payload, before: existing.before },
        needsCheck: draft.needsCheck || notes.length > 0,
        ...(notes.length ? { checkNote: notes.join(". ") } : {}),
      },
    ];
  });
}
