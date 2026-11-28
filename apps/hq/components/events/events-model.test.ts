import { describe, expect, it } from "vitest";
import {
  demoEvent,
  demoEventIds,
  demoSessions,
  emptyDemoEvents,
  parseDemoEvents,
  serializeDemoEvents,
  type DemoEventsStore,
} from "./events-demo";
import {
  defaultSegment,
  entriesCsv,
  eventPermissionsFrom,
  eventRows,
  eventView,
  feeChangePreview,
  instantToLocalInput,
  launchSteps,
  localInputToInstant,
  nextStep,
  parseEventType,
  rowsFor,
  scheduleGroups,
  segmentOf,
  statusWords,
  type EventPermissions,
} from "./events-model";

const now = Date.parse("2026-11-28T18:20:00Z");
const place = {
  venueId: "10000000-0000-4000-8000-000000000101",
  venueName: "Beach Elite Training Center",
  timeZone: "America/Los_Angeles",
  courts: [
    { id: "10000000-0000-4000-8000-000000000103", name: "Championship Court" },
    { id: "10000000-0000-4000-8000-000000000104", name: "Community Court" },
  ],
};
const owner: EventPermissions = {
  change: true,
  refund: true,
  money: true,
  checkIn: true,
  message: true,
};
const coach: EventPermissions = {
  change: false,
  refund: false,
  money: false,
  checkIn: true,
  message: false,
};

function view(
  id: string,
  permissions = owner,
  store: DemoEventsStore = emptyDemoEvents,
) {
  const event = demoEvent(id, place, now, store)!;
  return eventView({
    detail: event.detail,
    divisions: event.divisions,
    competition: event.competition,
    courts: place.courts,
    permissions,
    nowMs: now,
  });
}

describe("which list an event is in", () => {
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  it("puts drafts, live, upcoming and past apart", () => {
    expect(
      segmentOf({ status: "draft", startsAt: at(-1), endsAt: at(1) }, now),
    ).toBe("drafts");
    expect(
      segmentOf(
        { status: "registration-open", startsAt: at(-1), endsAt: at(1) },
        now,
      ),
    ).toBe("live");
    expect(
      segmentOf({ status: "live", startsAt: at(2), endsAt: at(4) }, now),
    ).toBe("live");
    expect(
      segmentOf(
        { status: "registration-open", startsAt: at(2), endsAt: at(4) },
        now,
      ),
    ).toBe("upcoming");
    expect(
      segmentOf(
        { status: "registration-open", startsAt: at(-4), endsAt: at(-2) },
        now,
      ),
    ).toBe("past");
    expect(
      segmentOf({ status: "cancelled", startsAt: at(2), endsAt: at(4) }, now),
    ).toBe("past");
  });

  it("uses the live tone only while the event is in play", () => {
    const live = statusWords(
      { status: "live", startsAt: at(-1), endsAt: at(1) },
      now,
    );
    expect(live).toEqual({ label: "Live now", tone: "live" });
    const tones = [
      statusWords(
        { status: "registration-open", startsAt: at(2), endsAt: at(4) },
        now,
      ),
      statusWords(
        { status: "completed", startsAt: at(-4), endsAt: at(-2) },
        now,
      ),
      statusWords({ status: "draft", startsAt: at(2), endsAt: at(4) }, now),
      statusWords(
        { status: "weather-hold", startsAt: at(-1), endsAt: at(1) },
        now,
      ),
      statusWords(
        {
          status: "registration-open",
          startsAt: at(20),
          endsAt: at(24),
          registrationClosesAt: at(-1),
        },
        now,
      ),
    ].map((words) => words.tone);
    expect(tones).not.toContain("live");
  });

  it("reads the old type slugs as filters", () => {
    expect(parseEventType("league")).toBe("league");
    expect(parseEventType("tournaments")).toBe("tournament");
    expect(parseEventType("open-play")).toBe("open-play");
    expect(parseEventType("nonsense")).toBeUndefined();
  });

  it("lists, filters and orders rows, and opens on what is live", () => {
    const sessions = demoSessions(place, now, emptyDemoEvents);
    const rows = eventRows(sessions, [], now);
    expect(defaultSegment(rows)).toBe("live");
    expect(rowsFor(rows, "live").map((row) => row.title)).toEqual([
      "Harbor Doubles Classic",
    ]);
    expect(rowsFor(rows, "drafts").map((row) => row.title)).toEqual([
      "Thursday night league",
    ]);
    expect(rowsFor(rows, "past", { kind: "tournament" })).toHaveLength(1);
    expect(rowsFor(rows, "past", { kind: "league" })).toHaveLength(0);
    expect(rowsFor(rows, "drafts", { query: "THURSDAY" })).toHaveLength(1);
    expect(rowsFor(rows, "drafts", { query: "harbor" })).toHaveLength(0);
  });
});

