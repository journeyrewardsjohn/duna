import { describe, expect, it } from "vitest";
import { demoWallet } from "./wallet-demo";
import {
  buildWalletModel,
  type ClubBooking,
  type ClubSummary,
  type WalletModelInput,
} from "./wallet-model";

const me = { id: "p-1", displayName: "Rae Castillo" };
const club = (over: Partial<ClubSummary> = {}): ClubSummary => ({
  organizationId: "o-1",
  organizationName: "Saltline Beach Club",
  organizationSlug: "saltline",
  credits: 8,
  status: "active",
  nextExpiringCredits: 2,
  nextExpirationAt: "2026-12-14T12:00:00Z",
  membershipName: "Annual member",
  membershipStatus: "active",
  membershipInterval: "year",
  membershipPriceMinor: 46000,
  membershipCurrency: "USD",
  membershipCurrentPeriodEndsAt: "2027-11-30T12:00:00Z",
  ...over,
});
const booking = (over: Partial<ClubBooking> = {}): ClubBooking => ({
  bookingId: "b-1",
  title: "Open play",
  status: "confirmed",
  startsAt: "2026-11-29T16:00:00Z",
  timezone: "America/Los_Angeles",
  organization: { id: "o-1" },
  participant: { personId: "p-1" },
  venue: { name: "North courts" },
  ...over,
});
const base = (over: Partial<WalletModelInput> = {}): WalletModelInput => ({
  person: me,
  actingFor: null,
  junior: false,
  clubs: { state: "ok", data: [club()] },
  family: null,
  credential: {
    state: "ok",
    data: { memberId: "7K2Q9D", credentialPayload: "duna:member:v1:x" },
  },
  upcoming: { state: "ok", data: [booking()] },
  past: { state: "ok", data: [] },
  money: {
    state: "ok",
    data: {
      availableMinor: 1250,
      pendingMinor: 0,
      currency: "USD",
      entries: [
        {
          id: "e1",
          description: "Prize",
          occurredAt: "2026-11-01T12:00:00Z",
          status: "available",
          amount: { amountMinor: 1250, currency: "USD" },
        },
      ],
    },
  },
  predictions: { state: "ok", data: { availableCredits: 1200.6 } },
  timeZone: "America/Los_Angeles",
  ...over,
});

