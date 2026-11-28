/**
 * The Pro roster and a person's page, as data (M-R4, owner's point 10).
 * Pure and unit-tested (`people-model.test.ts`): what each row says, which
 * segment it falls in, how a Sand Rating is drawn, and the next best action
 * on a person's page. Screens only lay this out.
 *
 * Sources: `operator.members` (names, handles, roles, ratings, avatars),
 * `operator.workspace` → `people` (plan, credits, upcoming, care signal)
 * and `calendar.entries` (the next session a person is booked on).
 */

export interface MemberInput {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly initials: string;
  readonly roles: readonly string[];
  readonly isMinor?: boolean;
  readonly guardianIds?: readonly string[];
  readonly avatarUrl?: string;
  readonly rating: {
    readonly display: number;
    readonly confidence: "Provisional" | "Developing" | "Reliable" | "Locked";
  };
}

export interface RelationshipInput {
  readonly personId: string;
  readonly avatarUrl?: string;
  readonly isMinor: boolean;
  readonly roles: readonly string[];
  readonly status: "active" | "inactive" | "pending";
  readonly membershipName?: string;
  readonly creditBalance: number;
  readonly upcomingCount: number;
  readonly churnRisk: {
    readonly level: "low" | "watch" | "high";
    readonly reasons: readonly string[];
    readonly daysSinceActivity?: number;
  };
}

export interface CalendarEntryInput {
  readonly id: string;
  readonly sourceType: string;
  readonly title: string;
  readonly startsAt: string;
  readonly status: string;
  readonly attendees: readonly { readonly personId?: string }[];
}

export type Segment =
  | "all"
  | "players"
  | "upcoming"
  | "credits"
  | "attention"
  | "juniors"
  | "staff";

export const SEGMENTS: readonly {
  readonly key: Segment;
  readonly label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "players", label: "Players" },
  { key: "upcoming", label: "Upcoming" },
  { key: "credits", label: "Credits" },
  { key: "attention", label: "Needs attention" },
  { key: "juniors", label: "Juniors" },
  { key: "staff", label: "Staff" },
];

const STAFF_ROLES = new Set([
  "owner",
  "manager",
  "coach",
  "front-desk",
  "scorekeeper",
  "accountant",
]);

export type ChipTone = "attention" | "info" | "neutral";

export interface RosterRow {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly avatarUrl?: string;
  /** The one fact that matters next, one line. */
  readonly fact: string;
  readonly factTone: "text-2" | "attention";
  /** A small status chip, only when it says something (never "Active"). */
  readonly chip: { readonly label: string; readonly tone: ChipTone } | null;
  /** The Sand Rating as the kit draws it: null is provisional (a dash). */
  readonly rating: {
    readonly value: number | null;
    readonly reliability: number;
  };
  readonly segments: ReadonlySet<Segment>;
  readonly searchText: string;
  /** VoiceOver: the row in one sentence. */
  readonly accessibilityLabel: string;
}

/** The fact line's character budget at the default text size (one line, 343 pt). */
export const FACT_BUDGET = 40;
/** A chip's label budget (it never wraps or squeezes the name). */
export const CHIP_BUDGET = 12;

const RELIABILITY: Readonly<
  Record<MemberInput["rating"]["confidence"], number>
> = { Provisional: 0, Developing: 1, Reliable: 2, Locked: 3 };

/** The Sand Rating for the kit's ring: provisional has no number. */
export function ratingFor(rating: MemberInput["rating"]): RosterRow["rating"] {
  return {
    value: rating.confidence === "Provisional" ? null : rating.display,
    reliability: RELIABILITY[rating.confidence],
  };
}

