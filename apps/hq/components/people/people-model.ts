/**
 * People (H-PEOPLE): the pure rules behind the club's people screens. No
 * React, no I/O, so every rule here is unit-tested: what a person is to the
 * club in plain words, what needs attention, segments as shareable URL
 * states, search, the next best action, duplicates, export columns, import
 * checks, merge checks, and what a role may receive at
 * all (redaction happens on the server, before anything reaches a browser).
 */

import type { OperatorMemberProfile } from "@duna/api";

// ---------------------------------------------------------------- privacy

/*
 * Who may open a person's Health is decided by the Health service itself and
 * arrives with the member profile as `healthAccess.canView` (computed by the
 * service's non-recording check, so reading it writes no access record). HQ
 * keeps no copy of that rule.
 */

/** The product's standing wording under any health figure. */
export const HEALTH_DISCLAIMER =
  "Duna Readiness and Strain are individualized performance context, not medical advice, diagnosis, injury prediction, or a direction to train.";

// ---------------------------------------------------------------- rows

export type ChurnLevel = "low" | "watch" | "high";
export type GuardianState = "verified" | "pending" | "none";

/** The workspace's person, as the procedure returns it (the fields we read). */
export interface WorkspacePerson {
  readonly personId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly isMinor: boolean;
  readonly roles: readonly string[];
  readonly status: "active" | "inactive" | "pending";
  readonly membershipStatus?: string;
  readonly membershipName?: string;
  readonly creditBalance: number;
  /** Absent for roles without payments:read (PRIV-2). */
  readonly lifetimeSpendMinor?: number;
  readonly upcomingCount: number;
  readonly churnRisk: {
    readonly level: ChurnLevel;
    readonly reasons: readonly string[];
    readonly lastActivityAt?: string;
    readonly daysSinceActivity?: number;
  };
  readonly joinedAt: string;
}

export type AttentionKind =
  | "payment-failed"
  | "membership-ending"
  | "no-guardian-consent"
  | "waiver-missing"
  | "lapsing";

export interface Attention {
  readonly kind: AttentionKind;
  readonly label: string;
  readonly tone: "warning" | "attention" | "danger" | "neutral";
}

/**
 * One person as a list row, already cut to what the viewer may see: a
 * junior never carries a direct contact (the guardian is the contact), and
 * money appears only for roles that read payments. Health is never here.
 */
export interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly isJunior: boolean;
  readonly isGuardian: boolean;
  readonly isPlayer: boolean;
  readonly status: "active" | "inactive" | "pending";
  /** Adults only. */
  readonly email?: string;
  /** Adults only. */
  readonly phone?: string;
  readonly plan?: string;
  readonly planStatus?: string;
  readonly credits: number;
  readonly memberSince: string;
  readonly lastSeenAt?: string;
  readonly daysQuiet?: number;
  readonly upcoming: number;
  readonly churn: ChurnLevel;
  /** Juniors: whether a guardian has confirmed the relationship. */
  readonly guardianState?: GuardianState;
  /** Juniors: the guardian's name, when the club invited them. */
  readonly guardianName?: string;
  /** Roles that read payments only. */
  readonly spendMinor?: number;
  readonly attention: readonly Attention[];
  /** What they are to the club, in plain words. */
  readonly relation: string;
}

const endedStatuses = new Set(["cancelled", "canceled", "expired", "inactive"]);
const failedStatuses = new Set(["past-due", "past_due", "unpaid", "failed"]);