describe("buildWalletModel", () => {
  it("makes a card per club with art, the static credential as its pass, and a sheet", () => {
    const model = buildWalletModel(base());
    expect(model.title).toBe("Wallet");
    expect(model.cards).toHaveLength(1);
    const [card] = model.cards;
    expect(card).toMatchObject({
      id: "o-1",
      member: "Rae Castillo",
      chip: "Annual",
      status: "active",
      number: null,
      fact: { kind: "credits", text: "8 credits" },
      pass: {
        code: "duna:member:v1:x",
        rotation: "static",
        reference: "Duna ID 7K2Q9D",
      },
    });
    expect(card!.art?.source).toBe("set");
    const sheet = model.sheets["o-1"]!;
    expect(sheet.planLine).toBe(
      "Annual member · $460.00 a year · Renews Nov 30, 2027",
    );
    expect(sheet.credits).toEqual({
      count: 8,
      expiry: "2 expire Dec 14, 2026",
    });
    expect(sheet.upcoming[0]).toMatchObject({
      title: "Open play",
      detail: "Sun, Nov 29, 8:00 AM · North courts",
    });
    expect(sheet.clubHref).toBe("/clubs/saltline");
    expect(model.money).toMatchObject({
      state: "ok",
      data: { available: "$12.50", entries: [{ amount: "+$12.50" }] },
    });
    expect(model.predictions).toEqual({
      state: "ok",
      data: { credits: "1,200" },
    });
  });

  it("orders ended and pending cards last and says why on the sheet", () => {
    const model = buildWalletModel(
      base({
        clubs: {
          state: "ok",
          data: [
            club({
              organizationId: "ended",
              status: "closed",
              membershipCancellationEffectiveAt: "2026-10-31T12:00:00Z",
            }),
            club({ organizationId: "pending", membershipStatus: "pending" }),
            club({ organizationId: "paused", status: "frozen" }),
          ],
        },
      }),
    );
    expect(model.cards.map((c) => c.id)).toEqual([
      "paused",
      "pending",
      "ended",
    ]);
    expect(model.sheets.ended!.banner).toMatchObject({
      tone: "expired",
      action: { label: "Renew membership" },
    });
    expect(model.sheets.pending!.banner?.tone).toBe("pending");
    expect(model.sheets.paused!.banner?.tone).toBe("paused");
    expect(model.cards[2]).toMatchObject({ until: "Oct 31" });
  });

  it("offers manage only for a manageable, unended membership", () => {
    const manage = {
      membershipId: "m-1",
      membershipManageable: true,
      membershipPolicy: {
        cancellationTiming: "period-end" as const,
        refundBehavior: "none" as const,
      },
    };
    expect(
      buildWalletModel(base({ clubs: { state: "ok", data: [club(manage)] } }))
        .sheets["o-1"]!.manage,
    ).toMatchObject({
      membershipId: "m-1",
      ending: false,
      periodEnd: "Nov 30, 2027",
    });
    const ending = buildWalletModel(
      base({
        clubs: {
          state: "ok",
          data: [club({ ...manage, membershipCancelAtPeriodEnd: true })],
        },
      }),
    ).sheets["o-1"]!;
    expect(ending.manage?.ending).toBe(true);
    expect(ending.banner?.tone).toBe("ending");
    expect(ending.planLine).toContain("Ends Nov 30, 2027");
    expect(
      buildWalletModel(
        base({
          clubs: { state: "ok", data: [club({ ...manage, status: "closed" })] },
        }),
      ).sheets["o-1"]!.manage,
    ).toBeUndefined();
  });

  it("a failed source is that block's error with its reference; the rest renders", () => {
    const model = buildWalletModel(
      base({
        clubs: { state: "error", reference: "ref-1" },
        credential: { state: "error", reference: "ref-2" },
        money: { state: "error", reference: "ref-3" },
      }),
    );
    expect(model.cards).toEqual([]);
    expect(model.cardsError).toBe("ref-1");
    expect(model.passError).toBe("ref-2");
    expect(model.money).toEqual({ state: "error", reference: "ref-3" });
    const noPass = buildWalletModel(
      base({ credential: { state: "not-configured" } }),
    );
    expect(noPass.cards[0]!.pass).toBeNull();
    expect(noPass.passError).toBeUndefined();
  });

  it("a guardian acting for a junior sees the junior's cards, held by them", () => {
    const model = buildWalletModel(
      base({
        actingFor: {
          personId: "kid",
          displayName: "Remy Lewis",
          firstName: "Remy",
        },
        family: {
          state: "ok",
          data: [
            {
              dependentPersonId: "kid",
              dependentName: "Remy Lewis",
              organizationId: "o-1",
              organizationName: "Saltline",
              organizationSlug: "saltline",
              dependentCredits: 3,
            },
            {
              dependentPersonId: "kid",
              dependentName: "Remy Lewis",
              organizationId: "o-2",
              organizationName: "Harbor",
              organizationSlug: "harbor",
              dependentCredits: 0,
            },
            {
              dependentPersonId: "other",
              dependentName: "Ari",
              organizationId: "o-3",
              organizationName: "Cove",
              organizationSlug: "cove",
              dependentCredits: 5,
            },
          ],
        },
        upcoming: {
          state: "ok",
          data: [
            booking({ participant: { personId: "kid" } }),
            booking({ bookingId: "b2" }),
          ],
        },
      }),
    );
    expect(model.title).toBe("Remy's wallet");
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0]).toMatchObject({
      member: "Remy Lewis",
      heldBy: "Rae Castillo",
      kind: "junior",
      chip: "Junior",
      fact: { text: "3 credits" },
      pass: null,
    });
    expect(model.sheets["o-1"]!.upcoming).toHaveLength(1);
    expect(model.sheets["o-1"]!.banner?.tone).toBe("held");
    expect(model.money).toBeNull();
    expect(model.predictions).toBeNull();
  });

  it("keeps a requested card and drops an unknown one", () => {
    expect(buildWalletModel(base({ card: "o-1" })).initial).toBe("o-1");
    expect(buildWalletModel(base({ card: "nope" })).initial).toBeUndefined();
  });

  it("the demo fixture flows through the same model", () => {
    const demo = demoWallet(12, new Date("2026-11-28T12:00:00Z"));
    const model = buildWalletModel(
      base({
        clubs: { state: "ok", data: demo.clubs },
        upcoming: { state: "ok", data: demo.upcoming(me.id) },
        past: { state: "ok", data: demo.past(me.id) },
        passOverride: demo.pass,
      }),
    );
    expect(model.cards).toHaveLength(12);
    expect(model.cards.at(-1)!.status).toBe("expired");
    expect(model.cards[0]!.pass?.label).toBe("Sample pass (demo mode)");
    expect(new Set(model.cards.map((c) => JSON.stringify(c.art))).size).toBe(8);
  });
});
