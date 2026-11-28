import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  NIGHT_COURT,
  parseHexColor,
  SALT,
} from "./club-mark";
import { encodeQr, qrPath } from "./qr";
import {
  assignWalletArt,
  cardAccessibleName,
  cardArtPalette,
  cardMetaLine,
  cardPassBack,
  cardStateChip,
  carouselScale,
  clubCardChip,
  clubMembershipStatus,
  clubSummaryCard,
  defaultCardArt,
  derivedArtPalette,
  DUNA_ART_SET,
  estimateCardContrast,
  isDunaArtKey,
  measureCardContrast,
  orderWalletCards,
  passSecondsLeft,
  RETIRED_CARD_ART,
  rgbToHsl,
  stackLayout,
  strongestContrast,
  tintPalette,
  walletKeyStep,
  walletPresentation,
  type CardPixels,
} from "./wallet";

/** A flat image, or one with a bright band where the type sits. */
function pixels(
  base: [number, number, number],
  paint?: (x: number, y: number) => [number, number, number] | null,
): CardPixels {
  const width = 160;
  const height = 101;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint?.(x / width, y / height) ?? base;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("art set", () => {
  it("ships eight pieces, none of the retired ones, every palette parses", () => {
    expect(DUNA_ART_SET).toHaveLength(8);
    for (const piece of DUNA_ART_SET) {
      expect(isDunaArtKey(piece.key)).toBe(true);
      for (const tone of piece.palette)
        expect(parseHexColor(tone)).not.toBeNull();
      expect(piece.period).toBeGreaterThanOrEqual(3);
      expect(piece.period).toBeLessThanOrEqual(6);
    }
    for (const retired of RETIRED_CARD_ART)
      expect(isDunaArtKey(retired.key)).toBe(false);
  });

  it("derives four tones of rising lightness from a club colour, even a grey one", () => {
    for (const color of ["#1E5AA8", "#7B2D26", "#808080", "not a colour"]) {
      const palette = derivedArtPalette(color);
      const lums = palette.map((tone) => rgbToHsl(parseHexColor(tone)!).l);
      expect([...lums].sort((a, b) => a - b)).toEqual(lums);
    }
    expect(rgbToHsl(parseHexColor("#808080")!).s).toBe(0);
  });

  it("tints by hue only and keeps lightness", () => {
    const base = DUNA_ART_SET[3].palette;
    const tinted = tintPalette(base, "#D04040");
    expect(tinted).not.toEqual(base);
    tinted.forEach((tone, i) =>
      expect(rgbToHsl(parseHexColor(tone)!).l).toBeCloseTo(
        rgbToHsl(parseHexColor(base[i]!)!).l,
        1,
      ),
    );
    expect(tintPalette(base, "nope")).toBe(base);
  });

  it("palettes for each source; uploads have none", () => {
    expect(cardArtPalette({ source: "set", key: "golden-dune" })).toEqual(
      DUNA_ART_SET[0].palette,
    );
    expect(
      cardArtPalette({ source: "set", key: "golden-dune", tint: "#1E5AA8" }),
    ).not.toEqual(DUNA_ART_SET[0].palette);
    expect(cardArtPalette({ source: "colour", color: "#1E5AA8" })).toHaveLength(
      4,
    );
    expect(cardArtPalette({ source: "upload", poster: "/a.jpg" })).toBeNull();
  });

  it("a club with a colour gets derived art; otherwise a stable set piece", () => {
    expect(defaultCardArt({ id: "x", color: "#1E5AA8" })).toEqual({
      source: "colour",
      color: "#1E5AA8",
    });
    const a = defaultCardArt({ id: "club-a" });
    expect(a).toEqual(defaultCardArt({ id: "club-a", color: "nope" }));
    expect(a.source).toBe("set");
  });

  it("a wallet never repeats a set piece while others are unused", () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({
      id: `same-${i % 1}`,
    }));
    const keys = assignWalletArt(cards).map((art) =>
      art.source === "set" ? art.key : art.source,
    );
    expect(new Set(keys).size).toBe(8);
    const nine = assignWalletArt([
      ...cards,
      { id: "z" },
      { id: "c", color: "#123456" },
    ]);
    expect(nine[9]).toEqual({ source: "colour", color: "#123456" });
  });
});

