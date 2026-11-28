import type {
  OperatorDivisionDetail,
  OperatorSessionDetail,
  OperatorWorkspace,
  TournamentCompetitionSnapshot,
} from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import type { IconName } from "@duna/ui/icons";
import { localDateOf, wallTimeToInstant } from "@duna/scheduling";

/**
 * Events (H-EVENTS): the pure part. Everything the list and the event
 * workspace draw is worked out here from the API's answers (or the demo
 * club's fixtures, which have the same shape), so the rules are tested
 * without React: which list an event is in, when it is live, the launch
 * steps of a tournament, the one next step, and the words for each state.
 */

export type EventKind = OperatorWorkspace["sessions"][number]["kind"];
export type EventStatus = OperatorWorkspace["sessions"][number]["status"];
type Session = OperatorWorkspace["sessions"][number];

/** The four lists of the Events page. */
export type EventSegment = "live" | "upcoming" | "past" | "drafts";

export const EVENT_SEGMENTS: readonly {
  readonly value: EventSegment;
  readonly label: string;
}[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live now" },
  { value: "past", label: "Past" },
  { value: "drafts", label: "Drafts" },
];

export const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  tournament: "Tournament",
  league: "League",
  clinic: "Clinic",
  "open-play": "Open play",
  "private-lesson": "Private lesson",
  "court-rental": "Court rental",
  pickup: "Pickup",
};

/** Each kind's icon. */
export const KIND_ICON: Readonly<Record<EventKind, IconName>> = {
  tournament: "tournament",
  league: "league",
  clinic: "clinic",
  "open-play": "court",
  "private-lesson": "lesson",
  "court-rental": "court",
  pickup: "ball",
};

/** The type filter: `?type=` takes a kind or the old type pages' slugs. */
const typeAliases: Readonly<Record<string, EventKind>> = {
  tournaments: "tournament",
  leagues: "league",
  clinics: "clinic",
  "open-play": "open-play",
  pickup: "pickup",
  pickups: "pickup",
  lessons: "private-lesson",
};

export function parseEventType(value: unknown): EventKind | undefined {
  if (typeof value !== "string") return undefined;
  if (value in KIND_LABEL) return value as EventKind;
  return typeAliases[value];
}

export function parseSegment(value: unknown): EventSegment | undefined {
  return EVENT_SEGMENTS.some((segment) => segment.value === value)
    ? (value as EventSegment)
    : undefined;
}

export type Tone =
  "neutral" | "positive" | "warning" | "danger" | "live" | "attention" | "info";

const competitionKinds = new Set<EventKind>(["tournament", "league"]);

export function isCompetitionKind(kind: string): boolean {
  return competitionKinds.has(kind as EventKind);
}

/** Registration has closed: by the director, by its time, or by going live. */
export function registrationClosed(
  session: Pick<Session, "status" | "registrationClosesAt">,
  nowMs: number,
): boolean {
  return (
    session.status === "live" ||
    session.status === "completed" ||
    session.status === "cancelled" ||
    Boolean(
      session.registrationClosesAt &&
      Date.parse(session.registrationClosesAt) <= nowMs,
    )
  );
}

/**
 * Live means play is in progress: the director set it live, or its time has
 * come and it was not cancelled. A weather hold during its time is live too
 * (people are on site), shown as a hold.
 */
export function isLiveNow(
  session: Pick<Session, "status" | "startsAt" | "endsAt">,
  nowMs: number,
): boolean {
  if (session.status === "draft" || session.status === "cancelled")
    return false;
  if (session.status === "completed") return false;
  if (session.status === "live") return Date.parse(session.endsAt) > nowMs;
  return (
    Date.parse(session.startsAt) <= nowMs && Date.parse(session.endsAt) > nowMs
  );
}

export function segmentOf(
  session: Pick<Session, "status" | "startsAt" | "endsAt">,
  nowMs: number,
): EventSegment {
  if (session.status === "draft") return "drafts";
  if (isLiveNow(session, nowMs)) return "live";
  if (
    session.status === "cancelled" ||
    session.status === "completed" ||
    Date.parse(session.endsAt) <= nowMs
  )
    return "past";
  return "upcoming";
}

/** The status in words, and its tone (Solar only while it is live). */
export function statusWords(
  session: Pick<
    Session,
    "status" | "startsAt" | "endsAt" | "registrationClosesAt"
  >,
  nowMs: number,
): { readonly label: string; readonly tone: Tone } {
  if (session.status === "draft") return { label: "Draft", tone: "neutral" };
  if (session.status === "cancelled")
    return { label: "Cancelled", tone: "danger" };
  if (isLiveNow(session, nowMs))
    return session.status === "weather-hold"
      ? { label: "Weather hold", tone: "warning" }
      : { label: "Live now", tone: "live" };
  if (session.status === "completed" || Date.parse(session.endsAt) <= nowMs)
    return { label: "Finished", tone: "neutral" };
  if (session.status === "weather-hold")
    return { label: "Weather hold", tone: "warning" };
  if (registrationClosed(session, nowMs))
    return { label: "Registration closed", tone: "info" };
  if (session.status === "registration-open")
    return { label: "Registration open", tone: "positive" };
  return { label: "Published", tone: "positive" };
}

