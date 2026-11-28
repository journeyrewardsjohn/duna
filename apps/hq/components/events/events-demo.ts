import type {
  OperatorDivisionDetail,
  OperatorSessionDetail,
  OperatorWorkspace,
  TournamentCompetitionSnapshot,
} from "@duna/api";

/**
 * The demo club's events (no Duna Database): a tournament that is live right
 * now, a league still in draft and a tournament that finished, in the same
 * shapes the API answers, so the workspace is exercised end to end. Changes
 * a person makes in the demo are kept in a cookie in their own browser
 * (`DemoEventsStore`) and applied here; nothing leaves the browser.
 */

export const DEMO_EVENTS_COOKIE = "duna-demo-events";
const LIMIT = 3_600;

type Session = OperatorWorkspace["sessions"][number];

export interface DemoEventsStore {
  /** Team entry id → its selection and seed, as a director set them. */
  readonly selection: Readonly<
    Record<string, { readonly status: string; readonly seed?: number }>
  >;
  readonly seedsFinal: readonly string[];
  readonly drawFinal: readonly string[];
  readonly closed: readonly string[];
  readonly live: readonly string[];
  readonly published: readonly string[];
  readonly cancelled: readonly string[];
  /** Match id → where and when it is now. */
  readonly schedule: Readonly<
    Record<string, { readonly courtId?: string; readonly scheduledAt?: string }>
  >;
  /** Match id → its result, entered by hand. */
  readonly results: Readonly<
    Record<string, readonly (readonly [number, number])[]>
  >;
  /** Registration id → attendance. */
  readonly attendance: Readonly<Record<string, string>>;
  /** Registration ids refunded. */
  readonly refunded: readonly string[];
  /** Note ids shared with players. */
  readonly sharedNotes: readonly string[];
  readonly notes: readonly {
    readonly id: string;
    readonly sessionId: string;
    readonly subject?: string;
    readonly summary: string;
    readonly visibility: "private" | "player";
    readonly createdAt: string;
  }[];
  /** Division id → its entry fee, changed after people entered. */
  readonly fees: Readonly<Record<string, number>>;
}

export const emptyDemoEvents: DemoEventsStore = {
  selection: {},
  seedsFinal: [],
  drawFinal: [],
  closed: [],
  live: [],
  published: [],
  cancelled: [],
  schedule: {},
  results: {},
  attendance: {},
  refunded: [],
  sharedNotes: [],
  notes: [],
  fees: {},
};

const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value: unknown) => (Array.isArray(value) ? value : []);

export function parseDemoEvents(value: string | undefined): DemoEventsStore {
  if (!value) return emptyDemoEvents;
  try {
    const parsed = JSON.parse(value) as Partial<DemoEventsStore>;
    return {
      selection: record(parsed.selection) as DemoEventsStore["selection"],
      seedsFinal: list(parsed.seedsFinal),
      drawFinal: list(parsed.drawFinal),
      closed: list(parsed.closed),
      live: list(parsed.live),
      published: list(parsed.published),
      cancelled: list(parsed.cancelled),
      schedule: record(parsed.schedule) as DemoEventsStore["schedule"],
      results: record(parsed.results) as DemoEventsStore["results"],
      attendance: record(parsed.attendance) as DemoEventsStore["attendance"],
      refunded: list(parsed.refunded),
      sharedNotes: list(parsed.sharedNotes),
      notes: list(parsed.notes),
      fees: record(parsed.fees) as DemoEventsStore["fees"],
    };
  } catch {
    return emptyDemoEvents;
  }
}

/** Serialises the store, dropping the oldest notes past the cookie's size. */
export function serializeDemoEvents(store: DemoEventsStore): string {
  let next = store;
  let value = JSON.stringify(next);
  while (value.length > LIMIT && next.notes.length > 0) {
    next = { ...next, notes: next.notes.slice(1) };
    value = JSON.stringify(next);
  }
  return value;
}

/* ─────────────────────────── The fixtures ─────────────────────────── */

