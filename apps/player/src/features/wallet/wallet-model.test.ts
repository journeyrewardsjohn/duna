/**
 * The Player wallet's model (WALLET-2) and the native persona steps of
 * PL-6.n that run without a device: cards from today's data through the
 * shared helpers, a guardian's juniors' cards, the pass (server, saved on
 * this phone, or honestly missing), the sheet's words, the arrival moment
 * and the offline pass parser.
 */
import { describe, expect, it } from "vitest";
import { demoCount, demoWallet } from "./wallet-demo";
import { parseSavedPass } from "./saved-pass";
import {
  arrivalWords,
  arrivedCard,
  buildWalletModel,
  refundLine,
  type ClubSummary,
  type FamilyRow,
  type WalletModelInput,
} from "./wallet-model";

const now = new Date("2026-11-28T12:00:00Z");
const person = { id: "p-1", displayName: "Noa Williams" };

const input = (over: Partial<WalletModelInput> = {}): WalletModelInput => {
  const sample = demoWallet(12, now);
  return {
    person,
    junior: false,
    clubs: { state: "ok", data: sample.clubs },
    family: null,
    credential: {
      state: "ok",
      data: {
        memberId: "7K2Q9D",
        credentialPayload: "duna:member:v1:abc",
        walletStatus: "available",
        walletPassPath: "/api/wallet/members/token",
      },
    },
    upcoming: { state: "ok", data: sample.upcoming(person.id) },
    past: { state: "ok", data: sample.past(person.id) },
    money: {
      state: "ok",
      data: {
        availableMinor: 1250,
        pendingMinor: 0,
        currency: "USD",
        entries: [],
      },
    },
    predictions: { state: "ok", data: { availableCredits: 250.4 } },
    timeZone: "America/Los_Angeles",
    ...over,
  };
};

