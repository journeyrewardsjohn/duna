import {
  conciergeDemo,
  conciergeDemoProposals,
} from "@duna/core/demo/concierge";
import { describe, expect, it } from "vitest";
import {
  audiencesFor,
  channelStatuses,
  composeRoute,
  focusPerson,
  groupMessages,
  inboxHref,
  parseInboxState,
  personContextFrom,
  reviewSummary,
  threadsQuery,
  widgetsFrom,
} from "./inbox-model";

const id = "10000000-0000-4000-8000-000000000201";

describe("Inbox address", () => {
  it("reads filters, kind and ids, and drops anything unknown", () => {
    expect(
      parseInboxState({
        filter: "mine",
        kind: "lesson",
        q: "  clinic ",
        thread: id,
        person: "not-an-id",
        compose: "old",
      }),
    ).toEqual({ filter: "mine", kind: "lesson", q: "clinic", thread: id });
    expect(parseInboxState({ filter: "everything" }).filter).toBe("all");
  });

  it("writes only what differs from the defaults", () => {
    const state = parseInboxState({ filter: "unread", q: "rain" });
    expect(inboxHref(state)).toBe("/inbox?filter=unread&q=rain");
    expect(inboxHref(state, { filter: "all", q: undefined })).toBe("/inbox");
    expect(inboxHref(state, { thread: id })).toBe(
      `/inbox?filter=unread&q=rain&thread=${id}`,
    );
  });

  it("asks Concierge for the queue or the read filter, never both at once", () => {
    expect(threadsQuery(parseInboxState({ filter: "mine" }))).toMatchObject({
      filter: "all",
      queue: "mine",
    });
    expect(threadsQuery(parseInboxState({ filter: "families" }))).toMatchObject(
      {
        filter: "families",
        queue: "all",
      },
    );
    expect(threadsQuery(parseInboxState({ q: "open" }))).toMatchObject({
      search: "open",
    });
  });
});

describe("Messages grouped by day and channel", () => {
  it("says the day once and the channel once per run", () => {
    const days = groupMessages(
      conciergeDemo.thread.messages,
      "America/Los_Angeles",
      new Date("2026-11-28T20:00:00.000Z"),
    );
    expect(days.map((day) => day.label)).toEqual(["Yesterday", "Today"]);
    const today = days[1]!;
    expect(today.runs.map((run) => run.channel)).toEqual([
      "duna",
      "whatsapp",
      "duna",
      "system",
    ]);
  });

  it("keeps the order of sequence, not arrival", () => {
    const [first, second] = conciergeDemo.thread.messages;
    const days = groupMessages(
      [second!, first!],
      "UTC",
      new Date("2026-11-28T20:00:00.000Z"),
    );
    expect(
      days.flatMap((day) =>
        day.runs.flatMap((run) => run.messages.map((m) => m.sequence)),
      ),
    ).toEqual([1, 2]);
  });
});

describe("Channels the club hasn't set up are never shown as working", () => {
  it("says what each one needs, without naming a vendor", () => {
    const statuses = channelStatuses({
      duna: "available",
      email: "provider-not-configured",
      imessage: "not-enabled",
      whatsapp: "available",
    });
    expect(statuses.map((status) => [status.channel, status.state])).toEqual([
      ["duna", "on"],
      ["email", "not-set-up"],
      ["imessage", "switched-off"],
      ["whatsapp", "on"],
    ]);
    const email = statuses.find((status) => status.channel === "email")!;
    expect(email.detail).toMatch(
      /^Not set up yet: needs a verified sending address/,
    );
    for (const status of statuses) {
      expect(status.detail).not.toMatch(/Resend|Sendblue|Sent\.dm|Vercel|Neon/);
    }
  });
});

describe("The Send review", () => {
  it("counts only the people who can be reached and names the count in the verb", () => {
    const ready = conciergeDemoProposals.find((p) => p.status === "ready")!;
    const summary = reviewSummary(ready);
    expect(summary.sendCount).toBe(2);
    expect(summary.unreachable).toHaveLength(2);
    expect(summary.verb).toBe("Send to 2 people");
    expect(summary.byChannel).toEqual([
      { channel: "duna", count: 1 },
      { channel: "whatsapp", count: 1 },
    ]);
  });

  it("names one person by first name", () => {
    const ready = conciergeDemoProposals.find((p) => p.status === "ready")!;
    const one = { ...ready, recipients: ready.recipients.slice(0, 1) };
    expect(reviewSummary(one).verb).toMatch(/^Send to \S+$/);
  });
});