export function hasActivePlan(plan?: string, planStatus?: string): boolean {
  return Boolean(plan && planStatus && !endedStatuses.has(planStatus));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** "Jun 2026" in the club's time zone. */
export function monthYear(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** "Dec 4" (or "Dec 4, 2027" outside this year) in the club's time zone. */
export function shortDate(iso: string, timeZone: string, now: Date): string {
  const date = new Date(iso);
  const year = (value: Date) =>
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(
      value,
    );
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(year(date) === year(now) ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
}

export interface AttentionInput {
  readonly isJunior: boolean;
  readonly membershipStatus?: string;
  readonly guardianState?: GuardianState;
  /** When the current plan stops (a cancellation at period end). */
  readonly planEndsAt?: string;
  /** From the documents read, when the backend supplies it. */
  readonly waiverMissing?: boolean;
  readonly daysQuiet?: number;
  readonly upcoming: number;
  readonly churn: ChurnLevel;
  readonly canSeePayments: boolean;
  readonly now: Date;
}

/** A plan that stops within this many days counts as "ending". */
export const ENDING_WITHIN_DAYS = 14;
/** Quiet this long with nothing booked counts as lapsing. */
export const LAPSING_AFTER_DAYS = 30;

export function isLapsing(input: {
  readonly churn: ChurnLevel;
  readonly daysQuiet?: number;
  readonly upcoming: number;
}): boolean {
  if (input.upcoming > 0) return false;
  return input.churn === "high" || (input.daysQuiet ?? 0) >= LAPSING_AFTER_DAYS;
}

/**
 * What needs the club about this person, most urgent first. Payment words
 * appear only for roles that read payments (a coach is not told about a
 * failed card).
 */
export function attentionFor(input: AttentionInput): Attention[] {
  const items: Attention[] = [];
  if (
    input.canSeePayments &&
    input.membershipStatus &&
    failedStatuses.has(input.membershipStatus)
  ) {
    items.push({
      kind: "payment-failed",
      label: "Payment failed",
      tone: "danger",
    });
  }
  if (input.isJunior && input.guardianState !== "verified") {
    items.push({
      kind: "no-guardian-consent",
      label: "No guardian consent",
      tone: "warning",
    });
  }
  if (input.waiverMissing) {
    items.push({
      kind: "waiver-missing",
      label: "Waiver missing",
      tone: "warning",
    });
  }
  if (input.planEndsAt) {
    const days = daysBetween(input.now, new Date(input.planEndsAt));
    if (days >= 0 && days <= ENDING_WITHIN_DAYS) {
      items.push({
        kind: "membership-ending",
        label:
          days === 0
            ? "Membership ends today"
            : `Membership ends in ${days} ${days === 1 ? "day" : "days"}`,
        tone: "attention",
      });
    }
  }
  if (isLapsing(input)) {
    items.push({
      kind: "lapsing",
      label:
        input.daysQuiet !== undefined && input.daysQuiet > 0
          ? `Quiet for ${input.daysQuiet} days`
          : "Lapsing",
      // Information, not a failure: neutral (danger is for a failed payment).
      tone: "neutral",
    });
  }
  return items;
}

/** What a person is to the club, in plain words. */
export function relationLine(
  row: Pick<
    PersonRow,
    | "isJunior"
    | "isGuardian"
    | "plan"
    | "planStatus"
    | "memberSince"
    | "guardianName"
    | "guardianState"
    | "status"
  >,
  timeZone: string,
): string {
  const since = monthYear(row.memberSince, timeZone);
  if (row.status === "pending") return "Invited, not joined yet";
  if (row.isJunior) {
    const guardian = row.guardianName
      ? `junior of ${row.guardianName}`
      : row.guardianState === "verified"
        ? "junior, guardian confirmed"
        : "junior, guardian not confirmed";
    return hasActivePlan(row.plan, row.planStatus)
      ? `${capitalise(guardian)} · ${row.plan}`
      : capitalise(guardian);
  }
  if (hasActivePlan(row.plan, row.planStatus)) {
    return `Member since ${since} · ${row.plan}`;
  }
  if (row.isGuardian) return `Parent or guardian since ${since}`;
  if (row.plan) return `Player since ${since} · ${row.plan} ended`;
  return `Player since ${since}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface RowContext {
  readonly now: Date;
  readonly timeZone: string;
  readonly canSeePayments: boolean;
  /** participants[].guardianStatus by person. */
  readonly guardianStatus?: ReadonlyMap<
    string,
    "not-required" | "pending" | "verified"
  >;
  /** messageRecipients[].verifiedGuardianCount by person. */
  readonly verifiedGuardians?: ReadonlyMap<string, number>;
  /** The guardian named on the club's invitation, by the junior's name. */
  readonly guardianNames?: ReadonlyMap<string, string>;
}

export function guardianStateOf(
  personId: string,
  context: Pick<RowContext, "guardianStatus" | "verifiedGuardians">,
): GuardianState {
  if ((context.verifiedGuardians?.get(personId) ?? 0) > 0) return "verified";
  const status = context.guardianStatus?.get(personId);
  if (status === "verified") return "verified";
  if (status === "pending") return "pending";
  return "none";
}

/** A workspace person as the row the viewer may receive. */
export function toPersonRow(
  person: WorkspacePerson,
  context: RowContext,
): PersonRow {
  const isJunior = person.isMinor;
  const guardianState = isJunior
    ? guardianStateOf(person.personId, context)
    : undefined;
  const base = {
    isJunior,
    isGuardian: person.roles.includes("guardian"),
    plan: person.membershipName,
    planStatus: person.membershipStatus,
    memberSince: person.joinedAt,
    guardianName: isJunior
      ? context.guardianNames?.get(person.displayName.toLocaleLowerCase())
      : undefined,
    guardianState,
    status: person.status,
  };
  const daysQuiet = person.churnRisk.daysSinceActivity;
  return {
    id: person.personId,
    name: person.displayName,
    avatarUrl: person.avatarUrl,
    isPlayer: person.roles.includes("player"),
    // A junior's contact is the guardian: never carried for the child.
    email: isJunior ? undefined : person.email,
    phone: isJunior ? undefined : person.phoneE164,
    credits: person.creditBalance,
    lastSeenAt: person.churnRisk.lastActivityAt,
    daysQuiet,
    upcoming: person.upcomingCount,
    churn: person.churnRisk.level,
    spendMinor: context.canSeePayments ? person.lifetimeSpendMinor : undefined,
    attention: attentionFor({
      isJunior,
      membershipStatus: person.membershipStatus,
      guardianState,
      daysQuiet,
      upcoming: person.upcomingCount,
      churn: person.churnRisk.level,
      canSeePayments: context.canSeePayments,
      now: context.now,
    }),
    relation: relationLine(base, context.timeZone),
    ...base,
  };
}

// ---------------------------------------------------------------- segments

export type PeopleSegment =
  | "everyone"
  | "members"
  | "juniors"
  | "guardians"
  | "new"
  | "lapsing"
  | "attention"
  | "upcoming"
  | "credits";

export const peopleSegments: readonly {
  readonly id: PeopleSegment;
  readonly label: string;
}[] = [
  { id: "everyone", label: "Everyone" },
  { id: "members", label: "Members" },
  { id: "juniors", label: "Juniors" },
  { id: "guardians", label: "Parents and guardians" },
  { id: "new", label: "New this month" },
  { id: "lapsing", label: "Lapsing" },
  { id: "attention", label: "Needs attention" },
  { id: "upcoming", label: "Coming up" },
  { id: "credits", label: "Has credits" },
];

const segmentIds = new Set<string>(peopleSegments.map((segment) => segment.id));

/** The legacy filter ids, so an old link still lands on its view. */
const legacySegments: Readonly<Record<string, PeopleSegment>> = {
  all: "everyone",
  minors: "juniors",
  credits: "credits",
  upcoming: "upcoming",
};

export function segmentFromParam(value: string | undefined): PeopleSegment {
  if (!value) return "everyone";
  if (segmentIds.has(value)) return value as PeopleSegment;
  return legacySegments[value] ?? "everyone";
}

export interface ListState {
  readonly segment: PeopleSegment;
  readonly query: string;
}

export function listStateFromParams(params: {
  readonly segment?: string | readonly string[];
  readonly q?: string | readonly string[];
}): ListState {
  const one = (value: string | readonly string[] | undefined) =>
    Array.isArray(value) ? value[0] : (value as string | undefined);
  return {
    segment: segmentFromParam(one(params.segment)),
    query: (one(params.q) ?? "").trim().slice(0, 120),
  };
}

/** The shareable address of a list state: `/people?segment=juniors&q=ava`. */
export function listHref(state: ListState, base = "/people"): string {
  const search = new URLSearchParams();
  if (state.segment !== "everyone") search.set("segment", state.segment);
  if (state.query.trim()) search.set("q", state.query.trim());
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}

function sameMonth(iso: string, now: Date, timeZone: string): boolean {
  const key = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone,
    }).format(date);
  return key(new Date(iso)) === key(now);
}

export function inSegment(
  row: PersonRow,
  segment: PeopleSegment,
  now: Date,
  timeZone: string,
): boolean {
  switch (segment) {
    case "everyone":
      return true;
    case "members":
      return hasActivePlan(row.plan, row.planStatus);
    case "juniors":
      return row.isJunior;
    case "guardians":
      return row.isGuardian;
    case "new":
      return sameMonth(row.memberSince, now, timeZone);
    case "lapsing":
      return isLapsing(row);
    case "attention":
      return row.attention.length > 0;
    case "upcoming":
      return row.upcoming > 0;
    case "credits":
      return row.credits > 0;
  }
}

export function segmentCounts(
  rows: readonly PersonRow[],
  now: Date,
  timeZone: string,
): Record<PeopleSegment, number> {
  const counts = Object.fromEntries(
    peopleSegments.map((segment) => [segment.id, 0]),
  ) as Record<PeopleSegment, number>;
  for (const row of rows) {
    for (const segment of peopleSegments) {
      if (inSegment(row, segment.id, now, timeZone)) counts[segment.id] += 1;
    }
  }
  return counts;
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Name, email or phone (any formatting); a junior matches by name only. */
export function matchesPersonQuery(row: PersonRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  if (row.name.toLocaleLowerCase().includes(needle)) return true;
  if (row.email?.toLocaleLowerCase().includes(needle)) return true;
  const digits = digitsOf(needle);
  if (digits.length >= 3 && row.phone && digitsOf(row.phone).includes(digits))
    return true;
  return false;
}

/** Most urgent first, then by name. */
export function sortRows(rows: readonly PersonRow[]): PersonRow[] {
  return [...rows].sort((a, b) => {
    const urgent = b.attention.length - a.attention.length;
    if (urgent !== 0) return urgent;
    return a.name.localeCompare(b.name);
  });
}

export function filterRows(
  rows: readonly PersonRow[],
  state: ListState,
  now: Date,
  timeZone: string,
): PersonRow[] {
  return rows.filter(
    (row) =>
      inSegment(row, state.segment, now, timeZone) &&
      matchesPersonQuery(row, state.query),
  );
}

// ---------------------------------------------------------------- windowing

/** Lists longer than this render only the rows in view. */
export const WINDOW_THRESHOLD = 120;

export function visibleRange(input: {
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly rowHeight: number;
  readonly count: number;
  readonly overscan?: number;
}): { readonly start: number; readonly end: number } {
  const overscan = input.overscan ?? 8;
  if (input.count === 0 || input.rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, input.scrollTop) / input.rowHeight);
  const inView = Math.ceil(input.viewportHeight / input.rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(input.count, first + inView + overscan);
  return { start, end: Math.max(start, end) };
}

// ---------------------------------------------------------------- next best action

export interface PlanFact {
  readonly name: string;
  readonly status: string;
  readonly currentPeriodEndsAt?: string;
  readonly cancelAtPeriodEnd: boolean;
}

export interface CreditFact {
  readonly remainingCredits: number;
  readonly expiresAt?: string;
  readonly status: string;
}

export type NextAction =
  | {
      readonly id: string;
      readonly title: string;
      readonly detail: string;
      readonly kind: "draft";
      /** The draft Inbox receives; nothing is sent from People. */
      readonly draft: {
        readonly subject: string;
        readonly body: string;
        readonly channel: "email" | "sms";
      };
      readonly verb: string;
    }
  | {
      readonly id: string;
      readonly title: string;
      readonly detail: string;
      readonly kind: "link";
      readonly href: string;
      readonly verb: string;
    }
  | {
      readonly id: "nothing";
      readonly title: string;
      readonly detail: string;
      readonly kind: "none";
    };

export interface NextActionInput {
  readonly personId: string;
  readonly name: string;
  readonly isJunior: boolean;
  readonly guardianState?: GuardianState;
  readonly email?: string;
  readonly phone?: string;
  readonly membershipStatus?: string;
  readonly plans: readonly PlanFact[];
  readonly credits: readonly CreditFact[];
  readonly upcoming: number;
  readonly daysQuiet?: number;
  readonly churn: ChurnLevel;
  readonly canSeePayments: boolean;
  readonly canDraft: boolean;
  readonly clubName: string;
  readonly timeZone: string;
  readonly now: Date;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function endingPlan(input: {
  readonly plans: readonly PlanFact[];
  readonly now: Date;
}) {
  for (const plan of input.plans) {
    if (!plan.currentPeriodEndsAt || endedStatuses.has(plan.status)) continue;
    if (!plan.cancelAtPeriodEnd) continue;
    const days = daysBetween(input.now, new Date(plan.currentPeriodEndsAt));
    if (days >= 0 && days <= ENDING_WITHIN_DAYS) return { plan, days };
  }
  return undefined;
}

/** When the plan stops, for "what needs attention" on a person's page. */
export function planEndsAt(
  plans: readonly PlanFact[],
  now: Date,
): string | undefined {
  return endingPlan({ plans, now })?.plan.currentPeriodEndsAt;
}

function expiringCredits(input: NextActionInput) {
  let total = 0;
  let soonest: string | undefined;
  for (const grant of input.credits) {
    if (!grant.expiresAt || grant.remainingCredits <= 0) continue;
    if (grant.status !== "active") continue;
    const days = daysBetween(input.now, new Date(grant.expiresAt));
    if (days < 0 || days > ENDING_WITHIN_DAYS) continue;
    total += grant.remainingCredits;
    if (!soonest || grant.expiresAt < soonest) soonest = grant.expiresAt;
  }
  return total > 0 && soonest ? { total, expiresAt: soonest } : undefined;
}

/**
 * The one thing most worth doing for this person now. Anything that would
 * reach them is a draft for Inbox (reviewed and sent there), or for a junior
 * a hand-off to Inbox, which writes to the guardian. Never sent from here.
 */
export function nextBestAction(input: NextActionInput): NextAction {
  const first = firstName(input.name);
  const familyHref = `/people/${encodeURIComponent(input.personId)}/family`;
  const inboxHref = `/inbox?compose=new&recipient=${encodeURIComponent(input.personId)}`;
  const channel: "email" | "sms" = input.email ? "email" : "sms";
  const reachable = !input.isJunior && Boolean(input.email || input.phone);
  const draftOr = (
    id: string,
    title: string,
    detail: string,
    subject: string,
    body: string,
    verb: string,
  ): NextAction => {
    if (input.isJunior) {
      return {
        id,
        title,
        detail: `${detail} Inbox writes to ${first}'s guardian.`,
        kind: "link",
        href: inboxHref,
        verb: "Write to the family in Inbox",
      };
    }
    if (!reachable || !input.canDraft) {
      return {
        id,
        title,
        detail: reachable
          ? `${detail} Someone who can draft messages can prepare it.`
          : `${detail} Add an email or mobile number first.`,
        kind: "link",
        href: `/people/${encodeURIComponent(input.personId)}`,
        verb: "Open their details",
      };
    }
    return {
      id,
      title,
      detail,
      kind: "draft",
      draft: { subject, body, channel },
      verb,
    };
  };

  if (input.isJunior && input.guardianState !== "verified") {
    return {
      id: "guardian-consent",
      title: `No guardian has confirmed ${first} yet`,
      detail:
        "Until a guardian accepts, the club can't message, book or charge for this junior.",
      kind: "link",
      href: familyHref,
      verb: "Open the family",
    };
  }
  if (
    input.canSeePayments &&
    input.membershipStatus &&
    failedStatuses.has(input.membershipStatus)
  ) {
    return draftOr(
      "payment-failed",
      `${first}'s membership payment failed`,
      "Ask them to update how they pay. The draft waits in Inbox for you to review.",
      `Your ${input.clubName} membership payment`,
      `Hi ${first}, your last membership payment to ${input.clubName} didn't go through. You can update how you pay in the Duna app, or reply here and we'll help.`,
      "Draft a payment reminder",
    );
  }
  const ending = endingPlan(input);
  if (ending) {
    const when =
      ending.days === 0
        ? "today"
        : `in ${ending.days} ${ending.days === 1 ? "day" : "days"}`;
    const date = shortDate(
      ending.plan.currentPeriodEndsAt!,
      input.timeZone,
      input.now,
    );
    return draftOr(
      "membership-ending",
      `Membership ends ${when}: send a renewal reminder`,
      `${ending.plan.name} stops on ${date}. The reminder is a draft in Inbox until you send it.`,
      `Your ${ending.plan.name} ends on ${date}`,
      `Hi ${first}, your ${ending.plan.name} at ${input.clubName} ends on ${date}. If you'd like to keep playing with us, you can renew in the Duna app or reply here.`,
      "Draft a renewal reminder",
    );
  }
  const expiring = expiringCredits(input);
  if (expiring) {
    const date = shortDate(expiring.expiresAt, input.timeZone, input.now);
    return draftOr(
      "credits-expiring",
      `${expiring.total} ${expiring.total === 1 ? "credit expires" : "credits expire"} on ${date}`,
      "Remind them to use their credits before they lapse.",
      `Your credits at ${input.clubName}`,
      `Hi ${first}, you have ${expiring.total} ${expiring.total === 1 ? "credit" : "credits"} at ${input.clubName} that expire on ${date}. Book a session in the Duna app to use them.`,
      "Draft a credits reminder",
    );
  }
  if (isLapsing(input)) {
    const quiet =
      input.daysQuiet !== undefined && input.daysQuiet > 0
        ? `Quiet for ${input.daysQuiet} days`
        : "Nothing booked lately";
    return draftOr(
      "check-in",
      `${quiet}: send a check-in`,
      "A short personal note brings people back more often than a campaign.",
      `We miss you at ${input.clubName}`,
      `Hi ${first}, it's been a while since we've seen you at ${input.clubName}. Is there a time that works for you to come back?`,
      "Draft a check-in",
    );
  }
  return {
    id: "nothing",
    title: "Nothing needs you",
    detail:
      input.upcoming > 0
        ? `${first} has ${input.upcoming} ${input.upcoming === 1 ? "session" : "sessions"} coming up.`
        : `${first} is up to date.`,
    kind: "none",
  };
}

