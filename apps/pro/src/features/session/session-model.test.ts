import { participationToken, renderParticipationCopy } from "@duna/core";
import { describe, expect, it } from "vitest";
import { atRiskRows } from "./at-risk";
import {
  cancelSummary,
  matchesForSession,
  rosterOrder,
  rosterSummary,
  sessionActions,
  sessionCopy,
  sessionDisplay,
  sessionFromAtRisk,
  sessionFromCalendar,
  sessionFromOccurrence,
  sessionPhase,
  withAtRisk,
  type CalendarSessionInput,
  type OccurrenceInput,
  type SessionDetail,
} from "./session-model";

const HOUR = 60 * 60_000;
const NOW = Date.parse("2026-12-08T17:00:00.000Z");
const at = (hours: number) => new Date(NOW + hours * HOUR).toISOString();
const ZONE = "America/Los_Angeles";

const calendar: CalendarSessionInput = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceType: "session",
  title: "Group clinic",
  startsAt: at(2),
  endsAt: at(3.5),
  timezone: ZONE,
  status: "scheduled",
  kind: "clinic",
  venueId: "22222222-2222-4222-8222-222222222222",
  venueName: "Pier Courts",
  courtName: "Courts 1–2",
  coachName: "Jordan Cruz",
  participantCount: 3,
  capacity: 8,
  attendees: [
    {
      registrationId: "r-1",
      displayName: "Maya Rivera",
      status: "paid",
      isMinor: false,
    },
    {
      registrationId: "r-2",
      displayName: "Kai Brooks",
      status: "confirmed",
      isMinor: true,
    },
    {
      registrationId: "r-3",
      displayName: "Alex Chen",
      status: "payment-pending",
      isMinor: false,
    },
    {
      registrationId: "r-4",
      displayName: "Drew Park",
      status: "waitlisted",
      isMinor: false,
    },
  ],
  equipment: [],
};

function occurrence(
  overrides: Partial<NonNullable<OccurrenceInput["participation"]>> = {},
): OccurrenceInput {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    catalogItemId: "44444444-4444-4444-8444-444444444444",
    title: "Thursday clinic",
    startsAt: at(26),
    endsAt: at(27.5),
    timezone: ZONE,
    status: "scheduled",
    capacity: 8,
    confirmedCount: 3,
    participation: {
      bookedCount: 3,
      minParticipants: 4,
      minimumPolicy: "cancel",
      decisionAt: at(2),
      lockAt: at(2),
      displayState: "needs-players",
      waitlistCount: 0,
      heldCount: 0,
      ...overrides,
    },
    bookings: [
      {
        fulfillmentId: "f-1",
        personId: "p-1",
        displayName: "Maya Rivera",
        payerPersonId: "p-1",
        quantity: 1,
        paymentMethod: "credit",
        confirmed: true,
        reservedCredits: 3,
      },
      {
        fulfillmentId: "f-2",
        personId: "p-2",
        displayName: "Jordan Smith",
        payerPersonId: "p-2",
        quantity: 1,
        paymentMethod: "credit",
        confirmed: true,
        reservedCredits: 3,
      },
      {
        fulfillmentId: "f-3",
        personId: "p-3",
        displayName: "Theo Park",
        payerPersonId: "p-3",
        quantity: 1,
        paymentMethod: "card",
        confirmed: true,
        reservedCredits: 0,
      },
    ],
  };
}

const keys = (detail: SessionDetail, audience: "coach" | "owner", now = NOW) =>
  sessionActions(detail, { audience, now }).map((entry) => entry.key);