describe("the open event", () => {
  it("shows a live tournament's field, waitlist, courts and next step", () => {
    const live = view(demoEventIds.live);
    expect(live.live).toBe(true);
    expect(live.tone).toBe("live");
    expect(live.competition).toBe(true);
    expect(live.divisions.map((division) => division.name)).toEqual([
      "Open doubles",
      "Women's AA",
    ]);
    expect(live.entries).toBe(12);
    expect(live.waitlist).toBe(2);
    expect(live.matches.some((match) => match.live)).toBe(true);
    expect(live.matches[0]!.live).toBe(true); // what is on court comes first
    expect(live.launch.every((step) => step.done)).toBe(false); // unscheduled matches remain
    expect(live.next.kind).toBe("tab");
    expect(live.divisions[0]!.pools).toHaveLength(2);
    expect(live.divisions[0]!.rounds.map((round) => round.label)).toEqual([
      "Semifinals",
      "Final",
    ]);
  });

  it("never shows event money to desk collectors (coach, front desk)", () => {
    const coachScopes = eventPermissionsFrom({
      change: false,
      checkIn: true,
      paymentsRead: false,
      paymentsWrite: false,
      messagesPropose: true,
    });
    expect(coachScopes.money).toBe(false);
    expect(coachScopes.refund).toBe(false);
    const manager = eventPermissionsFrom({
      change: true,
      checkIn: true,
      paymentsRead: true,
      paymentsWrite: false,
      messagesPropose: true,
    });
    expect(manager).toMatchObject({ money: true, refund: false });
    expect(view(demoEventIds.live, coachScopes).money).toBeUndefined();
  });

  it("builds money only for people who may see it", () => {
    expect(view(demoEventIds.live).money?.gross).toMatch(/^\$/);
    expect(view(demoEventIds.live, coach).money).toBeUndefined();
    expect(view(demoEventIds.live, coach).next).toEqual({
      kind: "tab",
      tab: "schedule",
      label: "Run the courts",
    });
  });

  it("asks to publish a draft, and only someone who may change it", () => {
    expect(view(demoEventIds.draftLeague).next).toEqual({ kind: "publish" });
    expect(view(demoEventIds.draftLeague, coach).next).toEqual({
      kind: "none",
    });
  });

  it("walks the launch: close, ready each division, then publish", () => {
    const published = view(demoEventIds.draftLeague, owner, {
      ...emptyDemoEvents,
      published: [demoEventIds.draftLeague],
    });
    expect(published.next).toEqual({ kind: "close-registration" });
    const closed = view(demoEventIds.draftLeague, owner, {
      ...emptyDemoEvents,
      published: [demoEventIds.draftLeague],
      closed: [demoEventIds.draftLeague],
    });
    expect(closed.next).toMatchObject({ kind: "tab", tab: "brackets" });
    const steps = launchSteps({ registrationClosed: true, divisions: [] });
    expect(steps.map((step) => step.id)).toEqual(["close", "publish"]);
    expect(
      nextStep({
        status: "registration-open",
        segment: "upcoming",
        competition: true,
        launch: [
          { id: "close", label: "Close registration", detail: "", done: true },
          {
            id: "publish",
            label: "Publish and set live",
            detail: "",
            done: false,
          },
        ],
        live: false,
        refundAttention: false,
        permissions: owner,
      }),
    ).toEqual({ kind: "publish-live" });
  });

  it("keeps a director's changes in the demo store", () => {
    const team = view(demoEventIds.live).divisions[0]!.teams[0]!;
    const moved = view(demoEventIds.live, owner, {
      ...emptyDemoEvents,
      selection: { [team.id]: { status: "waitlisted" } },
    });
    expect(moved.waitlist).toBe(3);
    const order = view(demoEventIds.live).money!.orders[0]!;
    const refunded = view(demoEventIds.live, owner, {
      ...emptyDemoEvents,
      refunded: [order.registrationId!],
    });
    expect(refunded.money!.orders[0]!.refunded).toBe(true);
    const cancelled = view(demoEventIds.live, owner, {
      ...emptyDemoEvents,
      cancelled: [demoEventIds.live],
    });
    expect(cancelled.live).toBe(false);
    expect(cancelled.tone).toBe("danger");
  });

  it("survives a damaged cookie and keeps it small", () => {
    expect(parseDemoEvents("{not json")).toEqual(emptyDemoEvents);
    const many = {
      ...emptyDemoEvents,
      notes: Array.from({ length: 40 }, (_, index) => ({
        id: `n${index}`,
        sessionId: demoEventIds.live,
        summary: "x".repeat(200),
        visibility: "private" as const,
        createdAt: new Date(now).toISOString(),
      })),
    };
    const kept = parseDemoEvents(serializeDemoEvents(many));
    expect(serializeDemoEvents(many).length).toBeLessThanOrEqual(3_600);
    expect(kept.notes.at(-1)!.id).toBe("n39");
  });
});