/** Shortens to a budget at a word boundary when it can, with an ellipsis. */
export function fit(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > budget * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "Sat 9:00 AM" in the club's zone. */
export function shortWhen(
  iso: string,
  timeZone: string,
  locale = "en-US",
): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day} ${time}`;
}

/** The person's next booked session after `now`, from the calendar. */
export function nextSessionFor(
  personId: string,
  entries: readonly CalendarEntryInput[],
  now: number,
): CalendarEntryInput | undefined {
  return entries
    .filter(
      (entry) =>
        entry.status !== "cancelled" &&
        (entry.sourceType === "session" ||
          entry.sourceType === "booking" ||
          entry.sourceType === "pickup") &&
        Date.parse(entry.startsAt) > now &&
        entry.attendees.some((attendee) => attendee.personId === personId),
    )
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
}

export function rosterRow(
  member: MemberInput,
  relationship: RelationshipInput | undefined,
  options: {
    readonly next?: CalendarEntryInput;
    readonly timeZone: string;
    readonly locale?: string;
  },
): RosterRow {
  const minor = Boolean(member.isMinor ?? relationship?.isMinor);
  const roles = relationship?.roles.length ? relationship.roles : member.roles;
  const staff = roles.some((role) => STAFF_ROLES.has(role));
  const risk = relationship?.churnRisk.level ?? "low";
  const credits = relationship?.creditBalance ?? 0;
  const upcoming = relationship?.upcomingCount ?? 0;

  let fact: string;
  let factTone: RosterRow["factTone"] = "text-2";
  if (risk === "high") {
    factTone = "attention";
    const days = relationship?.churnRisk.daysSinceActivity;
    fact =
      days !== undefined
        ? `Needs attention · quiet ${days} days`
        : "Needs attention";
  } else if (options.next) {
    const when = shortWhen(
      options.next.startsAt,
      options.timeZone,
      options.locale,
    );
    const title = options.next.title.replace(/ · court booking$/, "");
    fact = `${when} · ${fit(title, Math.max(8, FACT_BUDGET - when.length - 3))}`;
  } else if (relationship?.status === "pending") {
    fact = "Invited · hasn't joined yet";
  } else if (relationship?.membershipName) {
    const plan = relationship.membershipName;
    const tail = credits > 0 ? ` · ${plural(credits, "credit")}` : "";
    fact = `${fit(plan, FACT_BUDGET - tail.length)}${tail}`;
  } else if (credits > 0) {
    fact = `${plural(credits, "credit")} left · no plan`;
  } else if (minor) {
    fact = "Junior · their guardian gets updates";
  } else if (staff && !roles.includes("player")) {
    fact = fit(
      roles
        .filter((role) => STAFF_ROLES.has(role))
        .map(roleWord)
        .join(", "),
      FACT_BUDGET,
    );
  } else {
    fact = "No plan or credits yet";
  }

  let chip: RosterRow["chip"] = null;
  if (relationship?.status === "pending")
    chip = { label: "Invited", tone: "info" };
  else if (risk === "high") chip = { label: "Follow up", tone: "attention" };
  else if (minor) chip = { label: "Junior", tone: "neutral" };
  else if (staff)
    chip = {
      label: roleWord(roles.find((role) => STAFF_ROLES.has(role))!),
      tone: "neutral",
    };

  const segments = new Set<Segment>(["all"]);
  if (roles.includes("player")) segments.add("players");
  if (upcoming > 0 || options.next) segments.add("upcoming");
  if (credits > 0) segments.add("credits");
  if (risk !== "low") segments.add("attention");
  if (minor) segments.add("juniors");
  if (staff) segments.add("staff");

  const rating = ratingFor(member.rating);
  return {
    id: member.id,
    name: member.displayName,
    initials: member.initials || initialsFrom(member.displayName),
    ...((member.avatarUrl ?? relationship?.avatarUrl)
      ? { avatarUrl: member.avatarUrl ?? relationship?.avatarUrl }
      : {}),
    fact,
    factTone,
    chip,
    rating,
    segments,
    searchText: [member.displayName, member.handle, ...roles]
      .join(" ")
      .toLowerCase(),
    accessibilityLabel: [
      member.displayName,
      chip?.label,
      fact,
      rating.value === null
        ? "Sand Rating provisional"
        : `Sand Rating ${rating.value.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join(". "),
  };
}

const ROLE_WORDS: Readonly<Record<string, string>> = {
  owner: "Owner",
  manager: "Manager",
  coach: "Coach",
  "front-desk": "Front desk",
  scorekeeper: "Scorekeeper",
  accountant: "Accountant",
  guardian: "Guardian",
  player: "Player",
};

export function roleWord(role: string): string {
  return ROLE_WORDS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export function initialsFrom(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}

/** Rows for a segment and a search, in name order; counts per segment. */
export function filterRoster(
  rows: readonly RosterRow[],
  segment: Segment,
  query: string,
): readonly RosterRow[] {
  const needle = query.trim().toLowerCase();
  return rows
    .filter((row) => row.segments.has(segment))
    .filter((row) => !needle || row.searchText.includes(needle))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function segmentCounts(
  rows: readonly RosterRow[],
): Readonly<Record<Segment, number>> {
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s.key, 0])) as Record<
    Segment,
    number
  >;
  for (const row of rows)
    for (const segment of row.segments) counts[segment] += 1;
  return counts;
}