// ---------------------------------------------------------------- duplicates

export interface DuplicateCandidate {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly isJunior: boolean;
  readonly isGuardian?: boolean;
}

export interface DuplicateMatch {
  readonly id: string;
  readonly name: string;
  readonly strength: "same-contact" | "same-name" | "similar-name";
  /** Why, in words; never quotes a junior's contact. */
  readonly reason: string;
}

export function normaliseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function normaliseEmail(email: string | undefined): string | undefined {
  const value = email?.trim().toLocaleLowerCase();
  return value ? value : undefined;
}

/** A number in E.164, or undefined: "+1 (310) 555-0121" and "3105550121" agree. */
export function normalisePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  const digits = digitsOf(trimmed);
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length]!;
}

function similarNames(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5) return false;
  const sorted = (value: string) => value.split(" ").sort().join(" ");
  if (sorted(a) === sorted(b)) return true;
  return editDistance(a, b) <= 1;
}

/**
 * People who may already be this person, with the reason in words. A
 * junior is matched by name only: their family shares the guardian's
 * contact, so a shared contact is not evidence, and is never quoted.
 */
export function findDuplicates(
  candidate: Omit<DuplicateCandidate, "id"> & { readonly id?: string },
  people: readonly DuplicateCandidate[],
): DuplicateMatch[] {
  const name = normaliseName(candidate.name);
  const email = candidate.isJunior
    ? undefined
    : normaliseEmail(candidate.email);
  const phone = candidate.isJunior
    ? undefined
    : normalisePhone(candidate.phone);
  const matches: DuplicateMatch[] = [];
  for (const person of people) {
    if (person.id === candidate.id) continue;
    const contactComparable = !person.isJunior && !candidate.isJunior;
    if (contactComparable && email && normaliseEmail(person.email) === email) {
      matches.push({
        id: person.id,
        name: person.name,
        strength: "same-contact",
        reason: `${person.name} already uses ${email}.`,
      });
      continue;
    }
    if (contactComparable && phone && normalisePhone(person.phone) === phone) {
      matches.push({
        id: person.id,
        name: person.name,
        strength: "same-contact",
        reason: `${person.name} already uses this mobile number.`,
      });
      continue;
    }
    const other = normaliseName(person.name);
    if (!name || !other) continue;
    if (other === name) {
      matches.push({
        id: person.id,
        name: person.name,
        strength: "same-name",
        reason: `${person.name} has the same name${
          person.isJunior ? " (a junior)" : ""
        }.`,
      });
    } else if (similarNames(name, other)) {
      matches.push({
        id: person.id,
        name: person.name,
        strength: "similar-name",
        reason: `${person.name} has a very similar name.`,
      });
    }
  }
  const order = { "same-contact": 0, "same-name": 1, "similar-name": 2 };
  return matches.sort((a, b) => order[a.strength] - order[b.strength]);
}