describe("money and the schedule", () => {
  it("says who gets what when a fee changes", () => {
    const division = view(demoEventIds.live).divisions[0]!;
    const lower = feeChangePreview(division, division.entryFeeMinor - 2_000);
    expect(lower.refunded).toBeGreaterThan(0);
    expect(lower.owing).toBe(0);
    // A team that paid half gets half the difference back.
    expect(lower.rows.some((row) => row.deltaMinor === -1_000)).toBe(true);
    const higher = feeChangePreview(division, division.entryFeeMinor + 1_000);
    expect(higher.owedMinor).toBeGreaterThan(0);
    expect(
      feeChangePreview(division, division.entryFeeMinor).rows.every(
        (row) => row.deltaMinor === 0,
      ),
    ).toBe(true);
  });

  it("groups matches: on court now first, then by time, unscheduled last", () => {
    const live = view(demoEventIds.live);
    const groups = scheduleGroups(live.matches, place.timeZone);
    expect(groups[0]!.label).toBe("On court now");
    expect(groups.at(-1)!.label).toBe("Not scheduled yet");
  });

  it("turns the place's wall time into an instant and back", () => {
    const instant = localInputToInstant(
      "2026-12-05T10:30",
      "America/Los_Angeles",
    );
    expect(instant).toBe("2026-12-05T18:30:00.000Z");
    expect(instantToLocalInput(instant!, "America/Los_Angeles")).toBe(
      "2026-12-05T10:30",
    );
    expect(localInputToInstant("tomorrow", "UTC")).toBeUndefined();
  });

  it("exports entries without contact details", () => {
    const csv = entriesCsv(view(demoEventIds.live));
    expect(csv.split("\n")[0]).toBe(
      "Division,Team,Players,Status,Seed,Payment",
    );
    expect(csv).toContain("Waitlist");
    expect(csv).not.toMatch(/@|\+1/);
  });
});

describe("an answer without money (PRIV-2)", () => {
  it("shows no money, no paid words and never $0 when the server sent none", () => {
    const event = demoEvent(demoEventIds.live, place, now, emptyDemoEvents)!;
    // What the API sends a scorekeeper: no finance, no amounts, no paid state.
    const { finance: _finance, ...rest } = event.detail;
    const unpaid = (teams: (typeof rest)["teams"]) =>
      teams.map(
        ({ fullyPaid: _f, paidPlayers: _pp, fullyPaidAt: _at, ...team }) => ({
          ...team,
          roster: team.roster.map(({ paid: _paid, ...player }) => player),
        }),
      );
    const detail = {
      ...rest,
      attendees: rest.attendees.map(
        ({ paidMinor: _p, refundedMinor: _r, paymentStatus: _s, ...a }) => a,
      ),
      teams: unpaid(rest.teams),
    };
    const divisions = event.divisions.map((division) => ({
      ...division,
      teams: unpaid(division.teams),
    }));
    const result = eventView({
      detail,
      divisions,
      competition: event.competition,
      courts: place.courts,
      permissions: owner,
      nowMs: now,
    });
    expect(result.money).toBeUndefined();
    const teams = result.divisions.flatMap((division) => division.teams);
    expect(teams.length).toBeGreaterThan(0);
    for (const team of teams) expect(team.payment).toBe("");
    expect(JSON.stringify(result)).not.toContain("Payment due");
  });
});