const id = (n: number) =>
  `7e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const demoEventIds = {
  live: id(1),
  draftLeague: id(2),
  finished: id(3),
} as const;

export function isDemoEventId(value: string): boolean {
  return (Object.values(demoEventIds) as string[]).includes(value);
}

const players = [
  "Maya Chen",
  "Jordan Smith",
  "Ava Patel",
  "Elena Ruiz",
  "Noah Kim",
  "Liam Torres",
  "Sofia Nguyen",
  "Mateo Silva",
  "Isla Brooks",
  "Kai Moreno",
  "Zoe Park",
  "Leo Rossi",
  "Nina Shah",
  "Owen Price",
  "Lucia Gomez",
  "Ethan Cole",
  "Mila Novak",
  "Ravi Desai",
  "Tess Ward",
  "Hugo Laurent",
  "Ana Costa",
  "Ben Ito",
  "Clara Diaz",
  "Felix Wong",
  "Iris Lund",
  "Jonah Reed",
  "Maren Holt",
  "Theo Vance",
] as const;

const surname = (name: string) => name.split(" ").at(-1)!;

interface Place {
  readonly venueId?: string;
  readonly venueName: string;
  readonly timeZone: string;
  readonly courts: readonly { readonly id: string; readonly name: string }[];
}

/** The demo club's first place and its courts (the fixtures play there). */
export function demoPlace(workspace: OperatorWorkspace): Place {
  const venue = workspace.venues.find((candidate) => candidate.courts.length);
  return venue
    ? {
        venueId: venue.id,
        venueName: venue.name,
        timeZone: venue.timezone,
        courts: venue.courts.map((court) => ({
          id: court.id,
          name: court.name,
        })),
      }
    : {
        venueName: "Beach Elite Training Center",
        timeZone: workspace.organization.timezone,
        courts: [
          { id: id(901), name: "Court 1" },
          { id: id(902), name: "Court 2" },
        ],
      };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const analytics = {
  impressions: 0,
  uniqueViewers: 0,
  registrations: 0,
  ticketHolders: 0,
  conversionRateBps: 0,
};

function sessionStatus(
  sessionId: string,
  base: Session["status"],
  store: DemoEventsStore,
): Session["status"] {
  if (store.cancelled.includes(sessionId)) return "cancelled";
  if (store.live.includes(sessionId)) return "live";
  if (base === "draft" && store.published.includes(sessionId))
    return "registration-open";
  return base;
}

/** The fixture events as the workspace lists them. */
export function demoSessions(
  place: Place,
  nowMs: number,
  store: DemoEventsStore,
): Session[] {
  const top = Math.floor(nowMs / HOUR) * HOUR;
  const common = {
    timezone: place.timeZone,
    ...(place.venueId ? { venueId: place.venueId } : {}),
    venueName: place.venueName,
    media: [],
    currency: "USD" as const,
    analytics,
  };
  const closes = (sessionId: string, at: number) =>
    store.closed.includes(sessionId)
      ? new Date(Math.min(at, nowMs - 60_000)).toISOString()
      : new Date(at).toISOString();
  return [
    {
      ...common,
      id: demoEventIds.live,
      title: "Harbor Doubles Classic",
      slug: "harbor-doubles-classic",
      kind: "tournament",
      status: sessionStatus(demoEventIds.live, "live", store),
      startsAt: new Date(top - 2 * HOUR).toISOString(),
      endsAt: new Date(top + 6 * HOUR).toISOString(),
      capacity: 32,
      registrationClosesAt: new Date(top - DAY).toISOString(),
      shortSummary: "Two divisions, pool play into a final.",
      priceMinor: 8_000,
    },
    {
      ...common,
      id: demoEventIds.draftLeague,
      title: "Thursday night league",
      slug: "thursday-night-league",
      kind: "league",
      status: sessionStatus(demoEventIds.draftLeague, "draft", store),
      startsAt: new Date(top + 10 * DAY).toISOString(),
      endsAt: new Date(top + 10 * DAY + 3 * HOUR).toISOString(),
      capacity: 24,
      registrationClosesAt: closes(demoEventIds.draftLeague, top + 8 * DAY),
      shortSummary: "Six weeks of doubles under the lights.",
      priceMinor: 6_000,
    },
    {
      ...common,
      id: demoEventIds.finished,
      title: "Autumn Sand Classic",
      slug: "autumn-sand-classic",
      kind: "tournament",
      status: sessionStatus(demoEventIds.finished, "completed", store),
      startsAt: new Date(top - 21 * DAY).toISOString(),
      endsAt: new Date(top - 21 * DAY + 8 * HOUR).toISOString(),
      capacity: 16,
      registrationClosesAt: new Date(top - 22 * DAY).toISOString(),
      shortSummary: "One division, single elimination.",
      priceMinor: 7_000,
    },
  ];
}

interface DemoTeam {
  readonly id: string;
  readonly registrationId: string;
  readonly name: string;
  readonly players: readonly [string, string];
  readonly seed?: number;
  readonly selection: "confirmed" | "waitlisted" | "pending";
  readonly paid: number;
  readonly registeredAt: string;
}

interface DemoDivision {
  readonly id: string;
  readonly name: string;
  readonly feeMinor: number;
  readonly maximumTeams: number;
  readonly teams: readonly DemoTeam[];
  readonly pools: readonly (readonly number[])[];
  readonly bracket: boolean;
  readonly seedsFinal: boolean;
  readonly drawFinal: boolean;
  readonly live: boolean;
}

function teamsFrom(
  base: number,
  from: number,
  count: number,
  registeredAt: number,
  waitlistFrom = Infinity,
): DemoTeam[] {
  return Array.from({ length: count }, (_, index) => {
    const a = players[(from + index * 2) % players.length]!;
    const b = players[(from + index * 2 + 1) % players.length]!;
    return {
      id: id(base + index),
      registrationId: id(base + 100 + index),
      name: `${surname(a)} / ${surname(b)}`,
      players: [a, b] as const,
      ...(index < waitlistFrom ? { seed: index + 1 } : {}),
      selection:
        index >= waitlistFrom
          ? ("waitlisted" as const)
          : ("confirmed" as const),
      paid: index === 3 ? 1 : 2,
      registeredAt: new Date(registeredAt + index * HOUR).toISOString(),
    };
  });
}

function divisionsOf(
  sessionId: string,
  nowMs: number,
  store: DemoEventsStore,
): DemoDivision[] {
  const registered = nowMs - 30 * DAY;
  const withStore = (division: DemoDivision): DemoDivision => ({
    ...division,
    feeMinor: store.fees[division.id] ?? division.feeMinor,
    seedsFinal: division.seedsFinal || store.seedsFinal.includes(division.id),
    drawFinal: division.drawFinal || store.drawFinal.includes(division.id),
    live: division.live || store.live.includes(sessionId),
    teams: division.teams.map((team) => {
      const changed = store.selection[team.id];
      if (!changed) return team;
      return {
        ...team,
        selection: changed.status as DemoTeam["selection"],
        ...(changed.seed ? { seed: changed.seed } : {}),
      };
    }),
  });
  if (sessionId === demoEventIds.live) {
    return [
      {
        id: id(101),
        name: "Open doubles",
        feeMinor: 8_000,
        maximumTeams: 8,
        teams: teamsFrom(200, 0, 10, registered, 8),
        pools: [
          [0, 3, 4, 7],
          [1, 2, 5, 6],
        ],
        bracket: true,
        seedsFinal: true,
        drawFinal: true,
        live: true,
      },
      {
        id: id(102),
        name: "Women's AA",
        feeMinor: 6_000,
        maximumTeams: 6,
        teams: teamsFrom(300, 20, 4, registered),
        pools: [[0, 1, 2, 3]],
        bracket: true,
        seedsFinal: true,
        drawFinal: true,
        live: true,
      },
    ].map(withStore);
  }
  if (sessionId === demoEventIds.draftLeague) {
    return [
      {
        id: id(111),
        name: "Coed doubles",
        feeMinor: 6_000,
        maximumTeams: 12,
        teams: teamsFrom(400, 4, 5, nowMs - 2 * DAY).map((team) => ({
          ...team,
          selection: "pending" as const,
          paid: 0,
        })),
        pools: [],
        bracket: false,
        seedsFinal: false,
        drawFinal: false,
        live: false,
      },
    ].map(withStore);
  }
  if (sessionId === demoEventIds.finished) {
    return [
      {
        id: id(121),
        name: "Open doubles",
        feeMinor: 7_000,
        maximumTeams: 4,
        teams: teamsFrom(500, 8, 4, nowMs - 40 * DAY),
        pools: [],
        bracket: true,
        seedsFinal: true,
        drawFinal: true,
        live: true,
      },
    ].map(withStore);
  }
  return [];
}

interface DemoMatch {
  readonly id: string;
  readonly logicalId: string;
  readonly bracket: "pool" | "winners" | "final";
  readonly round: number;
  readonly position: number;
  readonly label: string;
  readonly teamA?: DemoTeam;
  readonly teamB?: DemoTeam;
  readonly courtIndex: number;
  readonly scheduledAt?: number;
  readonly sets: readonly (readonly [number, number])[];
  readonly state: "scheduled" | "live" | "complete";
  readonly pool?: string;
}

const poolPairs = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
] as const;

const finishedSets: readonly (readonly (readonly [number, number])[])[] = [
  [
    [21, 17],
    [21, 19],
  ],
  [
    [18, 21],
    [21, 16],
    [15, 12],
  ],
  [
    [21, 14],
    [22, 20],
  ],
  [
    [16, 21],
    [21, 18],
    [13, 15],
  ],
];

function matchesOf(
  sessionId: string,
  division: DemoDivision,
  divisionIndex: number,
  startsAt: number,
  nowMs: number,
  courts: number,
): DemoMatch[] {
  const matches: DemoMatch[] = [];
  const field = division.teams.filter((team) => team.selection === "confirmed");
  let n = 0;
  const slot = (index: number) =>
    startsAt + Math.floor(index / courts) * 45 * 60_000;
  const stateAt = (at: number | undefined): DemoMatch["state"] =>
    at === undefined
      ? "scheduled"
      : at + 45 * 60_000 <= nowMs
        ? "complete"
        : at <= nowMs
          ? "live"
          : "scheduled";
  if (!division.bracket) return [];
  if (sessionId === demoEventIds.finished) {
    const [a, b, c, d] = field;
    const semi = (position: number, home?: DemoTeam, away?: DemoTeam) => ({
      id: id(1_000 + divisionIndex * 100 + position),
      logicalId: `W1-${position}`,
      bracket: "winners" as const,
      round: 1,
      position,
      label: `Semifinal ${position}`,
      ...(home ? { teamA: home } : {}),
      ...(away ? { teamB: away } : {}),
      courtIndex: position - 1,
      scheduledAt: startsAt + HOUR,
      sets: finishedSets[position - 1]!,
      state: "complete" as const,
    });
    matches.push(semi(1, a, d), semi(2, b, c));
    matches.push({
      id: id(1_000 + divisionIndex * 100 + 9),
      logicalId: "F-1",
      bracket: "final",
      round: 2,
      position: 1,
      label: "Final",
      ...(a ? { teamA: a } : {}),
      ...(c ? { teamB: c } : {}),
      courtIndex: 0,
      scheduledAt: startsAt + 3 * HOUR,
      sets: finishedSets[2]!,
      state: "complete",
    });
    return matches;
  }
  division.pools.forEach((pool, poolIndex) => {
    const poolKey = String.fromCharCode(65 + poolIndex);
    poolPairs.forEach(([left, right], pairIndex) => {
      const index = n++;
      // A third of the pool matches are left for the director to schedule
      // in the women's division, so the Schedule tab has work to show.
      const unscheduled = divisionIndex === 1 && pairIndex >= 4;
      const at = unscheduled
        ? undefined
        : slot(index) + divisionIndex * 20 * 60_000;
      const state = stateAt(at);
      matches.push({
        id: id(1_000 + divisionIndex * 100 + index),
        logicalId: `P${poolKey}-${pairIndex + 1}`,
        bracket: "pool",
        round: Math.floor(pairIndex / 2) + 1,
        position: (pairIndex % 2) + 1,
        label: `Pool ${poolKey} · match ${pairIndex + 1}`,
        teamA: field[pool[left]!]!,
        teamB: field[pool[right]!]!,
        courtIndex: (index + divisionIndex) % courts,
        ...(at !== undefined ? { scheduledAt: at } : {}),
        sets:
          state === "complete"
            ? finishedSets[index % finishedSets.length]!
            : state === "live"
              ? [[14, 11]]
              : [],
        state,
        pool: poolKey,
      });
    });
  });
  if (division.pools.length === 2) {
    const after = startsAt + 5 * HOUR;
    matches.push(
      {
        id: id(1_000 + divisionIndex * 100 + 80),
        logicalId: "W1-1",
        bracket: "winners",
        round: 1,
        position: 1,
        label: "Semifinal 1",
        courtIndex: 0,
        scheduledAt: after,
        sets: [],
        state: "scheduled",
      },
      {
        id: id(1_000 + divisionIndex * 100 + 81),
        logicalId: "W1-2",
        bracket: "winners",
        round: 1,
        position: 2,
        label: "Semifinal 2",
        courtIndex: 1 % courts,
        scheduledAt: after,
        sets: [],
        state: "scheduled",
      },
      {
        id: id(1_000 + divisionIndex * 100 + 89),
        logicalId: "F-1",
        bracket: "final",
        round: 2,
        position: 1,
        label: "Final",
        courtIndex: 0,
        scheduledAt: after + HOUR,
        sets: [],
        state: "scheduled",
      },
    );
  }
  return matches;
}

function winnerOf(
  sets: readonly (readonly [number, number])[],
): "a" | "b" | undefined {
  let a = 0;
  let b = 0;
  for (const [home, away] of sets) {
    if (home > away) a += 1;
    else if (away > home) b += 1;
  }
  return a > b ? "a" : b > a ? "b" : undefined;
}

export interface DemoEvent {
  readonly detail: OperatorSessionDetail;
  readonly divisions: OperatorDivisionDetail[];
  readonly competition: TournamentCompetitionSnapshot;
}

/** One fixture event, in the shapes `operator.sessionDetail`, `divisionDetail` and `tournamentCompetition` answer. */
export function demoEvent(
  sessionId: string,
  place: Place,
  nowMs: number,
  store: DemoEventsStore,
): DemoEvent | undefined {
  const session = demoSessions(place, nowMs, store).find(
    (candidate) => candidate.id === sessionId,
  );
  if (!session) return undefined;
  const startsAt = Date.parse(session.startsAt);
  const divisions = divisionsOf(sessionId, nowMs, store);
  const courts = place.courts;
  const built = divisions.map((division, divisionIndex) => {
    const matches = matchesOf(
      sessionId,
      division,
      divisionIndex,
      startsAt,
      nowMs,
      Math.max(1, courts.length),
    ).map((match) => {
      const moved = store.schedule[match.id];
      const result = store.results[match.id];
      const courtIndex = moved?.courtId
        ? Math.max(
            0,
            courts.findIndex((court) => court.id === moved.courtId),
          )
        : match.courtIndex;
      return {
        ...match,
        courtIndex,
        ...(moved?.scheduledAt
          ? { scheduledAt: Date.parse(moved.scheduledAt) }
          : {}),
        ...(result ? { sets: result, state: "complete" as const } : {}),
      };
    });
    return { division, matches };
  });
  const teamEntry = (
    team: DemoTeam,
    division: DemoDivision,
  ): OperatorSessionDetail["teams"][number] => ({
    id: team.id,
    registrationId: team.registrationId,
    divisionId: division.id,
    divisionName: division.name,
    teamId: team.id,
    name: team.name,
    captainName: team.players[0],
    registrationStatus:
      team.selection === "waitlisted" ? "waitlisted" : "confirmed",
    selectionStatus: team.selection,
    selectionLocked: false,
    ...(team.seed && team.selection === "confirmed" ? { seed: team.seed } : {}),
    registeredAt: team.registeredAt,
    ...(team.paid === 2 ? { fullyPaidAt: team.registeredAt } : {}),
    fullyPaid: team.paid === 2,
    expectedTeamSize: 2,
    playersAdded: 2,
    claimedPlayers: 2,
    paidPlayers: team.paid,
    paymentMode: "self",
    status: team.paid === 2 ? "confirmed" : "ready",
    needsAttention: team.paid < 2,
    expiresAt: new Date(startsAt).toISOString(),
    roster: team.players.map((name, index) => ({
      displayName: name,
      status: index === 0 ? ("captain" as const) : ("selected" as const),
      paid: index < team.paid,
    })),
  });
  const teams = divisions.flatMap((division) =>
    division.teams.map((team) => teamEntry(team, division)),
  );
  const refunded = new Set(store.refunded);
  const paying = divisions.flatMap((division) =>
    division.teams
      .filter((team) => team.paid > 0 && team.selection !== "pending")
      .map((team) => ({ team, division })),
  );
  const orders = paying.map(({ team, division }) => {
    const cash = refunded.has(team.registrationId)
      ? 0
      : Math.round((division.feeMinor * team.paid) / 2);
    return {
      orderId: team.registrationId.replace(/^7e/, "7f"),
      buyerName: team.players[0],
      totalMinor: Math.round((division.feeMinor * team.paid) / 2),
      cashRefundMinor: cash,
      creditsToRestore: 0,
      creditValueMinor: 0,
    };
  });
  const grossMinor = orders.reduce((sum, order) => sum + order.totalMinor, 0);
  const refundedMinor = orders.reduce(
    (sum, order) => sum + (order.totalMinor - order.cashRefundMinor),
    0,
  );
  const attendees: OperatorSessionDetail["attendees"] = paying.map(
    ({ team }, index) => {
      const status = refunded.has(team.registrationId)
        ? ("refunded" as const)
        : team.selection === "waitlisted"
          ? ("waitlisted" as const)
          : ("confirmed" as const);
      return {
        id: team.registrationId,
        sessionId,
        personId: id(700 + index),
        displayName: team.players[0],
        status,
        orderId: orders[index]!.orderId,
        ticketCount: 1,
        registeredAt: team.registeredAt,
        attendanceStatus:
          (store.attendance[team.registrationId] as
            "scheduled" | "attended" | "no-show" | "cancelled" | undefined) ??
          "scheduled",
        paidMinor: orders[index]!.totalMinor,
        refundedMinor:
          orders[index]!.totalMinor - orders[index]!.cashRefundMinor,
        identityStatus: "connected",
        paymentStatus: team.paid === 2 ? "paid" : "payment-due",
      };
    },
  );
  const cancelled = session.status === "cancelled";
  const live = sessionId === demoEventIds.live && !cancelled;
  const arrivalNames = live
    ? (built[0]?.matches
        .filter((match) => match.state === "scheduled" && match.teamA)
        .slice(0, 3)
        .flatMap((match) => [match.teamA!.players[0], match.teamB!.players[0]])
        .filter((name, index, all) => all.indexOf(name) === index) ?? [])
    : [];
  const notes = [
    ...store.notes
      .filter((note) => note.sessionId === sessionId)
      .map((note) => ({
        id: note.id,
        sessionId,
        sessionTitle: session.title,
        authorPersonId: id(990),
        authorName: "You",
        ...(note.subject ? { subject: note.subject } : {}),
        visibility: note.visibility,
        source: "typed" as const,
        summary: note.summary,
        status: store.sharedNotes.includes(note.id)
          ? ("published" as const)
          : ("draft" as const),
        recipients: [],
        ...(store.sharedNotes.includes(note.id)
          ? { publishedAt: note.createdAt }
          : {}),
        createdAt: note.createdAt,
      })),
  ];
  const detail: OperatorSessionDetail = {
    session,
    arrivalBoard: {
      sessionId,
      venueName: place.venueName,
      startsAt: session.startsAt,
      expectedPlayers: live ? 24 : 0,
      sharingWindow: {
        opensAt: new Date(startsAt - HOUR).toISOString(),
        closesAt: new Date(startsAt + 30 * 60_000).toISOString(),
        active: live,
        phase: live ? "active" : "closed",
      },
      signals: arrivalNames.map((name, index) => ({
        sessionId,
        personId: id(800 + index),
        displayName: name,
        role: "player" as const,
        status:
          index % 3 === 0
            ? ("arrived" as const)
            : index % 3 === 1
              ? ("on-time" as const)
              : ("running-late" as const),
        distanceMeters: index % 3 === 0 ? 0 : 1_200 * index,
        travelDurationSeconds: index % 3 === 0 ? 0 : 240 * index,
        leaveBy: new Date(nowMs).toISOString(),
        routeSource: "distance-estimate" as const,
        observedAt: new Date(nowMs - 120_000).toISOString(),
        expiresAt: new Date(nowMs + HOUR).toISOString(),
      })),
    },
    entryDivisions: divisions.map((division) => ({
      id: division.id,
      name: division.name,
      teamSize: 2,
      entryFeeMinor: division.feeMinor,
      currency: "USD",
    })),
    coaches: [],
    attendees,
    teams,
    cancellationPreview: {
      sessionId,
      sessionStatus: session.status,
      registrationCount: cancelled
        ? 0
        : attendees.filter((a) => a.status !== "refunded").length,
      orderCount: cancelled
        ? 0
        : orders.filter((order) => order.cashRefundMinor > 0).length,
      cashRefundMinor: cancelled
        ? 0
        : orders.reduce((sum, order) => sum + order.cashRefundMinor, 0),
      creditsToRestore: 0,
      creditValueMinor: 0,
      currency: "USD",
      orders: cancelled
        ? orders.map((order) => ({ ...order, cashRefundMinor: 0 }))
        : orders,
    },
    finance: {
      grossMinor,
      refundedMinor: cancelled ? grossMinor : refundedMinor,
      netMinor: cancelled ? 0 : grossMinor - refundedMinor,
      currency: "USD",
      paidOrders: orders.length,
    },
    operations: {
      ...(cancelled
        ? {
            cancellationKind: "operator" as const,
            cancellationReason: "Cancelled in the demo.",
            cancelledByName: "You",
            cancelledAt: new Date(nowMs).toISOString(),
            refundStatus: "complete" as const,
          }
        : {}),
      weatherStatus: live ? "forecast-ready" : "not-captured",
      ...(live
        ? {
            weather: {
              condition: "Sunny",
              temperatureC: 24,
              windSpeedKph: 14,
              precipitationProbability: 5,
              source: "Demo forecast",
              observedAt: new Date(nowMs).toISOString(),
            },
            weatherKind: "forecast" as const,
          }
        : {}),
    },
    notes,
    videos: [],
  };
  const divisionDetails: OperatorDivisionDetail[] = built.map(
    ({ division, matches }) => ({
      session: {
        id: sessionId,
        title: session.title,
        kind: session.kind,
        status: session.status,
        startsAt: session.startsAt,
        timezone: session.timezone,
        ...(session.venueId ? { venueId: session.venueId } : {}),
      },
      division: {
        id: division.id,
        name: division.name,
        discipline: "beach",
        teamSize: 2,
        capacity: division.maximumTeams * 2,
        maximumTeams: division.maximumTeams,
        entryFeeMinor: division.feeMinor,
        seeding: "rating",
        tournamentFormat: division.pools.length
          ? "pool-play"
          : "single-elimination",
        ...(division.pools.length
          ? {
              poolPlay: {
                enabled: true,
                teamsPerPool: 4,
                format: "full" as const,
                teamsAdvancing: 2,
              },
            }
          : {}),
        registrationClosesAt: session.registrationClosesAt,
        ...(division.seedsFinal
          ? { seedingFinalizedAt: new Date(startsAt - 2 * DAY).toISOString() }
          : {}),
      },
      teams: teams.filter((team) => team.divisionId === division.id),
      ...(division.bracket
        ? {
            bracket: {
              id: id(
                600 + built.findIndex((entry) => entry.division === division),
              ),
              version: 1,
              format: division.pools.length
                ? "pool-play"
                : "single-elimination",
              structure: {},
              ...(division.live
                ? { liveAt: new Date(startsAt - DAY).toISOString() }
                : {}),
              ...(division.drawFinal
                ? {
                    drawFinalizedAt: new Date(
                      startsAt - DAY - HOUR,
                    ).toISOString(),
                  }
                : {}),
              poolOverrideCount: 0,
              createdAt: new Date(startsAt - DAY - 2 * HOUR).toISOString(),
            },
          }
        : {}),
      matches: matches.map((match) => ({
        id: match.id,
        status: match.state,
        label: match.label,
        ...(match.teamA ? { teamAName: match.teamA.name } : {}),
        ...(match.teamB ? { teamBName: match.teamB.name } : {}),
        ...(match.scheduledAt !== undefined && courts[match.courtIndex]
          ? {
              courtId: courts[match.courtIndex]!.id,
              courtName: courts[match.courtIndex]!.name,
            }
          : {}),
        ...(match.scheduledAt !== undefined
          ? { scheduledAt: new Date(match.scheduledAt).toISOString() }
          : {}),
      })),
      courts: [...courts],
    }),
  );
  const competitionTeam = (team: DemoTeam) => ({
    id: team.id,
    name: team.name,
    ...(team.seed ? { seed: team.seed } : {}),
  });
  const competitionMatch = (match: DemoMatch) => {
    const winner =
      match.state === "complete" ? winnerOf(match.sets) : undefined;
    return {
      id: match.id,
      logicalId: match.logicalId,
      bracket: match.bracket,
      round: match.round,
      position: match.position,
      label: match.label,
      status: match.state,
      ...(match.teamA ? { teamA: competitionTeam(match.teamA) } : {}),
      ...(match.teamB ? { teamB: competitionTeam(match.teamB) } : {}),
      ...(winner === "a" && match.teamA
        ? { winnerTeamId: match.teamA.id }
        : winner === "b" && match.teamB
          ? { winnerTeamId: match.teamB.id }
          : {}),
      ...(match.scheduledAt !== undefined && courts[match.courtIndex]
        ? { courtName: courts[match.courtIndex]!.name }
        : {}),
      ...(match.scheduledAt !== undefined
        ? { scheduledAt: new Date(match.scheduledAt).toISOString() }
        : {}),
      ...(match.state === "complete" && match.scheduledAt !== undefined
        ? {
            completedAt: new Date(
              match.scheduledAt + 40 * 60_000,
            ).toISOString(),
          }
        : {}),
      score: {
        status:
          match.state === "complete"
            ? ("complete" as const)
            : match.state === "live"
              ? ("live" as const)
              : ("not-started" as const),
        sets: match.sets.map(
          ([home, away]) => [home, away] as [number, number],
        ),
      },
    };
  };
  const competition: TournamentCompetitionSnapshot = {
    session: {
      id: sessionId,
      title: session.title,
      status: session.status,
      timezone: session.timezone,
      updatedAt: new Date(nowMs).toISOString(),
    },
    divisions: built.map(({ division, matches }) => {
      const field = division.teams.filter(
        (team) => team.selection === "confirmed",
      );
      const poolKeys = division.pools.map((_, index) =>
        String.fromCharCode(65 + index),
      );
      return {
        id: division.id,
        name: division.name,
        competitionVersion: 1,
        format: division.pools.length ? "pool-play" : "single-elimination",
        ...(division.live
          ? { liveAt: new Date(startsAt - DAY).toISOString() }
          : {}),
        pools: division.pools.map((pool, poolIndex) => {
          const key = poolKeys[poolIndex]!;
          const poolMatches = matches.filter((match) => match.pool === key);
          const poolTeams = pool.map((index) => field[index]!).filter(Boolean);
          const standings = poolTeams
            .map((team) => {
              let wins = 0;
              let losses = 0;
              let sets = 0;
              let points = 0;
              for (const match of poolMatches) {
                if (match.state !== "complete") continue;
                const home = match.teamA?.id === team.id;
                const away = match.teamB?.id === team.id;
                if (!home && !away) continue;
                const winner = winnerOf(match.sets);
                if ((winner === "a" && home) || (winner === "b" && away))
                  wins += 1;
                else losses += 1;
                for (const [a, b] of match.sets) {
                  const mine = home ? a : b;
                  const theirs = home ? b : a;
                  points += mine - theirs;
                  sets += mine > theirs ? 1 : -1;
                }
              }
              return {
                team: competitionTeam(team),
                wins,
                losses,
                setDifferential: sets,
                pointDifferential: points,
              };
            })
            .sort(
              (left, right) =>
                right.wins - left.wins ||
                right.setDifferential - left.setDifferential ||
                right.pointDifferential - left.pointDifferential,
            );
          return {
            key,
            teams: poolTeams.map(competitionTeam),
            completedMatches: poolMatches.filter(
              (match) => match.state === "complete",
            ).length,
            matchCount: poolMatches.length,
            standings,
          };
        }),
        rounds: [
          ...new Map(
            matches
              .filter((match) => match.bracket !== "pool")
              .map((match) => [
                `${match.bracket}-${match.round}`,
                {
                  key: `${match.bracket}-${match.round}`,
                  label: match.bracket === "final" ? "Final" : "Semifinals",
                  bracket: match.bracket,
                  round: match.round,
                  matches: matches
                    .filter(
                      (candidate) =>
                        candidate.bracket === match.bracket &&
                        candidate.round === match.round,
                    )
                    .map(competitionMatch),
                },
              ]),
          ).values(),
        ],
        matches: matches.map(competitionMatch),
      };
    }),
  };
  return { detail, divisions: divisionDetails, competition };
}

/** A change kept for the demo club's own sessions (the API's demo detail). */
export function applyDemoToDetail(
  detail: OperatorSessionDetail,
  store: DemoEventsStore,
): OperatorSessionDetail {
  const sessionId = detail.session.id;
  const refunded = new Set(store.refunded);
  return {
    ...detail,
    session: {
      ...detail.session,
      status: sessionStatus(sessionId, detail.session.status, store),
    },
    attendees: detail.attendees.map((attendee) => ({
      ...attendee,
      ...(store.attendance[attendee.id]
        ? {
            attendanceStatus: store.attendance[attendee.id] as
              "scheduled" | "attended" | "no-show" | "cancelled",
          }
        : {}),
      ...(refunded.has(attendee.id)
        ? { status: "refunded" as const, refundedMinor: attendee.paidMinor }
        : {}),
    })),
    notes: [
      ...detail.notes.map((note) =>
        store.sharedNotes.includes(note.id)
          ? { ...note, status: "published" as const }
          : note,
      ),
      ...store.notes
        .filter((note) => note.sessionId === sessionId)
        .map((note) => ({
          id: note.id,
          sessionId,
          sessionTitle: detail.session.title,
          authorPersonId: id(990),
          authorName: "You",
          ...(note.subject ? { subject: note.subject } : {}),
          visibility: note.visibility,
          source: "typed" as const,
          summary: note.summary,
          status: store.sharedNotes.includes(note.id)
            ? ("published" as const)
            : ("draft" as const),
          recipients: [],
          createdAt: note.createdAt,
        })),
    ],
    cancellationPreview: refunded.size
      ? {
          ...detail.cancellationPreview,
          orders: detail.cancellationPreview.orders.map((order) => {
            const attendee = detail.attendees.find(
              (candidate) => candidate.orderId === order.orderId,
            );
            return attendee && refunded.has(attendee.id)
              ? { ...order, cashRefundMinor: 0, creditsToRestore: 0 }
              : order;
          }),
        }
      : detail.cancellationPreview,
  };
}