describe("measured scrim", () => {
  const salt = parseHexColor(SALT)!;
  const night = parseHexColor(NIGHT_COURT)!;
  const under = (base: [number, number, number], scrim: string, a: number) => {
    const s = parseHexColor(scrim)!;
    return {
      r: base[0] * (1 - a) + s.r * a,
      g: base[1] * (1 - a) + s.g * a,
      b: base[2] * (1 - a) + s.b * a,
    };
  };

  it("dark art keeps the minimum scrim and Salt type", () => {
    const c = measureCardContrast(pixels([20, 30, 60]));
    expect(c.text).toBe("salt");
    expect(c.top).toBe(0.12);
    expect(c.bottom).toBe(0.18);
    expect(c.ratio).toBeGreaterThanOrEqual(5);
  });

  it("a bright streak under the name raises the scrim to 5:1", () => {
    const art = pixels([40, 80, 90], (x, y) =>
      y > 0.7 && y < 0.9 && x < 0.5 ? [250, 240, 200] : null,
    );
    const c = measureCardContrast(art);
    expect(c.text).toBe("salt");
    expect(c.bottom).toBeGreaterThan(0.5);
    expect(c.ratio).toBeGreaterThanOrEqual(4.99);
    expect(
      contrastRatio(salt, under([250, 240, 200], c.scrim, c.bottom)),
    ).toBeGreaterThanOrEqual(4.99);
  });

  it("genuinely light art gets Night Court type and a pale scrim", () => {
    const c = measureCardContrast(pixels([235, 230, 215]));
    expect(c.text).toBe("night");
    expect(
      contrastRatio(night, under([235, 230, 215], c.scrim, c.top)),
    ).toBeGreaterThanOrEqual(4.99);
  });

  it("the scrim is capped at 93 %", () => {
    const c = measureCardContrast(
      pixels([255, 255, 255], () => [255, 255, 255]),
    );
    expect(Math.max(c.top, c.bottom)).toBeLessThanOrEqual(0.93);
  });

  it("the stronger of two measurements wins", () => {
    const a = measureCardContrast(pixels([20, 30, 60]));
    const b = measureCardContrast(
      pixels([40, 80, 90], (x, y) =>
        y > 0.7 && x < 0.5 ? [250, 240, 200] : null,
      ),
    );
    const s = strongestContrast(a, b);
    expect(s.bottom).toBe(b.bottom);
    expect(s.ratio).toBe(Math.min(a.ratio, b.ratio));
    const light = measureCardContrast(pixels([235, 230, 215]));
    expect(strongestContrast(a, light)).toBe(
      a.ratio <= light.ratio ? a : light,
    );
  });

  it("estimates a server-safe scrim from the palette for every piece", () => {
    for (const piece of DUNA_ART_SET) {
      const c = estimateCardContrast(piece.palette);
      expect(c.ratio, piece.key).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("face", () => {
  it("state chips say the state in words with an icon", () => {
    expect(cardStateChip({ status: "active" })).toBeNull();
    expect(cardStateChip({ status: "paused", until: "Jan 4" })).toEqual({
      tone: "paused",
      icon: "pause",
      text: "Paused to Jan 4",
    });
    expect(cardStateChip({ status: "paused" })?.text).toBe("Paused");
    expect(cardStateChip({ status: "pending" })?.text).toBe("Pending approval");
    expect(cardStateChip({ status: "expired", until: "Oct 31" })?.text).toBe(
      "Ended Oct 31",
    );
    expect(cardStateChip({ status: "expired" })?.text).toBe("Ended");
    expect(
      cardStateChip({ status: "expired", statusText: "Cancelled" })?.text,
    ).toBe("Cancelled");
  });

  it("meta line: number, since, and the plan when a state chip took its slot", () => {
    expect(
      cardMetaLine({
        status: "active",
        number: "0412",
        since: "Mar 2024",
        chip: "Annual",
      }),
    ).toBe("No. 0412 · Since Mar 2024");
    expect(cardMetaLine({ status: "pending", chip: "Social" })).toBe(
      "Social · No. —",
    );
    expect(
      cardMetaLine({
        status: "active",
        number: "1",
        since: "x",
        face: { number: false, since: false },
      }),
    ).toBe("");
  });

  it("names the card for screen readers", () => {
    expect(
      cardAccessibleName({
        club: "Saltline Beach Club",
        plan: "Annual member",
        member: "Rae",
        status: "active",
        fact: { kind: "credits", text: "8 credits" },
        index: 1,
        total: 5,
      }),
    ).toBe(
      "Saltline Beach Club, Annual member, active, 8 credits. Card 2 of 5",
    );
    expect(
      cardAccessibleName({
        club: "Lantern Bay",
        member: "Maya",
        heldBy: "Rae",
        status: "pending",
        fact: { kind: "credits", text: "3" },
      }),
    ).toBe("Lantern Bay, pending approval, Maya's card, held by Rae");
  });
});

describe("pass back", () => {
  const pass = { code: "duna:member:v1:abc", rotation: "static" as const };
  it("pending, ended and passless cards show no code and say why", () => {
    expect(cardPassBack({ club: "C", status: "pending", pass }).kind).toBe(
      "message",
    );
    const ended = cardPassBack({
      club: "C",
      status: "expired",
      pass,
      until: "Oct 31",
    });
    expect(ended).toMatchObject({
      kind: "message",
      title: "This membership ended Oct 31",
    });
    expect(cardPassBack({ club: "C", status: "expired" })).toMatchObject({
      title: "This membership has ended",
    });
    expect(
      cardPassBack({ club: "C", status: "active", pass: null }),
    ).toMatchObject({
      reason: "no-pass",
    });
  });

  it("active and paused cards show the server's code, honestly labelled", () => {
    expect(cardPassBack({ club: "C", status: "active", pass })).toMatchObject({
      kind: "code",
      code: pass.code,
      label: "Duna member credential",
      statusLine: "Active member",
    });
    expect(
      cardPassBack({
        club: "C",
        status: "paused",
        until: "Jan 4",
        pass: {
          ...pass,
          rotation: "rotating",
          refreshesAt: "2026-01-01T00:00:30Z",
          reference: "X",
        },
      }),
    ).toMatchObject({
      statusLine: "Paused until Jan 4",
      label: "Check-in code",
      statusIcon: "pause",
    });
    expect(cardPassBack({ club: "C", status: "paused", pass })).toMatchObject({
      statusLine: "Paused",
    });
    expect(
      cardPassBack({ club: "C", status: "active", kind: "staff", pass }),
    ).toMatchObject({ statusLine: "Staff" });
    expect(
      cardPassBack({ club: "C", status: "active", kind: "day", pass }),
    ).toMatchObject({ statusLine: "Valid today" });
    expect(
      passSecondsLeft(
        "2026-01-01T00:00:30Z",
        Date.parse("2026-01-01T00:00:06Z"),
      ),
    ).toBe(24);
    expect(
      passSecondsLeft(
        "2026-01-01T00:00:30Z",
        Date.parse("2026-01-01T00:01:00Z"),
      ),
    ).toBe(0);
  });
});

describe("wallet", () => {
  it("carousel to six, stack from seven, one or two never switch", () => {
    expect(walletPresentation(1)).toEqual({
      presentation: "carousel",
      canSwitch: false,
    });
    expect(walletPresentation(2, "stack").presentation).toBe("carousel");
    expect(walletPresentation(6)).toEqual({
      presentation: "carousel",
      canSwitch: true,
    });
    expect(walletPresentation(7)).toEqual({
      presentation: "stack",
      canSwitch: true,
    });
    expect(walletPresentation(12, "carousel").presentation).toBe("carousel");
  });

  it("orders ended cards last and pending after active", () => {
    const cards = [
      { id: "e", status: "expired" as const },
      { id: "p", status: "pending" as const },
      { id: "a", status: "active" as const },
      { id: "z", status: "paused" as const },
    ];
    expect(orderWalletCards(cards).map((c) => c.id)).toEqual([
      "a",
      "z",
      "p",
      "e",
    ]);
  });

  it("keys move within bounds", () => {
    expect(walletKeyStep("ArrowRight", 0, 3, "horizontal")).toBe(1);
    expect(walletKeyStep("ArrowRight", 2, 3, "horizontal")).toBe(2);
    expect(walletKeyStep("ArrowLeft", 0, 3, "horizontal")).toBe(0);
    expect(walletKeyStep("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(walletKeyStep("ArrowUp", 2, 3, "vertical")).toBe(1);
    expect(walletKeyStep("Home", 2, 3, "vertical")).toBe(0);
    expect(walletKeyStep("End", 0, 3, "vertical")).toBe(2);
    expect(walletKeyStep("Enter", 0, 3, "vertical")).toBeNull();
  });

  it("neighbours scale to 94 %", () => {
    expect(carouselScale(0)).toBe(1);
    expect(carouselScale(-1)).toBeCloseTo(0.94);
    expect(carouselScale(3)).toBeCloseTo(0.94);
  });

  it("stack: strips at rest, a pile of at most five edges when drawn", () => {
    const rest = stackLayout({ count: 3, cardHeight: 100, drawn: null });
    expect(rest.slots.map((s) => s.y)).toEqual([0, 36, 72]);
    expect(rest.height).toBe(172);
    expect(stackLayout({ count: 0, cardHeight: 100, drawn: null }).height).toBe(
      0,
    );
    const drawn = stackLayout({ count: 8, cardHeight: 100, drawn: 2 });
    expect(drawn.slots[2]).toEqual({ y: 0, scale: 1, z: 100 });
    expect(drawn.slots[0]!.y).toBe(126);
    expect(drawn.slots[7]!.y).toBe(126 + 4 * 11);
    expect(drawn.height).toBe(100 + 26 + 44 + 30);
    expect(stackLayout({ count: 1, cardHeight: 100, drawn: 0 }).height).toBe(
      100,
    );
  });
});

describe("today's club summary", () => {
  const base = {
    organizationId: "o1",
    organizationName: "Sunset",
    credits: 8,
    status: "active" as const,
  };
  it("maps status words", () => {
    expect(clubMembershipStatus({ status: "frozen" })).toBe("paused");
    expect(
      clubMembershipStatus({ status: "active", membershipStatus: "paused" }),
    ).toBe("paused");
    expect(clubMembershipStatus({ status: "closed" })).toBe("expired");
    expect(
      clubMembershipStatus({ status: "active", membershipStatus: "canceled" }),
    ).toBe("expired");
    expect(
      clubMembershipStatus({
        status: "active",
        membershipStatus: "incomplete",
      }),
    ).toBe("pending");
    expect(
      clubMembershipStatus({ status: "active", membershipStatus: "trialing" }),
    ).toBe("active");
    expect(clubMembershipStatus({ status: "active" })).toBe("active");
  });

  it("chips from the plan", () => {
    expect(clubCardChip({})).toBe("Pack");
    expect(
      clubCardChip({ membershipName: "A", membershipStatus: "trialing" }),
    ).toBe("Trial");
    expect(
      clubCardChip({ membershipName: "A", membershipInterval: "year" }),
    ).toBe("Annual");
    expect(
      clubCardChip({ membershipName: "A", membershipInterval: "month" }),
    ).toBe("Monthly");
    expect(clubCardChip({ membershipName: "A" })).toBe("Member");
  });

  it("a card: credits first, else valid-through; pending has no fact", () => {
    expect(clubSummaryCard(base)).toMatchObject({
      id: "o1",
      plan: "Credit pack",
      kind: "pack",
      fact: { kind: "credits", text: "8 credits" },
    });
    expect(clubSummaryCard({ ...base, credits: 1 }).fact?.text).toBe(
      "1 credit",
    );
    const member = clubSummaryCard({
      ...base,
      credits: 0,
      membershipName: "Annual member",
      membershipInterval: "year",
      membershipCurrentPeriodEndsAt: "2027-11-30T12:00:00Z",
    });
    expect(member).toMatchObject({
      kind: "member",
      chip: "Annual",
      validThrough: "Nov 30, 2027",
      fact: { kind: "valid", text: "To Nov 2027" },
    });
    expect(member.until).toBeUndefined();
    const ended = clubSummaryCard(
      {
        ...base,
        membershipName: "A",
        membershipStatus: "canceled",
        membershipCancellationEffectiveAt: "2026-10-31T12:00:00Z",
      },
      { timeZone: "America/Los_Angeles" },
    );
    expect(ended).toMatchObject({ status: "expired", until: "Oct 31" });
    expect(
      clubSummaryCard({
        ...base,
        membershipName: "A",
        membershipStatus: "pending",
      }).fact,
    ).toBeNull();
    expect(clubSummaryCard({ ...base, credits: 0 }).fact).toBeNull();
  });
});

describe("QR", () => {
  it("encodes the smallest version that fits, with a quiet-zone path", () => {
    const small = encodeQr("duna:member:v1:abc");
    expect(small.version).toBe(2);
    expect(small.size).toBe(25);
    expect(small.modules).toHaveLength(625);
    // Finder pattern corners are dark, the separator light.
    expect(small.modules[0]).toBe(true);
    expect(small.modules[7]).toBe(false);
    expect(qrPath(small)).toMatch(/^M4 4h1v1h-1z/);
    expect(encodeQr("x".repeat(200), "L").version).toBeGreaterThan(5);
    expect(encodeQr("y".repeat(400), "H").version).toBeGreaterThanOrEqual(7);
    expect(() => encodeQr("z".repeat(3000), "H")).toThrow(RangeError);
  });

  it("is deterministic", () => {
    expect(encodeQr("duna:member:v1:abc")).toEqual(
      encodeQr("duna:member:v1:abc"),
    );
  });
});
