import type { PublicCatalogItem } from "@duna/api";
import { demoOrganizationStorefront } from "@duna/core/demo/storefront";
import { priceConsumerOrder } from "@duna/pricing";
import { describe, expect, it } from "vitest";
import {
  allInNote,
  allInPrice,
  minimumSentence,
  offeringAvailability,
  offeringDoor,
  offeringImages,
  offeringIncludes,
  offeringPrice,
  offeringPriceLine,
  priceWords,
  sessionState,
  spotsWords,
} from "./offers";

const now = new Date("2026-12-08T17:00:00.000Z");
const storefront = demoOrganizationStorefront("south-bay-volleyball", now)!;
const catalog = storefront.catalog as unknown as readonly PublicCatalogItem[];
const item = (slug: string) =>
  catalog.find((candidate) => candidate.slug === slug)!;

describe("prices all-in, through @duna/pricing", () => {
  it("adds exactly the consumer fee checkout charges, never an invented one", () => {
    const expected = priceConsumerOrder({
      items: [
        {
          id: "x",
          kind: "booking",
          description: "x",
          quantity: 1,
          unitAmountMinor: 1_500,
        },
      ],
      currency: "USD",
      isDunaPlus: false,
    });
    const price = allInPrice({
      amountMinor: 1_500,
      currency: "usd",
      kind: "booking",
    });
    expect(price.allInMinor).toBe(expected.totalMinor);
    expect(price.feeMinor).toBe(expected.totalMinor - 1_500);
    expect(price.currency).toBe("USD");
  });

  it("goods carry no service fee (merchandise is not fee-eligible)", () => {
    const price = allInPrice({
      amountMinor: 3_200,
      currency: "USD",
      kind: "merchandise",
    });
    expect(price.feeMinor).toBe(0);
    expect(allInNote(price)).toBeUndefined();
  });

  it("free is free", () => {
    expect(
      allInPrice({ amountMinor: 0, currency: "USD", kind: "booking" }).label,
    ).toBe("Free");
  });

  it("says the fee in one sentence when there is one", () => {
    const price = allInPrice({
      amountMinor: 1_500,
      currency: "USD",
      kind: "booking",
    });
    if (price.feeMinor > 0) {
      expect(allInNote(price)).toMatch(
        /^All-in: \$15\.00 to the club plus Duna's/,
      );
    }
  });

  it("a membership reads per period; several plans read 'From'", () => {
    const membership = offeringPrice(item("south-bay-membership"));
    expect(membership.from).toBe(true);
    expect(membership.card?.recurring).toBe("month");
    expect(priceWords(membership.card!)).toMatch(/ a month$/);
    expect(offeringPriceLine(membership)).toMatch(/^From \$/);
  });

  it("credits show beside the card price", () => {
    expect(offeringPriceLine(offeringPrice(item("evening-open-play")))).toMatch(
      / · or 2 credits$/,
    );
  });

  it("member-only prices are never shown as a visitor's price", () => {
    const base = item("evening-open-play");
    const membersOnly = {
      ...base,
      variants: [
        {
          ...base.variants[0]!,
          prices: [
            { ...base.variants[0]!.prices[0]!, audience: "member" as const },
          ],
        },
      ],
      allowCredits: false,
    };
    expect(offeringPrice(membersOnly).card).toBeUndefined();
  });
});

describe("group state in the shared words", () => {
  it("a clinic that needs players says so, with its ladder", () => {
    const clinic = item("serve-receive-clinic");
    const later = clinic.upcomingOccurrences[1]!;
    const state = sessionState({
      item: clinic,
      occurrence: later,
      clubName: storefront.name,
      now,
    })!;
    expect(state.hasGroupRule).toBe(true);
    expect(state.status).toBe("Needs 1 more");
    expect(state.ladder.length).toBe(2);
  });

  it("a full session says Full and counts the waitlist without names", () => {
    const group = item("small-group-training");
    const state = sessionState({
      item: group,
      occurrence: group.upcomingOccurrences[0]!,
      clubName: storefront.name,
      now,
    })!;
    expect(state.status).toBe("Full");
    expect(state.waiting).toBe(2);
    expect(offeringAvailability(group, now).kind).toBe("full");
  });

  it("a session without a group rule shows spots left", () => {
    const lesson = item("private-lesson-theo-park");
    const state = sessionState({
      item: lesson,
      occurrence: lesson.upcomingOccurrences[0]!,
      clubName: storefront.name,
      now,
    })!;
    expect(state.hasGroupRule).toBe(false);
    expect(state.status).toBe("1 spot left");
    expect(spotsWords(0)).toBe("Full");
    expect(spotsWords(3)).toBe("3 spots left");
  });

  it("says what happens if the group is too small, from the club's rule", () => {
    expect(minimumSentence(item("serve-receive-clinic"))).toBe(
      "Runs with 4 or more players. If fewer have booked 24 hours before it starts, the club cancels it and you get everything back.",
    );
    expect(minimumSentence(item("private-lesson-theo-park"))).toBeUndefined();
  });
});

describe("doors, availability and goods", () => {
  it("sorts offerings into Play, Train, Join and the shop", () => {
    expect(offeringDoor(item("evening-open-play"))).toBe("play");
    expect(offeringDoor(item("serve-receive-clinic"))).toBe("train");
    expect(offeringDoor(item("private-lesson-theo-park"))).toBe("train");
    expect(offeringDoor(item("south-bay-membership"))).toBe("join");
    expect(offeringDoor(item("ten-credit-pack"))).toBe("join");
    expect(offeringDoor(item("club-practice-jersey"))).toBe("shop");
  });

  it("goods are sold out only when every tracked option is", () => {
    const jersey = item("club-practice-jersey");
    expect(offeringAvailability(jersey, now).kind).toBe("available");
    const soldOut = {
      ...jersey,
      variants: jersey.variants.map((variant) => ({
        ...variant,
        availableQuantity: 0,
      })),
    };
    expect(offeringAvailability(soldOut, now).kind).toBe("sold-out");
  });

  it("members-only and not-on-sale are their own states", () => {
    const base = item("evening-open-play");
    expect(
      offeringAvailability({ ...base, membershipRequired: true }, now).kind,
    ).toBe("members-only");
    expect(
      offeringAvailability(
        { ...base, allowCard: false, allowCredits: false, allowCash: false },
        now,
      ).kind,
    ).toBe("not-on-sale");
  });

  it("photos: a variant's own first, then the item's, then any", () => {
    const base = item("club-practice-jersey");
    const withPhotos = {
      ...base,
      media: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          kind: "image" as const,
          url: "/a.jpg",
          catalogVariantId: base.variants[0]!.id,
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          kind: "image" as const,
          url: "/b.jpg",
        },
      ],
    };
    expect(offeringImages(withPhotos, base.variants[0]!.id)[0]!.url).toBe(
      "/a.jpg",
    );
    expect(offeringImages(withPhotos)[0]!.url).toBe("/b.jpg");
    expect(offeringImages(withPhotos)[0]!.alt).toBe(base.title);
  });

  it("what a membership or a pack includes comes from the club's configuration", () => {
    expect(offeringIncludes(item("south-bay-membership"))).toContain(
      "Two guest passes a month",
    );
    expect(offeringIncludes(item("ten-credit-pack"))).toEqual([
      "10 credits to use on bookings at this club",
    ]);
  });
});