describe("PL-6.n: membership cards in the app", () => {
  it("one card per club, ended cards last, pending after active", () => {
    const model = buildWalletModel(input());
    expect(model.cards).toHaveLength(12);
    const statuses = model.cards.map((card) => card.status);
    expect(statuses.at(-1)).toBe("expired");
    expect(statuses.indexOf("pending")).toBeGreaterThan(
      statuses.lastIndexOf("active"),
    );
    const kelp = model.cards.find(
      (card) => card.club.name === "Kelp Point VC",
    )!;
    expect(kelp).toMatchObject({ status: "paused", until: "Jan 4" });
    const northshore = model.cards.find(
      (card) => card.club.name === "Northshore Sand Collective",
    )!;
    expect(northshore).toMatchObject({ kind: "pack", chip: "Pack" });
  });

  it("neighbouring cards never share a piece of art", () => {
    const { cards } = buildWalletModel(input());
    for (let i = 1; i < 8; i += 1)
      expect(cards[i]!.art).not.toEqual(cards[i - 1]!.art);
  });

  it("the back is the Duna member credential, labelled", () => {
    const card = buildWalletModel(input()).cards[0]!;
    expect(card.pass).toEqual({
      code: "duna:member:v1:abc",
      rotation: "static",
      label: "Duna member credential",
      reference: "Duna ID 7K2Q9D",
    });
    expect(card.passSaved).toBeUndefined();
  });

  it("offline: the pass saved on this phone, and it says so", () => {
    const saved = parseSavedPass(
      JSON.stringify({
        personId: "p-1",
        code: "duna:member:v1:abc",
        reference: "Duna ID 7K2Q9D",
      }),
      "p-1",
    );
    const model = buildWalletModel(
      input({ credential: { state: "not-configured" }, savedPass: saved }),
    );
    expect(model.cards[0]!.pass?.code).toBe("duna:member:v1:abc");
    expect(model.cards[0]!.passSaved).toBe(true);
    expect(model.passError).toBeUndefined();
  });

  it("a pass that did not load says so with a reference; cards still show", () => {
    const model = buildWalletModel(
      input({ credential: { state: "error", reference: "ref_pass" } }),
    );
    expect(model.passError).toBe("ref_pass");
    expect(model.cards[0]!.pass).toBeNull();
  });

  it("cards that did not load carry a reference", () => {
    const model = buildWalletModel(
      input({ clubs: { state: "error", reference: "ref_cards" } }),
    );
    expect(model.cards).toHaveLength(0);
    expect(model.cardsError).toBe("ref_cards");
  });

  it("a guardian holds their juniors' cards (verified only)", () => {
    const rows: FamilyRow[] = [
      {
        dependentPersonId: "kid-1",
        dependentName: "Remy Williams",
        organizationId: "org-j",
        organizationName: "Cove Street Academy",
        organizationSlug: "cove-street",
        dependentCredits: 4,
        relationshipStatus: "verified",
      },
      {
        dependentPersonId: "kid-2",
        dependentName: "Ari Williams",
        organizationId: "org-j",
        organizationName: "Cove Street Academy",
        organizationSlug: "cove-street",
        dependentCredits: 2,
        relationshipStatus: "pending",
      },
    ];
    const model = buildWalletModel(
      input({
        clubs: { state: "ok", data: [] },
        family: { state: "ok", data: rows },
      }),
    );
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0]).toMatchObject({
      member: "Remy Williams",
      heldBy: "Noa Williams",
      kind: "junior",
      chip: "Junior",
      pass: null,
      fact: { text: "4 credits" },
    });
    expect(model.sheets["org-j:kid-1"]!.banner?.text).toBe(
      "Remy's card. You hold it as their guardian; it moves to their own app when they have one.",
    );
  });

  it("the sheet: plan, price and renewal; credits with expiry; bookings here", () => {
    const model = buildWalletModel(input());
    const saltline = model.cards.find(
      (card) => card.club.name === "Saltline Beach Club",
    )!;
    const sheet = model.sheets[saltline.id]!;
    expect(sheet.planLine).toBe(
      "Annual member · $460.00 a year · Renews Nov 30, 2027",
    );
    expect(sheet.credits).toEqual({
      count: 8,
      expiry: "2 expire Dec 14, 2026",
    });
    expect(sheet.upcoming.map((row) => row.title)).toEqual([
      "Open play · Court 3",
      "Clinic: serve receive",
    ]);
    expect(sheet.recent.every((row) => row.detail.includes("Checked in"))).toBe(
      true,
    );
  });

  it("banners: paused, pending, ended (renew) and ending", () => {
    const { cards, sheets } = buildWalletModel(input());
    const sheetFor = (name: string) =>
      sheets[cards.find((card) => card.club.name === name)!.id]!;
    expect(sheetFor("Kelp Point VC").banner?.tone).toBe("paused");
    expect(sheetFor("Pier Nine Beach Volley").banner?.text).toContain(
      "is reviewing",
    );
    expect(sheetFor("Driftwood BVC").banner).toMatchObject({
      tone: "expired",
      action: "renew",
    });
    expect(sheetFor("Low Tide Social").banner?.text).toBe(
      "Your membership ends Dec 1, 2026 and will not renew.",
    );
  });

  it("manage appears only when the club allows it, with the backend's policy", () => {
    const club: ClubSummary = {
      ...demoWallet(1, now).clubs[0]!,
      membershipId: "4d7c1b8e-0d4e-4c1a-9b7a-2f1f1f1f1f1f",
      membershipManageable: true,
      membershipPolicy: {
        cancellationTiming: "immediate",
        refundBehavior: "prorated",
      },
    };
    const model = buildWalletModel(
      input({ clubs: { state: "ok", data: [club] } }),
    );
    const manage = model.sheets[club.organizationId]!.manage!;
    expect(manage.cancellationTiming).toBe("immediate");
    expect(refundLine(manage)).toBe(
      "The unused part of this paid period is refunded to the card you paid with.",
    );
    const plain = buildWalletModel(input());
    expect(Object.values(plain.sheets).some((sheet) => sheet.manage)).toBe(
      false,
    );
  });

  it("Apple Wallet only where the server has a member pass", () => {
    expect(buildWalletModel(input()).appleWalletPath).toBe(
      "/api/wallet/members/token",
    );
    expect(
      buildWalletModel(
        input({
          credential: {
            state: "ok",
            data: {
              memberId: "7K2Q9D",
              credentialPayload: "duna:member:v1:abc",
              walletStatus: "configuration-required",
            },
          },
        }),
      ).appleWalletPath,
    ).toBeUndefined();
  });

  it("the balance and prediction credits, as on the web", () => {
    const model = buildWalletModel(input());
    expect(model.money).toMatchObject({
      state: "ok",
      data: { available: "$12.50" },
    });
    expect(model.predictions).toEqual({
      state: "ok",
      data: { credits: "250" },
    });
    expect(buildWalletModel(input({ junior: true })).predictions).toBeNull();
  });

  it("opens on the card a link asks for", () => {
    const model = buildWalletModel(
      input({ card: "0b7c3f7e-5d1a-4c55-9d33-000000000003" }),
    );
    expect(model.initial).toBe("0b7c3f7e-5d1a-4c55-9d33-000000000003");
    expect(buildWalletModel(input({ card: "nope" })).initial).toBeUndefined();
  });
});

describe("the arrival moment", () => {
  const { cards } = buildWalletModel(input());

  it("the first open sets the baseline; a new card arrives after", () => {
    expect(arrivedCard(cards, null)).toBeNull();
    const known = cards.slice(1).map((card) => card.id);
    expect(arrivedCard(cards, known)?.id).toBe(cards[0]!.id);
    expect(
      arrivedCard(
        cards,
        cards.map((card) => card.id),
      ),
    ).toBeNull();
  });

  it("its words are honest for a pending card", () => {
    const pending = cards.find((card) => card.status === "pending")!;
    expect(arrivalWords(pending).text).toContain("appears when");
    expect(arrivalWords(cards[0]!)).toEqual({
      title: `Welcome to ${cards[0]!.club.name}`,
      text: "Your annual card is in your wallet. Your pass works from today.",
    });
  });
});

describe("the saved pass", () => {
  it("belongs to one person and only holds the Duna credential", () => {
    const raw = JSON.stringify({ personId: "p-1", code: "duna:member:v1:abc" });
    expect(parseSavedPass(raw, "p-2")).toBeNull();
    expect(parseSavedPass(raw, "p-1")).toMatchObject({
      rotation: "static",
      offline: true,
    });
    expect(
      parseSavedPass(JSON.stringify({ personId: "p-1", code: "other" }), "p-1"),
    ).toBeNull();
    expect(parseSavedPass("{not json", "p-1")).toBeNull();
  });
});

describe("preview", () => {
  it("reads the card count from the route", () => {
    expect(demoCount("demo-12")).toBe(12);
    expect(demoCount("demo-0")).toBe(0);
    expect(demoCount(undefined)).toBe(5);
  });
});