describe("session model: sources", () => {
  it("reads a calendar session: roster, juniors' guardian note, payment words", () => {
    const detail = sessionFromCalendar(calendar, "UTC");
    expect(detail.attendanceTarget).toBe("registration");
    expect(detail.subject).toBeNull();
    expect(detail.audienceKey).toBe(`event:${calendar.id}`);
    const kai = detail.people.find((p) => p.displayName === "Kai Brooks")!;
    expect(kai.junior).toBe(true);
    expect(kai.guardianNote).toBe("Junior · their guardian gets updates");
    expect(detail.people.find((p) => p.bookingId === "r-1")!.payment).toBe(
      "Paid",
    );
    expect(detail.people.find((p) => p.bookingId === "r-3")!.payment).toBe(
      "Not paid yet",
    );
    const drew = detail.people.find((p) => p.bookingId === "r-4")!;
    expect(drew.active).toBe(false);
    expect(drew.waitlisted).toBe(true);
    expect(rosterOrder(detail.people).at(-1)!.displayName).toBe("Drew Park");
  });

  it("shows money amounts only when Duna returned them to this viewer", () => {
    const coach = sessionFromOccurrence(occurrence());
    expect(coach.moneyVisible).toBe(false);
    expect(coach.people[0]!.payment).toBe("Reserved");
    const director = sessionFromOccurrence(occurrence({ atStakeCredits: 6 }));
    expect(director.moneyVisible).toBe(true);
    expect(director.people[0]!.payment).toBe("Reserved 3 credits");
  });

  it("joins the at-risk list onto a session it describes", () => {
    const risk = {
      subjectId: "33333333-3333-4333-8333-333333333333",
      title: "Thursday clinic",
      startsAt: at(26),
      timezone: ZONE,
      coachNames: ["Theo Park"],
      booked: 3,
      min: 4,
      capacity: 8,
      lockAt: at(2),
      displayState: "needs-players",
    };
    const joined = withAtRisk(sessionFromCalendar(calendar, "UTC"), risk);
    expect(joined.subject?.subjectId).toBe(risk.subjectId);
    expect(joined.group?.minimum).toBe(4);
    expect(sessionFromAtRisk(risk).coachName).toBe("Theo Park");
  });
});

describe("session model: state words come from the shared core", () => {
  it("needs players: the shared status, staff line and accessible summary", () => {
    const detail = sessionFromOccurrence(occurrence());
    const display = sessionDisplay(detail, NOW);
    expect(display.state).toBe("needs-players");
    const copy = sessionCopy(display);
    expect(copy.status).toBe(
      renderParticipationCopy(participationToken("status.needs", { n: 1 })),
    );
    expect(copy.status).toBe("Needs 1 more");
    expect(copy.staff).toMatch(/^At risk · needs 1 by /);
    expect(copy.a11y).toContain("3 of 8 places booked.");
  });

  it("decided states use the shared words", () => {
    const confirmed = sessionCopy(
      sessionDisplay(
        sessionFromOccurrence(
          occurrence({ displayState: "confirmed", bookedCount: 5 }),
        ),
        NOW,
      ),
    );
    expect(confirmed.staff).toBe("Confirmed · 5");
    const small = sessionCopy(
      sessionDisplay(
        sessionFromOccurrence(occurrence({ displayState: "running-small" })),
        NOW,
      ),
    );
    expect(small.status).toBe("Confirmed · small group");
    expect(small.staff).toBe("Running with 3 of 4");
  });

  it("a session without a group rule shows capacity only", () => {
    const copy = sessionCopy(
      sessionDisplay(sessionFromCalendar(calendar, "UTC"), NOW),
    );
    expect(copy.status).toBe("5 spots left");
  });

  it("a cancelled session reads as cancelled by the club", () => {
    const detail = {
      ...sessionFromCalendar(calendar, "UTC"),
      cancelled: true,
    };
    expect(sessionDisplay(detail, NOW).state).toBe("cancelled-club");
    expect(sessionPhase(detail, NOW)).toBe("cancelled");
  });
});

describe("session model: role → actions", () => {
  const group = sessionFromOccurrence(occurrence());

  it("a coach nudges, messages and requests a cancel before a group session", () => {
    expect(keys(group, "coach")).toEqual([
      "nudge",
      "message",
      "request-cancel",
    ]);
  });

  it("a director extends, runs anyway or cancels and refunds instead", () => {
    expect(keys(group, "owner")).toEqual([
      "nudge",
      "message",
      "extend",
      "run-anyway",
      "cancel-refund",
    ]);
  });

  it("run anyway only before the decision, and only when the rule cancels", () => {
    const afterLock = keys(group, "owner", NOW + 3 * HOUR);
    expect(afterLock).not.toContain("run-anyway");
    expect(afterLock).not.toContain("nudge");
    const runs = sessionFromOccurrence(occurrence({ minimumPolicy: "run" }));
    expect(keys(runs, "owner")).not.toContain("run-anyway");
  });

  it("courtside: check-in during the session, attendance after it", () => {
    const live = Date.parse(occurrence().startsAt) + 10 * 60_000;
    expect(keys(group, "coach", live)[0]).toBe("check-in");
    const ended = Date.parse(occurrence().endsAt) + 10 * 60_000;
    expect(keys(group, "coach", ended)[0]).toBe("attendance");
    expect(keys(group, "coach", ended)).not.toContain("request-cancel");
  });

  it("calendar sessions: check-in opens an hour before, stop play at the court", () => {
    const detail = sessionFromCalendar(calendar, "UTC");
    const soon = Date.parse(calendar.startsAt) - 30 * 60_000;
    expect(keys(detail, "coach", soon)).toEqual([
      "check-in",
      "message",
      "stop-play",
    ]);
    expect(keys(detail, "owner", soon)).toContain("cancel-session");
    expect(keys(detail, "coach", soon)).not.toContain("cancel-session");
    const live = Date.parse(calendar.startsAt) + 5 * 60_000;
    expect(
      sessionActions(detail, { audience: "coach", now: live, hasMatches: true })
        .map((entry) => entry.key)
        .slice(0, 2),
    ).toEqual(["check-in", "score"]);
  });

  it("a cancelled or closed session only keeps messaging", () => {
    const closed = Date.parse(occurrence().endsAt) + 25 * HOUR;
    expect(keys(group, "owner", closed)).toEqual(["message"]);
  });

  it("destructive actions carry the strong tier", () => {
    const actions = sessionActions(group, { audience: "owner", now: NOW });
    expect(actions.find((entry) => entry.key === "cancel-refund")?.tier).toBe(
      2,
    );
    expect(actions.find((entry) => entry.key === "extend")?.tier).toBe(1);
  });
});