/** "Sat, Dec 5 · 9:00 AM – 5:00 PM" in the place's own time. */
export function whenWords(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  const day = formatVenueTime(startsAt, timeZone, "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (value: string) =>
    formatVenueTime(value, timeZone, "en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  const sameDay =
    localDateOf(Date.parse(startsAt), timeZone) ===
    localDateOf(Date.parse(endsAt), timeZone);
  return sameDay
    ? `${day} · ${time(startsAt)} – ${time(endsAt)}`
    : `${day} · ${time(startsAt)} – ${formatVenueTime(endsAt, timeZone, "en-US", { weekday: "short", month: "short", day: "numeric" })}`;
}

export function timeWords(instant: string, timeZone: string): string {
  return formatVenueTime(instant, timeZone, "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Today", "Tomorrow" or "Sat, Dec 5", for the list's day groups. */
export function dayWords(
  instant: string,
  timeZone: string,
  nowMs: number,
): string {
  const day = localDateOf(Date.parse(instant), timeZone);
  const today = localDateOf(nowMs, timeZone);
  const tomorrow = localDateOf(nowMs + 86_400_000, timeZone);
  const yesterday = localDateOf(nowMs - 86_400_000, timeZone);
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  if (day === yesterday) return "Yesterday";
  return formatVenueTime(instant, timeZone, "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  });
}

/** One event as a row of the list: everything already in words. */
export interface EventRow {
  readonly id: string;
  readonly title: string;
  readonly kind: EventKind;
  readonly kindLabel: string;
  readonly segment: EventSegment;
  readonly statusLabel: string;
  readonly tone: Tone;
  readonly live: boolean;
  readonly startsAt: string;
  readonly day: string;
  readonly when: string;
  readonly venue?: string;
  readonly entries: number;
  readonly capacity: number;
  readonly href: string;
}

const activeRegistration = new Set(["confirmed", "checked-in", "pending"]);

export function eventRows(
  sessions: readonly Session[],
  registrations: readonly OperatorWorkspace["eventRegistrations"][number][],
  nowMs: number,
): EventRow[] {
  const counts = new Map<string, number>();
  for (const registration of registrations) {
    if (!activeRegistration.has(registration.status)) continue;
    counts.set(
      registration.sessionId,
      (counts.get(registration.sessionId) ?? 0) +
        Math.max(1, registration.ticketCount),
    );
  }
  return sessions
    .filter((session) => session.kind !== "court-rental")
    .map((session) => {
      const words = statusWords(session, nowMs);
      const segment = segmentOf(session, nowMs);
      return {
        id: session.id,
        title: session.title,
        kind: session.kind,
        kindLabel: KIND_LABEL[session.kind],
        segment,
        statusLabel: words.label,
        tone: words.tone,
        live: segment === "live",
        startsAt: session.startsAt,
        day: dayWords(session.startsAt, session.timezone, nowMs),
        when: whenWords(session.startsAt, session.endsAt, session.timezone),
        ...(session.venueName ? { venue: session.venueName } : {}),
        entries: Math.min(counts.get(session.id) ?? 0, session.capacity),
        capacity: session.capacity,
        href: `/events/${session.id}`,
      };
    });
}

/** Rows of one list, in the order that list reads: soonest first, past newest first. */
export function rowsFor(
  rows: readonly EventRow[],
  segment: EventSegment,
  filter: { readonly kind?: EventKind; readonly query?: string } = {},
): EventRow[] {
  const needle = filter.query?.trim().toLowerCase() ?? "";
  return rows
    .filter(
      (row) =>
        row.segment === segment &&
        (!filter.kind || row.kind === filter.kind) &&
        (!needle ||
          row.title.toLowerCase().includes(needle) ||
          (row.venue ?? "").toLowerCase().includes(needle) ||
          row.kindLabel.toLowerCase().includes(needle)),
    )
    .sort((left, right) =>
      segment === "past"
        ? Date.parse(right.startsAt) - Date.parse(left.startsAt)
        : Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
}

/** Which list opens first: what is live, else what is coming. */
export function defaultSegment(rows: readonly EventRow[]): EventSegment {
  if (rows.some((row) => row.segment === "live")) return "live";
  if (rows.some((row) => row.segment === "upcoming")) return "upcoming";
  if (rows.some((row) => row.segment === "drafts")) return "drafts";
  return "upcoming";
}

/* ───────────────────────── The open event ───────────────────────── */

export interface EventPermissions {
  /** Change the event, its entries and its schedule (sessions:write). */
  readonly change: boolean;
  /** Refunds and cancelling with refunds (payments:write). */
  readonly refund: boolean;
  /** Sees amounts (payments:read, payments:write or payments:collect). */
  readonly money: boolean;
  /** Check people in: staff with sessions:write, or a coach. */
  readonly checkIn: boolean;
  /** Draft messages to entrants (messages:propose). */
  readonly message: boolean;
}

export type SelectionStatus =
  OperatorSessionDetail["teams"][number]["selectionStatus"];

export const SELECTION_WORDS: Readonly<
  Record<SelectionStatus, { readonly label: string; readonly tone: Tone }>
> = {
  confirmed: { label: "In the field", tone: "positive" },
  waitlisted: { label: "Waitlist", tone: "attention" },
  pending: { label: "Pending", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export interface TeamView {
  readonly id: string;
  readonly registrationId: string;
  readonly name: string;
  readonly captain: string;
  readonly players: readonly string[];
  readonly seed?: number;
  readonly selection: SelectionStatus;
  readonly locked: boolean;
  readonly paidPlayers: number;
  readonly expected: number;
  readonly fullyPaid: boolean;
  /** "Paid", "1 of 2 paid", "Not paid": no amounts. */
  readonly payment: string;
  readonly needsAttention: boolean;
  /** Why it needs attention, in words. */
  readonly attention?: string;
  readonly registeredAt: string;
  readonly rating?: number;
}

export interface MatchView {
  readonly id: string;
  readonly divisionId: string;
  readonly divisionName: string;
  readonly label: string;
  readonly teamA?: string;
  readonly teamB?: string;
  readonly courtId?: string;
  readonly courtName?: string;
  readonly scheduledAt?: string;
  readonly status: string;
  readonly sets: readonly (readonly [number, number])[];
  readonly winner?: "home" | "away";
  readonly live: boolean;
  readonly done: boolean;
}

export interface PoolView {
  readonly key: string;
  readonly played: number;
  readonly total: number;
  readonly standings: readonly {
    readonly team: string;
    readonly seed?: number;
    readonly wins: number;
    readonly losses: number;
    readonly setDifferential: number;
    readonly pointDifferential: number;
  }[];
}

export interface RoundView {
  readonly key: string;
  readonly label: string;
  readonly matches: readonly MatchView[];
}

export interface DivisionView {
  readonly id: string;
  readonly name: string;
  readonly teamSize: number;
  /** "12 teams" or "12 of 16 teams". */
  readonly fieldWords: string;
  readonly confirmed: number;
  readonly waitlisted: number;
  readonly maximumTeams?: number;
  readonly entryFeeMinor: number;
  readonly format: string;
  readonly seedsFinal: boolean;
  readonly hasBracket: boolean;
  readonly drawFinal: boolean;
  readonly live: boolean;
  readonly scheduled: number;
  readonly matchCount: number;
  /** Every match of the division, scores joined in. */
  readonly matches: readonly MatchView[];
  readonly teams: readonly TeamView[];
  readonly pools: readonly PoolView[];
  readonly rounds: readonly RoundView[];
  readonly kob?: NonNullable<
    TournamentCompetitionSnapshot["divisions"][number]["kobStandings"]
  >;
}

export interface LaunchStep {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly done: boolean;
  /** Where the work for this step is. */
  readonly tab?: EventTab;
}

/** The one thing to do next, for the header's primary action. */
export type NextStep =
  | { readonly kind: "publish" }
  | { readonly kind: "close-registration" }
  | { readonly kind: "publish-live" }
  | {
      readonly kind: "tab";
      readonly tab: EventTab;
      readonly label: string;
    }
  | { readonly kind: "none" };

export type EventTab =
  | "overview"
  | "entries"
  | "schedule"
  | "brackets"
  | "money"
  | "notes"
  | "settings";

export interface AttendeeView {
  readonly registrationId: string;
  readonly personId: string;
  readonly name: string;
  readonly status: OperatorSessionDetail["attendees"][number]["status"];
  readonly attendance: OperatorSessionDetail["attendees"][number]["attendanceStatus"];
  readonly payment: string;
  readonly paymentDue: boolean;
  readonly guest: boolean;
  readonly claimUrl?: string;
  readonly orderId?: string;
  readonly hasPhone: boolean;
  readonly hasEmail: boolean;
}

export interface OrderView {
  readonly orderId: string;
  readonly buyer: string;
  readonly registrationId?: string;
  readonly total: string;
  readonly cashRefundMinor: number;
  readonly creditsToRestore: number;
  readonly refundWords: string;
  readonly refunded: boolean;
}

export interface EventView {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly kind: EventKind;
  readonly kindLabel: string;
  readonly status: EventStatus;
  readonly statusLabel: string;
  readonly tone: Tone;
  readonly segment: EventSegment;
  readonly live: boolean;
  /** Today, on the place's calendar (and not cancelled). */
  readonly eventDay: boolean;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly when: string;
  readonly venue?: string;
  readonly capacity: number;
  readonly currency: string;
  readonly registrationOpen: boolean;
  readonly registrationClosesAt?: string;
  readonly competition: boolean;
  readonly divisions: readonly DivisionView[];
  readonly matches: readonly MatchView[];
  readonly courts: readonly { readonly id: string; readonly name: string }[];
  readonly attendees: readonly AttendeeView[];
  readonly entries: number;
  readonly checkedIn: number;
  readonly noShows: number;
  readonly waitlist: number;
  readonly attentionTeams: number;
  readonly launch: readonly LaunchStep[];
  readonly next: NextStep;
  readonly coaches: readonly string[];
  readonly arrivals: {
    readonly active: boolean;
    readonly expected: number;
    readonly arrived: number;
    readonly late: number;
    readonly people: readonly {
      readonly name: string;
      readonly status: string;
      readonly eta?: string;
    }[];
  };
  readonly weather?: string;
  readonly notes: OperatorSessionDetail["notes"];
  readonly videos: OperatorSessionDetail["videos"];
  readonly cancellation?: {
    readonly reason?: string;
    readonly by?: string;
    readonly at?: string;
    readonly refundStatus?: "pending" | "complete" | "attention";
  };
  /** Amounts: only built for people who may see money. */
  readonly money?: {
    readonly currency: string;
    readonly gross: string;
    readonly refunded: string;
    readonly net: string;
    readonly paidOrders: number;
    readonly orders: readonly OrderView[];
    readonly cancelPreview: {
      readonly registrations: number;
      readonly cash: string;
      readonly cashMinor: number;
      readonly credits: number;
    };
    readonly fees: readonly {
      readonly division: string;
      readonly fee: string;
    }[];
  };
  readonly publicPath?: string;
}

function teamPayment(team: OperatorSessionDetail["teams"][number]): string {
  if (team.fullyPaid) return "Paid";
  if (team.paidPlayers === 0) return "Not paid";
  return `${team.paidPlayers} of ${team.expectedTeamSize} paid`;
}

function teamAttention(
  team: OperatorSessionDetail["teams"][number],
): string | undefined {
  if (!team.needsAttention) return undefined;
  if (team.playersAdded < team.expectedTeamSize)
    return `${team.expectedTeamSize - team.playersAdded} player${team.expectedTeamSize - team.playersAdded === 1 ? "" : "s"} still to add`;
  if (team.claimedPlayers < team.playersAdded)
    return "An invitation is unclaimed";
  if (!team.fullyPaid) return "A payment is incomplete";
  return "Needs a look";
}

export function teamView(
  team: OperatorSessionDetail["teams"][number],
): TeamView {
  const attention = teamAttention(team);
  return {
    id: team.id,
    registrationId: team.registrationId,
    name: team.name,
    captain: team.captainName,
    players: team.roster.map((player) => player.displayName),
    ...(team.seed ? { seed: team.seed } : {}),
    selection: team.selectionStatus,
    locked: team.selectionLocked,
    paidPlayers: team.paidPlayers,
    expected: team.expectedTeamSize,
    fullyPaid: team.fullyPaid,
    payment: teamPayment(team),
    needsAttention: team.needsAttention,
    ...(attention ? { attention } : {}),
    registeredAt: team.registeredAt,
    ...(team.averageRating ? { rating: team.averageRating } : {}),
  };
}

const formatWords: Readonly<Record<string, string>> = {
  "single-elimination": "Single elimination",
  "double-elimination-true-reset": "Double elimination",
  "double-elimination-modified": "Double elimination (modified)",
  "double-elimination-crossover": "Double elimination (crossover)",
  "round-robin": "Round robin",
  "pool-play": "Pool play",
  "kob-individual-rotation": "King of the beach",
  "kob-team-progressive": "King of the beach (teams)",
};

export function formatLabel(format: string): string {
  return formatWords[format] ?? format.replaceAll("-", " ");
}

type CompetitionMatch =
  TournamentCompetitionSnapshot["divisions"][number]["matches"][number];

function matchFromCompetition(
  match: CompetitionMatch,
  division: { id: string; name: string },
  courtIds: ReadonlyMap<string, string>,
): MatchView {
  const sets = (match.score?.sets ?? []).map(
    ([home, away]) => [home, away] as const,
  );
  const winner = match.winnerTeamId
    ? match.winnerTeamId === match.teamA?.id
      ? ("home" as const)
      : match.winnerTeamId === match.teamB?.id
        ? ("away" as const)
        : undefined
    : undefined;
  const live =
    match.score?.status === "live" ||
    match.status === "live" ||
    match.status === "in-progress";
  const done =
    match.score?.status === "complete" ||
    match.score?.status === "forfeit" ||
    match.status === "complete" ||
    match.status === "completed" ||
    Boolean(match.completedAt);
  return {
    id: match.id,
    divisionId: division.id,
    divisionName: division.name,
    label: match.label,
    ...(match.teamA ? { teamA: match.teamA.name } : {}),
    ...(match.teamB ? { teamB: match.teamB.name } : {}),
    ...(match.courtName
      ? {
          courtName: match.courtName,
          ...(courtIds.get(match.courtName)
            ? { courtId: courtIds.get(match.courtName) }
            : {}),
        }
      : {}),
    ...(match.scheduledAt ? { scheduledAt: match.scheduledAt } : {}),
    status: match.score?.status ?? match.status,
    sets,
    ...(winner ? { winner } : {}),
    live,
    done,
  };
}

function matchFromDivision(
  match: OperatorDivisionDetail["matches"][number],
  division: { id: string; name: string },
): MatchView {
  const status = match.status;
  return {
    id: match.id,
    divisionId: division.id,
    divisionName: division.name,
    label: match.label,
    ...(match.teamAName ? { teamA: match.teamAName } : {}),
    ...(match.teamBName ? { teamB: match.teamBName } : {}),
    ...(match.courtId ? { courtId: match.courtId } : {}),
    ...(match.courtName ? { courtName: match.courtName } : {}),
    ...(match.scheduledAt ? { scheduledAt: match.scheduledAt } : {}),
    status,
    sets: [],
    live: status === "live" || status === "in-progress",
    done: status === "complete" || status === "completed",
  };
}

/** A division as the workspace draws it: its field, gates, pools and rounds. */
export function divisionView(input: {
  readonly detail: OperatorDivisionDetail;
  readonly competition?: TournamentCompetitionSnapshot["divisions"][number];
}): DivisionView {
  const { detail, competition } = input;
  const division = { id: detail.division.id, name: detail.division.name };
  const teams = detail.teams.map(teamView);
  const confirmed = teams.filter((team) => team.selection === "confirmed");
  const waitlisted = teams.filter((team) => team.selection === "waitlisted");
  const courtIds = new Map(
    detail.courts.map((court) => [court.name, court.id]),
  );
  // The operator's matches carry the court id (for moving a match); the
  // competition snapshot carries the scores. Join them by id.
  const scores = new Map(
    (competition?.matches ?? []).map((match) => [
      match.id,
      matchFromCompetition(match, division, courtIds),
    ]),
  );
  const matches = detail.matches.map((match) => {
    const base = matchFromDivision(match, division);
    const scored = scores.get(match.id);
    return scored
      ? {
          ...scored,
          ...(base.courtId ? { courtId: base.courtId } : {}),
          ...(base.courtName ? { courtName: base.courtName } : {}),
          ...(base.scheduledAt ? { scheduledAt: base.scheduledAt } : {}),
        }
      : base;
  });
  const byId = new Map(matches.map((match) => [match.id, match]));
  const bracketCurrent = Boolean(
    detail.division.seedingFinalizedAt &&
    detail.bracket &&
    Date.parse(detail.bracket.createdAt) >=
      Date.parse(detail.division.seedingFinalizedAt),
  );
  const maximum = detail.division.maximumTeams;
  return {
    id: division.id,
    name: division.name,
    teamSize: detail.division.teamSize,
    fieldWords: maximum
      ? `${confirmed.length} of ${maximum} teams`
      : `${confirmed.length} ${confirmed.length === 1 ? "team" : "teams"}`,
    confirmed: confirmed.length,
    waitlisted: waitlisted.length,
    ...(maximum ? { maximumTeams: maximum } : {}),
    entryFeeMinor: detail.division.entryFeeMinor,
    format: formatLabel(
      detail.bracket?.format ?? detail.division.tournamentFormat,
    ),
    seedsFinal: Boolean(detail.division.seedingFinalizedAt),
    hasBracket: Boolean(detail.bracket),
    drawFinal: bracketCurrent && Boolean(detail.bracket?.drawFinalizedAt),
    live: Boolean(detail.bracket?.liveAt ?? competition?.liveAt),
    scheduled: matches.filter((match) => match.scheduledAt).length,
    matchCount: matches.length,
    matches,
    teams: [...teams].sort(teamOrder),
    pools: (competition?.pools ?? []).map((pool) => ({
      key: pool.key,
      played: pool.completedMatches,
      total: pool.matchCount,
      standings: pool.standings.map((row) => ({
        team: row.team.name,
        ...(row.team.seed ? { seed: row.team.seed } : {}),
        wins: row.wins,
        losses: row.losses,
        setDifferential: row.setDifferential,
        pointDifferential: row.pointDifferential,
      })),
    })),
    rounds: (competition?.rounds ?? [])
      .filter((round) => round.bracket !== "pool")
      .map((round) => ({
        key: round.key,
        label: round.label,
        matches: round.matches.map(
          (match) =>
            byId.get(match.id) ??
            matchFromCompetition(match, division, courtIds),
        ),
      })),
    ...(competition?.kobStandings?.length
      ? { kob: competition.kobStandings }
      : {}),
  };
}

const selectionOrder: Readonly<Record<SelectionStatus, number>> = {
  confirmed: 0,
  pending: 1,
  waitlisted: 2,
  withdrawn: 3,
};

/** Confirmed by seed, then pending, then the waitlist in the order people joined. */
export function teamOrder(left: TeamView, right: TeamView): number {
  const bySelection =
    selectionOrder[left.selection] - selectionOrder[right.selection];
  if (bySelection !== 0) return bySelection;
  if (left.selection === "confirmed" && (left.seed || right.seed))
    return (left.seed ?? 9_999) - (right.seed ?? 9_999);
  return Date.parse(left.registeredAt) - Date.parse(right.registeredAt);
}

/** The launch of a tournament or league: close, ready each division, publish. */
export function launchSteps(input: {
  readonly registrationClosed: boolean;
  readonly divisions: readonly DivisionView[];
}): LaunchStep[] {
  const steps: LaunchStep[] = [
    {
      id: "close",
      label: "Close registration",
      detail: input.registrationClosed
        ? "No new entries or roster changes."
        : "Stops new entries and roster changes.",
      done: input.registrationClosed,
      tab: "settings",
    },
  ];
  for (const division of input.divisions) {
    const scheduleReady =
      division.matchCount > 0 && division.scheduled === division.matchCount;
    steps.push({
      id: `division:${division.id}`,
      label: division.name,
      detail: [
        division.seedsFinal ? "Seeds final" : "Seeds open",
        !division.hasBracket
          ? "no draw yet"
          : division.drawFinal
            ? "draw final"
            : "draw open",
        division.matchCount
          ? `${division.scheduled} of ${division.matchCount} matches scheduled`
          : "no matches yet",
      ].join(" · "),
      done: division.seedsFinal && division.drawFinal && scheduleReady,
      tab: division.seedsFinal && division.drawFinal ? "schedule" : "brackets",
    });
  }
  const allLive =
    input.divisions.length > 0 &&
    input.divisions.every((division) => division.live);
  steps.push({
    id: "publish",
    label: "Publish and set live",
    detail: allLive
      ? "Pools, draw and match times are public."
      : "Shows the pools, draw and match times, and tells the field.",
    done: allLive,
  });
  return steps;
}

export function nextStep(input: {
  readonly status: EventStatus;
  readonly segment: EventSegment;
  readonly competition: boolean;
  readonly launch: readonly LaunchStep[];
  readonly live: boolean;
  readonly refundAttention: boolean;
  readonly permissions: EventPermissions;
}): NextStep {
  const { permissions } = input;
  if (input.status === "draft")
    return permissions.change ? { kind: "publish" } : { kind: "none" };
  if (input.status === "cancelled")
    return input.refundAttention && permissions.money
      ? { kind: "tab", tab: "money", label: "Review refunds" }
      : { kind: "none" };
  if (input.segment === "past")
    return { kind: "tab", tab: "notes", label: "Write a note" };
  if (input.competition && permissions.change && input.launch.length > 0) {
    const pending = input.launch.find((step) => !step.done);
    if (pending?.id === "close" && !input.live)
      return { kind: "close-registration" };
    if (pending?.id === "publish") return { kind: "publish-live" };
    if (pending?.tab)
      return {
        kind: "tab",
        tab: pending.tab,
        label:
          pending.tab === "schedule"
            ? `Schedule ${pending.label}`
            : `Ready ${pending.label}`,
      };
  }
  if (input.live)
    return input.competition
      ? { kind: "tab", tab: "schedule", label: "Run the courts" }
      : { kind: "tab", tab: "entries", label: "Check players in" };
  return { kind: "tab", tab: "entries", label: "See who's in" };
}

function arrivalEta(seconds: number, status: string): string | undefined {
  if (status === "arrived") return undefined;
  if (seconds <= 60) return "Now";
  return `${Math.round(seconds / 60)} min`;
}

export function weatherWords(
  operations: OperatorSessionDetail["operations"],
): string | undefined {
  const weather = operations.weather;
  if (weather) {
    const parts = [weather.condition];
    if (weather.temperatureC !== undefined)
      parts.push(`${Math.round(weather.temperatureC)}°C`);
    if (weather.windSpeedKph !== undefined)
      parts.push(`wind ${Math.round(weather.windSpeedKph)} km/h`);
    if (weather.precipitationProbability !== undefined)
      parts.push(`${Math.round(weather.precipitationProbability)}% rain`);
    return `${operations.weatherKind === "captured" ? "Recorded" : "Forecast"}: ${parts.join(", ")}`;
  }
  switch (operations.weatherStatus) {
    case "forecast-pending":
      return "The forecast opens closer to the day.";
    case "location-required":
      return "No forecast: the place has no map location yet.";
    case "provider-required":
      return "Weather isn't set up in this environment yet.";
    case "temporarily-unavailable":
      return "The forecast is unavailable right now.";
    default:
      return undefined;
  }
}

/** The open event, from the API's answers. */
export function eventView(input: {
  readonly detail: OperatorSessionDetail;
  readonly divisions: readonly OperatorDivisionDetail[];
  readonly competition?: TournamentCompetitionSnapshot;
  readonly courts: readonly { readonly id: string; readonly name: string }[];
  readonly permissions: EventPermissions;
  readonly nowMs: number;
}): EventView {
  const { detail, permissions, nowMs } = input;
  const session = detail.session;
  const words = statusWords(session, nowMs);
  const segment = segmentOf(session, nowMs);
  const live = segment === "live";
  const competitionByDivision = new Map(
    (input.competition?.divisions ?? []).map((division) => [
      division.id,
      division,
    ]),
  );
  const divisions = input.divisions
    .map((division) =>
      divisionView({
        detail: division,
        competition: competitionByDivision.get(division.division.id),
      }),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const competition =
    isCompetitionKind(session.kind) &&
    (divisions.length > 0 || detail.entryDivisions.length > 0);
  const closed = registrationClosed(session, nowMs);
  const launch =
    competition && segment !== "past" && session.status !== "cancelled"
      ? launchSteps({ registrationClosed: closed, divisions })
      : [];
  const attendees: AttendeeView[] = detail.attendees.map((attendee) => ({
    registrationId: attendee.id,
    personId: attendee.personId,
    name: attendee.displayName,
    status: attendee.status,
    attendance: attendee.attendanceStatus,
    payment:
      attendee.status === "refunded"
        ? "Refunded"
        : attendee.paymentStatus === "paid"
          ? "Paid"
          : attendee.paymentStatus === "complimentary"
            ? "Complimentary"
            : attendee.paymentStatus === "free"
              ? "Free"
              : "Payment due",
    paymentDue: attendee.paymentStatus === "payment-due",
    guest: attendee.identityStatus !== "connected",
    ...(attendee.invitation?.status === "pending"
      ? { claimUrl: attendee.invitation.claimUrl }
      : {}),
    ...(attendee.orderId ? { orderId: attendee.orderId } : {}),
    hasPhone: Boolean(attendee.phoneE164),
    hasEmail: Boolean(attendee.email),
  }));
  const active = attendees.filter(
    (attendee) =>
      attendee.status !== "cancelled" && attendee.status !== "refunded",
  );
  const matches = divisions
    .flatMap((division) => division.matches)
    .sort(matchOrder);
  const refundStatus = detail.operations.refundStatus;
  const signals = detail.arrivalBoard.signals.filter(
    (signal) => signal.role === "player",
  );
  const currency = detail.finance.currency;
  const money = (minor: number) => formatMoney(minor, currency);
  const registrationByOrder = new Map(
    detail.attendees.flatMap((attendee) =>
      attendee.orderId ? [[attendee.orderId, attendee] as const] : [],
    ),
  );
  const teams = divisions.flatMap((division) => division.teams);
  const view: EventView = {
    id: session.id,
    title: session.title,
    slug: session.slug,
    kind: session.kind,
    kindLabel: KIND_LABEL[session.kind],
    status: session.status,
    statusLabel: words.label,
    tone: words.tone,
    segment,
    live,
    eventDay:
      session.status !== "cancelled" &&
      localDateOf(Date.parse(session.startsAt), session.timezone) ===
        localDateOf(nowMs, session.timezone),
    timeZone: session.timezone,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    when: whenWords(session.startsAt, session.endsAt, session.timezone),
    ...(session.venueName ? { venue: session.venueName } : {}),
    capacity: session.capacity,
    currency: session.currency,
    registrationOpen: !closed && session.status !== "draft",
    ...(session.registrationClosesAt
      ? { registrationClosesAt: session.registrationClosesAt }
      : {}),
    competition,
    divisions,
    matches,
    courts: input.courts,
    attendees,
    entries: competition
      ? teams.filter((team) => team.selection === "confirmed").length
      : active.length,
    checkedIn: active.filter(
      (attendee) =>
        attendee.attendance === "attended" || attendee.status === "checked-in",
    ).length,
    noShows: active.filter((attendee) => attendee.attendance === "no-show")
      .length,
    waitlist: competition
      ? teams.filter((team) => team.selection === "waitlisted").length
      : attendees.filter((attendee) => attendee.status === "waitlisted").length,
    attentionTeams: teams.filter(
      (team) => team.needsAttention && team.selection !== "withdrawn",
    ).length,
    launch,
    next: nextStep({
      status: session.status,
      segment,
      competition,
      launch,
      live,
      refundAttention: refundStatus === "attention",
      permissions,
    }),
    coaches: detail.coaches.map((coach) => coach.displayName),
    arrivals: {
      active: detail.arrivalBoard.sharingWindow.active,
      expected: detail.arrivalBoard.expectedPlayers,
      arrived: signals.filter((signal) => signal.status === "arrived").length,
      late: signals.filter((signal) => signal.status === "running-late").length,
      people: signals.slice(0, 12).map((signal) => {
        const eta = arrivalEta(signal.travelDurationSeconds, signal.status);
        return {
          name: signal.displayName,
          status: signal.status.replaceAll("-", " "),
          ...(eta ? { eta } : {}),
        };
      }),
    },
    ...(weatherWords(detail.operations)
      ? { weather: weatherWords(detail.operations) }
      : {}),
    notes: detail.notes,
    videos: detail.videos,
    ...(detail.operations.cancelledAt || session.status === "cancelled"
      ? {
          cancellation: {
            ...(detail.operations.cancellationReason
              ? { reason: detail.operations.cancellationReason }
              : {}),
            ...(detail.operations.cancelledByName
              ? { by: detail.operations.cancelledByName }
              : {}),
            ...(detail.operations.cancelledAt
              ? {
                  at: formatVenueTime(
                    detail.operations.cancelledAt,
                    session.timezone,
                  ),
                }
              : {}),
            ...(refundStatus ? { refundStatus } : {}),
          },
        }
      : {}),
    ...(permissions.money
      ? {
          money: {
            currency,
            gross: money(detail.finance.grossMinor),
            refunded: money(detail.finance.refundedMinor),
            net: money(detail.finance.netMinor),
            paidOrders: detail.finance.paidOrders,
            orders: detail.cancellationPreview.orders.map((order) => {
              const registration = registrationByOrder.get(order.orderId);
              const refunded =
                registration?.status === "refunded" ||
                (order.cashRefundMinor === 0 && order.creditsToRestore === 0);
              return {
                orderId: order.orderId,
                buyer: order.buyerName,
                ...(registration ? { registrationId: registration.id } : {}),
                total: money(order.totalMinor),
                cashRefundMinor: order.cashRefundMinor,
                creditsToRestore: order.creditsToRestore,
                refundWords: refundWords(order, money),
                refunded,
              };
            }),
            cancelPreview: {
              registrations: detail.cancellationPreview.registrationCount,
              cash: money(detail.cancellationPreview.cashRefundMinor),
              cashMinor: detail.cancellationPreview.cashRefundMinor,
              credits: detail.cancellationPreview.creditsToRestore,
            },
            fees: detail.entryDivisions.map((division) => ({
              division: division.name,
              fee:
                division.entryFeeMinor > 0
                  ? `${formatMoney(division.entryFeeMinor, division.currency)} per ${division.teamSize === 1 ? "player" : "team"}`
                  : "Free",
            })),
          },
        }
      : {}),
    ...(session.status !== "draft"
      ? { publicPath: `/events/${session.slug}` }
      : {}),
  };
  return view;
}

function refundWords(
  order: OperatorSessionDetail["cancellationPreview"]["orders"][number],
  money: (minor: number) => string,
): string {
  const parts: string[] = [];
  if (order.cashRefundMinor > 0)
    parts.push(`${money(order.cashRefundMinor)} to the card they paid with`);
  if (order.creditsToRestore > 0)
    parts.push(
      `${order.creditsToRestore} ${order.creditsToRestore === 1 ? "credit" : "credits"} back to their wallet`,
    );
  return parts.join(" and ") || "Nothing left to refund";
}

/** Live first, then by time (unscheduled last), then by court. */
export function matchOrder(left: MatchView, right: MatchView): number {
  if (left.live !== right.live) return left.live ? -1 : 1;
  const leftAt = left.scheduledAt ? Date.parse(left.scheduledAt) : Infinity;
  const rightAt = right.scheduledAt ? Date.parse(right.scheduledAt) : Infinity;
  if (leftAt !== rightAt) return leftAt - rightAt;
  return (left.courtName ?? "").localeCompare(right.courtName ?? "");
}

/** Matches grouped for the Schedule tab: on court now, by time, then unscheduled. */
export function scheduleGroups(
  matches: readonly MatchView[],
  timeZone: string,
): {
  readonly key: string;
  readonly label: string;
  readonly matches: readonly MatchView[];
}[] {
  const live = matches.filter((match) => match.live);
  const timed = matches.filter((match) => !match.live && match.scheduledAt);
  const unscheduled = matches.filter(
    (match) => !match.live && !match.scheduledAt,
  );
  const groups: {
    key: string;
    label: string;
    matches: MatchView[];
  }[] = [];
  if (live.length)
    groups.push({ key: "live", label: "On court now", matches: live });
  for (const match of [...timed].sort(matchOrder)) {
    const label = `${dayLabelShort(match.scheduledAt!, timeZone)} ${timeWords(match.scheduledAt!, timeZone)}`;
    const group = groups.find(
      (candidate) => candidate.key === match.scheduledAt,
    );
    if (group) group.matches.push(match);
    else groups.push({ key: match.scheduledAt!, label, matches: [match] });
  }
  if (unscheduled.length)
    groups.push({
      key: "unscheduled",
      label: "Not scheduled yet",
      matches: unscheduled,
    });
  return groups;
}

function dayLabelShort(instant: string, timeZone: string): string {
  return formatVenueTime(instant, timeZone, "en-US", { weekday: "short" });
}

/** A "2026-12-05T10:30" field in the place's time, as an instant. */
export function localInputToInstant(
  value: string,
  timeZone: string,
): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return new Date(
    wallTimeToInstant(match[1]!, minutes, timeZone),
  ).toISOString();
}

/** An instant as a "2026-12-05T10:30" field value in the place's time. */
export function instantToLocalInput(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The entries as a CSV file: names, division, status, seed and payment words. No contact details. */
export function entriesCsv(
  view: Pick<EventView, "divisions" | "attendees" | "competition">,
): string {
  const escape = (value: string | number | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows: (string | number | undefined)[][] = view.competition
    ? [
        ["Division", "Team", "Players", "Status", "Seed", "Payment"],
        ...view.divisions.flatMap((division) =>
          division.teams.map((team) => [
            division.name,
            team.name,
            team.players.join(" / "),
            SELECTION_WORDS[team.selection].label,
            team.seed,
            team.payment,
          ]),
        ),
      ]
    : [
        ["Name", "Status", "Attendance", "Payment"],
        ...view.attendees.map((attendee) => [
          attendee.name,
          attendee.status.replaceAll("-", " "),
          attendee.attendance.replaceAll("-", " "),
          attendee.payment,
        ]),
      ];
  return rows.map((row) => row.map(escape).join(",")).join("\n");
}

/**
 * What a fee change means for the people who already paid: each paying
 * team's difference (back to them when the fee goes down, owed when it goes
 * up), in proportion to what they paid so far.
 */
export function feeChangePreview(
  division: Pick<DivisionView, "entryFeeMinor" | "teams">,
  newFeeMinor: number,
): {
  readonly rows: readonly {
    readonly team: string;
    readonly deltaMinor: number;
  }[];
  readonly refundMinor: number;
  readonly refunded: number;
  readonly owedMinor: number;
  readonly owing: number;
} {
  const rows = division.teams
    .filter(
      (team) =>
        team.selection !== "withdrawn" &&
        team.paidPlayers > 0 &&
        team.expected > 0,
    )
    .map((team) => ({
      team: team.name,
      deltaMinor: Math.round(
        ((newFeeMinor - division.entryFeeMinor) * team.paidPlayers) /
          team.expected,
      ),
    }));
  const back = rows.filter((row) => row.deltaMinor < 0);
  const owe = rows.filter((row) => row.deltaMinor > 0);
  return {
    rows,
    refundMinor: back.reduce((sum, row) => sum - row.deltaMinor, 0),
    refunded: back.length,
    owedMinor: owe.reduce((sum, row) => sum + row.deltaMinor, 0),
    owing: owe.length,
  };
}