describe("The person beside a thread follows People's money rule", () => {
  const input = {
    row: {
      id,
      name: "Sam Lee",
      relation: "Member",
      isJunior: false,
      credits: 4,
    },
    profile: {
      relationship: { lifetimeSpendMinor: 48_765 },
      plans: [
        {
          id,
          name: "Monthly",
          status: "active",
          interval: "month",
          priceMinor: 9_987,
          currency: "USD",
          cancelAtPeriodEnd: false,
        },
      ],
      creditGrants: [
        {
          id,
          initialCredits: 10,
          remainingCredits: 4,
          initialValueMinor: 10_000,
          remainingValueMinor: 4_123,
          currency: "USD",
          status: "active",
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      sessions: [
        {
          id: "a",
          title: "Past clinic",
          startsAt: "2026-11-01T17:00:00.000Z",
          timezone: "UTC",
          registrationStatus: "registered",
        },
        {
          id: "b",
          title: "Saturday clinic",
          startsAt: "2026-12-05T17:00:00.000Z",
          timezone: "UTC",
          venueName: "Courts 3–4",
          registrationStatus: "registered",
        },
        {
          id: "c",
          title: "Cancelled lesson",
          startsAt: "2026-12-06T17:00:00.000Z",
          timezone: "UTC",
          registrationStatus: "cancelled",
        },
      ],
    },
  } as unknown as Parameters<typeof personContextFrom>[0];
  const now = new Date("2026-11-28T12:00:00.000Z");

  it("shows balance and spend to a role that may see payments", () => {
    const context = personContextFrom(input, { canSeePayments: true, now });
    expect(context.balance).toEqual({ minor: 4_123, currency: "USD" });
    expect(context.lifetimeSpend).toEqual({ minor: 48_765, currency: "USD" });
  });

  it("never carries money to a role that may not (a coach)", () => {
    const context = personContextFrom(input, { canSeePayments: false, now });
    expect(context).not.toHaveProperty("balance");
    expect(context).not.toHaveProperty("lifetimeSpend");
    expect(JSON.stringify(context)).not.toMatch(/4123|48765|9987/);
  });

  it("lists only upcoming, not cancelled, bookings and the plan", () => {
    const context = personContextFrom(input, { canSeePayments: false, now });
    expect(context.upcoming.map((session) => session.title)).toEqual([
      "Saturday clinic",
    ]);
    expect(context.plan).toEqual({ name: "Monthly", status: "active" });
  });

  it("has no field about health at all", () => {
    const context = personContextFrom(input, { canSeePayments: true, now });
    expect(Object.keys(context).some((key) => /health/i.test(key))).toBe(false);
  });
});

describe("New conversations", () => {
  it("go through the Send review unless they are a named group or carry cards", () => {
    expect(
      composeRoute({ audience: "session", cards: 0, updatesOnly: false }),
    ).toBe("concierge");
    expect(
      composeRoute({ audience: "person", cards: 0, updatesOnly: false }),
    ).toBe("concierge");
    expect(
      composeRoute({ audience: "people", cards: 0, updatesOnly: false }),
    ).toBe("group");
    expect(
      composeRoute({ audience: "club", cards: 1, updatesOnly: false }),
    ).toBe("group");
    expect(
      composeRoute({ audience: "club", cards: 0, updatesOnly: true }),
    ).toBe("group");
  });

  it("map sessions to their Concierge thread kind as before", () => {
    const audiences = audiencesFor({
      organizationId: "org",
      organizationName: "Sunset",
      sessions: [
        {
          id: "s1",
          title: "Thursday league",
          kind: "league",
          programId: "p1",
          registrations: 18,
        },
        {
          id: "s2",
          title: "Private lesson",
          kind: "private-lesson",
          registrations: 1,
        },
        { id: "s3", title: "Clinic", kind: "clinic", registrations: 9 },
      ],
      divisions: [{ id: "d1", title: "Winter Open · 16U" }],
      peopleCount: 40,
    });
    expect(
      audiences.flatMap((audience) =>
        "contextType" in audience
          ? [[audience.contextType, audience.contextId]]
          : [],
      ),
    ).toEqual([
      ["organization", "org"],
      ["league", "p1"],
      ["lesson", "s2"],
      ["event", "s3"],
      ["division", "d1"],
    ]);
  });

  it("leave out a card or poll that isn't complete", () => {
    const widgets = widgetsFrom(
      [
        {
          key: "1",
          kind: "poll",
          title: "Which night?",
          options: ["Tue", " "],
          allowMultipleAnswers: false,
          hideVoterNames: false,
          endsAt: "",
        },
        {
          key: "2",
          kind: "poll",
          title: "Which night?",
          options: ["Tue", "Thu"],
          allowMultipleAnswers: true,
          hideVoterNames: false,
          endsAt: "",
        },
        {
          key: "3",
          kind: "video",
          title: "Serve",
          href: "https://elsewhere.example",
        },
        { key: "4", kind: "session", resourceId: "missing" },
      ],
      { practicePlans: [], sessions: [] },
    );
    expect(widgets).toHaveLength(1);
    expect(widgets[0]).toMatchObject({
      kind: "poll",
      allowMultipleAnswers: true,
    });
  });
});

describe("Whose context the side panel shows", () => {
  it("is the person asked for, else the first member", () => {
    const thread = conciergeDemo.thread;
    expect(focusPerson(thread)?.role).toBe("member");
    const guardian = thread.participants.find((p) => p.role === "guardian")!;
    expect(focusPerson(thread, guardian.personId)?.personId).toBe(
      guardian.personId,
    );
  });
});