describe("session model: roster, cancellation, matches", () => {
  it("counts the phone's queued marks on top of Duna's", () => {
    const detail = sessionFromCalendar(calendar, "UTC");
    const queued = new Map([
      ["r-1", "attended" as const],
      ["r-2", "absent" as const],
    ]);
    expect(rosterSummary(detail.people, queued)).toEqual({
      booked: 3,
      here: 1,
      absent: 1,
      unmarked: 1,
    });
  });

  it("restates who gets what back, amounts only for money roles", () => {
    const coach = cancelSummary(
      sessionFromOccurrence(occurrence()),
      occurrence(),
    );
    expect(coach.line).toBe(
      "3 people · credits back to wallets · 1 card refund",
    );
    expect(coach.credits).toBeUndefined();
    const source = occurrence({ atStakeCredits: 6 });
    const director = cancelSummary(sessionFromOccurrence(source), source);
    expect(director.line).toBe(
      "3 people · 6 credits back to wallets · 1 card refund",
    );
  });

  it("links matches by session title or court and time, live first", () => {
    const detail = sessionFromCalendar(calendar, "UTC");
    const matches = matchesForSession(detail, [
      {
        id: "m-later",
        status: "scheduled",
        scheduledAt: at(2.5),
        courtName: "Courts 1–2",
        teamA: { name: "A" },
        teamB: { name: "B" },
      },
      {
        id: "m-live",
        status: "live",
        sessionTitle: "Group clinic",
        teamA: { name: "C" },
        teamB: { name: "D" },
      },
      {
        id: "m-elsewhere",
        status: "scheduled",
        scheduledAt: at(2.5),
        courtName: "Court 9",
        teamA: { name: "E" },
        teamB: { name: "F" },
      },
      {
        id: "m-done",
        status: "complete",
        sessionTitle: "Group clinic",
        teamA: { name: "G" },
        teamB: { name: "H" },
      },
    ]);
    expect(matches.map((match) => match.id)).toEqual(["m-live", "m-later"]);
  });
});

describe("at risk this week", () => {
  const risk = (id: string, lockHours: number, booked = 3) => ({
    subjectId: id,
    title: `Session ${id}`,
    startsAt: at(lockHours + 24),
    timezone: ZONE,
    booked,
    min: 4,
    capacity: 8,
    lockAt: at(lockHours),
    displayState: "needs-players",
  });

  it("rows carry the shared compact state and a countdown, soonest first", () => {
    const rows = atRiskRows([risk("b", 30, 2), risk("a", 3)], NOW);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(rows[0]!.status).toBe("Needs 1 more");
    expect(rows[1]!.status).toBe("Needs 2 more");
    expect(rows[0]!.countdown).toBe("in 3h 00m");
    expect(rows[1]!.countdown).toBe("in 1d 6h");
    expect(rows[0]!.staff).toMatch(/^At risk · needs 1 by /);
    expect(rows[0]!.accessibilityLabel).toContain("Decision in 3h 00m");
  });

  it("drops sessions that reached their minimum or are past the week", () => {
    expect(atRiskRows([risk("full", 3, 4)], NOW)).toEqual([]);
    expect(atRiskRows([risk("far", 24 * 8)], NOW)).toEqual([]);
  });

  it("past the decision the row keeps its state without a countdown", () => {
    const rows = atRiskRows([risk("late", -1)], NOW);
    expect(rows[0]!.countdown).toBeNull();
  });
});