/** A designed initials mark: one of four brand grounds, stable per person. */
export function avatarGround(id: string): 0 | 1 | 2 | 3 {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 4) as 0 | 1 | 2 | 3;
}

/* ------------------------------------------------------- person page */

export interface ProfileInput {
  readonly relationship: RelationshipInput & {
    readonly displayName: string;
    readonly email?: string;
  };
  readonly plans: readonly {
    readonly name: string;
    readonly status: string;
    readonly cancelAtPeriodEnd: boolean;
  }[];
  readonly creditGrants: readonly {
    readonly remainingCredits: number;
    readonly status: string;
  }[];
  readonly sessions: readonly {
    readonly title: string;
    readonly startsAt: string;
    readonly status: string;
  }[];
}

export interface HouseholdInput {
  readonly guardians: readonly {
    readonly displayName: string;
    readonly reviewStatus: "pending" | "verified" | "rejected";
    readonly contacted: boolean;
  }[];
}

export interface NextBestAction {
  readonly title: string;
  readonly text: string;
  readonly action: "message" | "collect" | "note" | null;
  readonly actionLabel?: string;
  readonly tone: "attention" | "info" | "positive";
}

/** The one thing worth doing for this person now. */
export function nextBestAction(
  profile: ProfileInput,
  household: HouseholdInput | null,
  now: number,
): NextBestAction {
  const person = profile.relationship;
  const first = person.displayName.split(/\s+/)[0] ?? person.displayName;
  if (
    person.isMinor &&
    household &&
    !household.guardians.some((g) => g.reviewStatus === "verified")
  ) {
    return {
      title: "Link a verified guardian",
      text: `${first} is a junior. Bookings, payments and messages need a verified guardian, and none is linked yet.`,
      action: null,
      tone: "attention",
    };
  }
  if (person.churnRisk.level === "high") {
    return {
      title: `Check in with ${first}`,
      text: person.churnRisk.reasons[0] ?? "They've gone quiet lately.",
      action: "message",
      actionLabel: "Message",
      tone: "attention",
    };
  }
  const activePlan = profile.plans.find(
    (plan) => plan.status === "active" || plan.status === "trialing",
  );
  const credits = profile.creditGrants
    .filter((grant) => grant.status === "active")
    .reduce((sum, grant) => sum + grant.remainingCredits, 0);
  const next = profile.sessions
    .filter(
      (session) =>
        session.status !== "cancelled" && Date.parse(session.startsAt) > now,
    )
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (activePlan?.cancelAtPeriodEnd) {
    return {
      title: `${activePlan.name} ends this period`,
      text: `${first} cancelled; it stops renewing at the end of the period. A word now often keeps a player.`,
      action: "message",
      actionLabel: "Message",
      tone: "info",
    };
  }
  if (!activePlan && credits === 0) {
    return {
      title: "No plan or credits",
      text: next
        ? `${first} is booked but has nothing to pay from. Collect for it here.`
        : `${first} has nothing to book with. Collect for a session or a pack.`,
      action: "collect",
      actionLabel: "Collect a payment",
      tone: "info",
    };
  }
  if (!activePlan && credits <= 1) {
    return {
      title: "Credits running out",
      text: `${first} has ${plural(credits, "credit")} left.`,
      action: "collect",
      actionLabel: "Sell credits",
      tone: "info",
    };
  }
  return {
    title: next ? `Next: ${next.title}` : "All set",
    text: next
      ? `${first} is booked. Notes you add show up for the next coach.`
      : `${first} has ${activePlan ? activePlan.name : plural(credits, "credit")}.`,
    action: "note",
    actionLabel: "Add a note",
    tone: "positive",
  };
}

/** The guardian rule in one sentence, for the Family section. */
export function guardianRule(
  name: string,
  isMinor: boolean,
  household: HouseholdInput | null,
): string {
  const first = name.split(/\s+/)[0] ?? name;
  if (!isMinor) return `${first} manages their own bookings and messages.`;
  const contact = household?.guardians.find(
    (g) => g.contacted && g.reviewStatus === "verified",
  );
  if (contact)
    return `Messages and receipts about ${first} go to ${contact.displayName}, their verified guardian.`;
  if (household?.guardians.some((g) => g.reviewStatus === "pending"))
    return `A guardian is waiting to be verified. Until then ${first} can't be booked or messaged directly.`;
  return `${first} is a junior: a verified guardian books, pays and gets every message. None is linked yet.`;
}