/**
 * Pairs in the list that look like one person twice (for the merge prompt):
 * the same email or mobile between adults, or the same name with the same
 * age group. Linear in the list (grouped by key), so it runs on thousands.
 * A junior and the guardian who holds their contact are a family, never a
 * duplicate.
 */
export function findDuplicatePairs(people: readonly DuplicateCandidate[]): {
  readonly a: DuplicateCandidate;
  readonly b: DuplicateCandidate;
  readonly reason: string;
}[] {
  const groups = new Map<string, DuplicateCandidate[]>();
  const add = (key: string | undefined, person: DuplicateCandidate) => {
    if (!key) return;
    const group = groups.get(key);
    if (group) group.push(person);
    else groups.set(key, [person]);
  };
  for (const person of people) {
    if (!person.isJunior) {
      add(
        normaliseEmail(person.email) && `email:${normaliseEmail(person.email)}`,
        person,
      );
      add(
        normalisePhone(person.phone) && `phone:${normalisePhone(person.phone)}`,
        person,
      );
    }
    const name = normaliseName(person.name);
    add(name && `name:${person.isJunior ? "j" : "a"}:${name}`, person);
  }
  const seen = new Set<string>();
  const pairs: {
    a: DuplicateCandidate;
    b: DuplicateCandidate;
    reason: string;
  }[] = [];
  for (const [key, group] of groups) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const id = [a.id, b.id].sort().join(":");
        if (seen.has(id)) continue;
        seen.add(id);
        pairs.push({
          a,
          b,
          reason: key.startsWith("email:")
            ? `Both use ${key.slice(6)}.`
            : key.startsWith("phone:")
              ? "Both use the same mobile number."
              : "Same name.",
        });
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------- export

export interface ExportColumn {
  readonly key: string;
  readonly header: string;
}

/**
 * The columns an export has. Health values are never a column; money only
 * for roles that read payments; a junior's row leaves contact empty and
 * names the guardian instead.
 */
export function exportColumns(options: {
  readonly canSeePayments: boolean;
}): ExportColumn[] {
  return [
    { key: "name", header: "Name" },
    { key: "relation", header: "To the club" },
    { key: "junior", header: "Junior" },
    { key: "email", header: "Email" },
    { key: "phone", header: "Mobile" },
    { key: "guardian", header: "Guardian" },
    { key: "plan", header: "Plan" },
    { key: "planStatus", header: "Plan status" },
    { key: "memberSince", header: "Joined" },
    { key: "lastSeen", header: "Last seen" },
    { key: "upcoming", header: "Sessions coming up" },
    { key: "credits", header: "Credits" },
    { key: "attention", header: "Needs attention" },
    ...(options.canSeePayments
      ? [{ key: "spend", header: "Lifetime spend (minor units)" }]
      : []),
  ];
}

export function exportRow(
  row: PersonRow,
  columns: readonly ExportColumn[],
): string[] {
  const values: Record<string, string> = {
    name: row.name,
    relation: row.relation,
    junior: row.isJunior ? "Yes" : "No",
    email: row.isJunior ? "" : (row.email ?? ""),
    phone: row.isJunior ? "" : (row.phone ?? ""),
    guardian: row.isJunior
      ? (row.guardianName ??
        (row.guardianState === "verified"
          ? "Guardian confirmed"
          : "No guardian confirmed"))
      : "",
    plan: row.plan ?? "",
    planStatus: row.planStatus ?? "",
    memberSince: row.memberSince.slice(0, 10),
    lastSeen: row.lastSeenAt?.slice(0, 10) ?? "",
    upcoming: String(row.upcoming),
    credits: String(row.credits),
    attention: row.attention.map((item) => item.label).join("; "),
    spend: row.spendMinor === undefined ? "" : String(row.spendMinor),
  };
  return columns.map((column) => values[column.key] ?? "");
}

function csvCell(value: string): string {
  // A leading formula character is neutralised so a spreadsheet won't run it.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// ---------------------------------------------------------------- import

/**
 * What a column can hold: the import procedure's own field names
 * (`peopleImportFieldSchema`; a unit test keeps them equal), plus "ignore".
 */
export type ImportField =
  | "name"
  | "givenName"
  | "familyName"
  | "email"
  | "phoneE164"
  | "birthDate"
  | "isMinor"
  | "relationship"
  | "guardianName"
  | "guardianEmail"
  | "guardianPhoneE164"
  | "tags"
  | "ignore";

export const importFieldLabels: Readonly<Record<ImportField, string>> = {
  name: "Full name",
  givenName: "First name",
  familyName: "Last name",
  email: "Email",
  phoneE164: "Mobile",
  birthDate: "Date of birth",
  isMinor: "Junior (yes or no)",
  relationship: "Guardian's relationship",
  guardianName: "Guardian name",
  guardianEmail: "Guardian email",
  guardianPhoneE164: "Guardian mobile",
  tags: "Tags",
  ignore: "Don't import",
};

/** The import procedure's bounds (`PEOPLE_IMPORT_MAX_ROWS`; tested equal). */
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** The procedure's limits on one column name and one cell. */
export const IMPORT_MAX_HEADER = 80;
export const IMPORT_MAX_CELL = 400;

/** RFC 4180 CSV: quoted cells, escaped quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

const headerWords: readonly [ImportField, RegExp][] = [
  ["guardianEmail", /^(guardian|parent).*(e\s?mail)/],
  ["guardianPhoneE164", /^(guardian|parent).*(phone|mobile|cell)/],
  ["relationship", /relationship|relation/],
  ["guardianName", /^(guardian|parent)/],
  ["givenName", /^(first|given)\s*name$|^first$/],
  ["familyName", /^(last|family|sur)\s*name$|^surname$|^last$/],
  ["name", /^(full\s*)?name$|^member$|^player$|^person$/],
  ["email", /e\s?mail/],
  ["phoneE164", /phone|mobile|cell/],
  ["birthDate", /birth|dob/],
  ["isMinor", /junior|minor|under\s*18|child/],
  ["tags", /^tags?$|^labels?$|^groups?$/],
];

/** A first guess at what each column holds, from its header. */
export function guessMapping(headers: readonly string[]): ImportField[] {
  const used = new Set<ImportField>();
  return headers.map((header) => {
    const text = header.trim().toLocaleLowerCase().replace(/[_-]+/g, " ");
    for (const [field, pattern] of headerWords) {
      if (pattern.test(text) && !used.has(field)) {
        used.add(field);
        return field;
      }
    }
    return "ignore";
  });
}

/** Whether the mapping can import anything: a name, and some contact. */
export function mappingProblems(mapping: readonly ImportField[]): string[] {
  const has = (field: ImportField) => mapping.includes(field);
  const problems: string[] = [];
  if (!has("name") && !has("givenName"))
    problems.push("Choose the column with each person's name.");
  if (
    !has("email") &&
    !has("phoneE164") &&
    !has("guardianEmail") &&
    !has("guardianPhoneE164")
  )
    problems.push("Choose the column with an email or a mobile number.");
  const counts = new Map<ImportField, number>();
  for (const field of mapping) {
    if (field === "ignore") continue;
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  for (const [field, count] of counts) {
    if (count > 1)
      problems.push(
        `${importFieldLabels[field]} is chosen for ${count} columns.`,
      );
  }
  return problems;
}

/**
 * The file as the import procedure takes it: each row as column → cell,
 * and each Duna field → its column. Column names are made unique (an empty
 * or repeated header becomes "Column 3"). Answers a problem in words when
 * the file can't be sent as it is (a cell or header over the limits).
 */
export function importRequest(
  table: readonly (readonly string[])[],
  mapping: readonly ImportField[],
):
  | {
      readonly ok: true;
      readonly rows: Record<string, string>[];
      readonly mapping: Partial<Record<Exclude<ImportField, "ignore">, string>>;
    }
  | { readonly ok: false; readonly problem: string } {
  const [header = [], ...body] = table;
  const seen = new Set<string>();
  const names = header.map((raw, index) => {
    let name = raw.trim().slice(0, IMPORT_MAX_HEADER) || `Column ${index + 1}`;
    if (seen.has(name)) name = `Column ${index + 1}`;
    seen.add(name);
    return name;
  });
  const fields: Partial<Record<Exclude<ImportField, "ignore">, string>> = {};
  mapping.forEach((field, index) => {
    if (field !== "ignore" && names[index]) fields[field] = names[index];
  });
  const rows: Record<string, string>[] = [];
  for (const [line, cells] of body.entries()) {
    const row: Record<string, string> = {};
    for (const [index, name] of names.entries()) {
      if (mapping[index] === "ignore" || mapping[index] === undefined) continue;
      const value = (cells[index] ?? "").trim();
      if (value.length > IMPORT_MAX_CELL) {
        return {
          ok: false,
          problem: `Row ${line + 1}, ${name}: a cell is longer than ${IMPORT_MAX_CELL} characters. Shorten it and choose the file again.`,
        };
      }
      row[name] = value;
    }
    rows.push(row);
  }
  return { ok: true, rows, mapping: fields };
}

// ---------------------------------------------------------------- tags

/** The tag procedure's bounds (`PEOPLE_BULK_TAG_MAX_PEOPLE`; tested equal). */
export const BULK_TAG_MAX = 200;
export const NOTE_MAX_LENGTH = 4000;

// ---------------------------------------------------------------- merge

export interface MergeSide {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly isJunior: boolean;
  readonly plan?: string;
  readonly credits: number;
  readonly memberSince: string;
  readonly upcoming: number;
}

/**
 * Why two records obviously can't be merged, before asking Duna (which
 * checks every rule itself in `mergePreview`): the same record twice, or a
 * junior and an adult.
 */
export function mergeBlock(
  keep: Pick<MergeSide, "id" | "isJunior">,
  merge: Pick<MergeSide, "id" | "isJunior">,
): string | undefined {
  if (keep.id === merge.id) return "Choose two different people.";
  if (keep.isJunior !== merge.isJunior)
    return "A junior and an adult can't be merged: they are different people, and the adult may be the junior's guardian.";
  return undefined;
}

/** How many rows of each kind a merge moves, in words (only non-zero kinds). */
export const mergeMoveWords: Readonly<
  Record<
    | "bookings"
    | "attendance"
    | "memberships"
    | "credits"
    | "payments"
    | "waivers"
    | "familyLinks"
    | "notes"
    | "tags",
    readonly [string, string]
  >
> = {
  bookings: ["booking", "bookings"],
  attendance: ["attendance record", "attendance records"],
  memberships: ["membership", "memberships"],
  credits: ["credit wallet", "credit wallets"],
  payments: ["payment", "payments"],
  waivers: ["waiver signature", "waiver signatures"],
  familyLinks: ["family link", "family links"],
  notes: ["note", "notes"],
  tags: ["tag", "tags"],
};

export function mergeMoves(
  moves: Partial<Record<keyof typeof mergeMoveWords, number>>,
): string[] {
  return (Object.keys(mergeMoveWords) as (keyof typeof mergeMoveWords)[])
    .filter((kind) => (moves[kind] ?? 0) > 0)
    .map((kind) => {
      const count = moves[kind]!;
      const [one, many] = mergeMoveWords[kind];
      return `${count} ${count === 1 ? one : many}`;
    });
}

// ---------------------------------------------------------------- bookings

/** A booking's state in the words the rest of HQ uses. */
export function bookingWords(input: {
  readonly registrationStatus: string;
  readonly attendanceStatus?: string;
  readonly startsAt: string;
  readonly now: Date;
}): {
  readonly label: string;
  readonly tone: "positive" | "warning" | "neutral" | "info";
} {
  if (input.registrationStatus === "refunded")
    return { label: "Refunded", tone: "neutral" };
  if (
    input.registrationStatus === "cancelled" ||
    input.attendanceStatus === "cancelled"
  )
    return { label: "Cancelled", tone: "neutral" };
  if (
    input.attendanceStatus === "attended" ||
    input.registrationStatus === "checked-in"
  )
    return { label: "Attended", tone: "positive" };
  if (input.attendanceStatus === "no-show")
    return { label: "No-show", tone: "warning" };
  if (input.registrationStatus === "waitlisted")
    return { label: "Waitlist", tone: "info" };
  if (new Date(input.startsAt) > input.now)
    return { label: "Booked", tone: "info" };
  return { label: "Not marked", tone: "neutral" };
}

// ---------------------------------------------------------------- membership card

export function cardStatusOf(
  planStatus: string | undefined,
): "active" | "paused" | "expired" | "pending" {
  if (!planStatus) return "expired";
  if (planStatus === "paused") return "paused";
  if (endedStatuses.has(planStatus)) return "expired";
  if (planStatus === "pending" || planStatus === "incomplete") return "pending";
  return "active";
}

// ---------------------------------------------------------------- redaction

/**
 * A member profile cut to what the viewer may receive, on the server,
 * before any part of it is rendered or handed to a client component: no
 * health marker (values come only from the Health tab's read); no money (orders,
 * refunds, prices, spend, purchase lines in the timeline) unless the viewer
 * reads payments; never a junior's own contact. Zeroed money is never shown:
 * the screens only render money for roles that read payments.
 */
export function redactProfile(
  profile: OperatorMemberProfile,
  permissions: { readonly canSeePayments: boolean },
): OperatorMemberProfile {
  const isJunior = profile.relationship.isMinor;
  const relationship = {
    ...profile.relationship,
    email: isJunior ? undefined : profile.relationship.email,
    phoneE164: isJunior ? undefined : profile.relationship.phoneE164,
    ...(permissions.canSeePayments
      ? {}
      : {
          lifetimeSpendMinor: undefined,
          purchaseCount: 0,
          recentPurchases: [],
        }),
  };
  return {
    ...profile,
    relationship,
    // Health values never arrive here (they come only from the Health
    // service's recording read on the Health tab); the deprecated marker is
    // dropped so nothing about health reaches a page that doesn't need it.
    health: undefined,
    purchases: permissions.canSeePayments ? profile.purchases : [],
    plans: permissions.canSeePayments
      ? profile.plans
      : profile.plans.map((plan) => ({ ...plan, priceMinor: 0 })),
    creditGrants: permissions.canSeePayments
      ? profile.creditGrants
      : profile.creditGrants.map((grant) => ({
          ...grant,
          initialValueMinor: undefined,
          remainingValueMinor: undefined,
        })),
    sessions: permissions.canSeePayments
      ? profile.sessions
      : profile.sessions.map((session) => ({ ...session, orderId: undefined })),
    timeline: permissions.canSeePayments
      ? profile.timeline
      : profile.timeline.filter(
          (item) => item.kind !== "purchase" && item.kind !== "refund",
        ),
  };
}
