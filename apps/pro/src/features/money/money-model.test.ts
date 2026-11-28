import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nativeTokens } from "../../../../../packages/ui/src/native/tokens/tokens.native";
import {
  formatCredits,
  formatMoney,
  formatSignedMoney,
  parseAmountMinor,
} from "../../shared/money-format";
import {
  contrastRatio,
  moneySummary,
  netTrend,
  trendPath,
  type MoneyInput,
} from "./money-model";
import { previewMoney } from "./preview-money";

const input: MoneyInput = {
  currency: "USD",
  balance: {
    availableMinor: 14_694,
    heldMinor: 2_725,
    pendingMinor: 0,
    inTransitMinor: 0,
    nextReleaseAt: "2026-12-05T03:00:00.000Z",
    nextReleaseMinor: 2_725,
  },
  earnings: {
    netMinor: 64_474,
    points: [
      { date: "2026-11-26", netMinor: 0 },
      { date: "2026-11-27", netMinor: 0 },
      { date: "2026-11-28", netMinor: 64_474 },
    ],
  },
  connect: {
    connected: true,
    chargesEnabled: true,
    payoutsEnabled: true,
    bankName: "First Sand Bank",
    bankLast4: "1842",
    requirementsDue: [],
  },
  settings: { payoutInterval: "weekly", weeklyPayoutDay: "friday" },
};

describe("money figures", () => {
  it("formats money with cents, a true minus sign, and parses typed amounts", () => {
    expect(formatMoney(14_694, "usd")).toBe("$146.94");
    expect(formatMoney(5_000, "USD")).toBe("$50.00");
    expect(formatSignedMoney(-300, "USD")).toBe("−$3.00");
    expect(formatSignedMoney(1_200, "USD")).toBe("+$12.00");
    expect(formatCredits(1)).toBe("1 credit");
    expect(parseAmountMinor("50")).toBe(5_000);
    expect(parseAmountMinor("$1,200.5")).toBe(120_050);
    expect(parseAmountMinor("12.345")).toBeNull();
    expect(parseAmountMinor("abc")).toBeNull();
  });

  it("the summary says what the owner's screen said, in Duna Pay words", () => {
    const summary = moneySummary(input, "America/Los_Angeles");
    expect(summary.available).toBe("$146.94");
    expect(summary.freesUp).toBe("$27.25 frees up Fri, Dec 4");
    expect(summary.net30).toBe("$644.74");
    expect(summary.availableNote).toBe("Pays out every Friday");
    expect(summary.canPayOut).toBe(true);
    expect(summary.bank).toBe("First Sand Bank ending 1842");
    for (const value of Object.values(summary))
      if (typeof value === "string") expect(value).not.toMatch(/stripe/i);
  });

  it("honest states: not set up, paused, nothing ready", () => {
    expect(
      moneySummary({
        ...input,
        connect: { ...input.connect, connected: false },
      }).availableNote,
    ).toBe("Set up Duna Pay to be paid out");
    const paused = moneySummary({
      ...input,
      connect: { ...input.connect, payoutsEnabled: false },
    });
    expect(paused.state).toBe("action-needed");
    expect(paused.canPayOut).toBe(false);
    expect(
      moneySummary({
        ...input,
        balance: { ...input.balance, availableMinor: 0 },
      }).availableNote,
    ).toBe("Nothing is ready to pay out yet");
  });

  it("the trend is a line with words, and says so when there are no sales", () => {
    const trend = netTrend(input.earnings.points, "USD");
    expect(trend.points).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(trend.summary).toBe(
      "$644.74 net over 3 days; best day Sat, Nov 28, $644.74.",
    );
    expect(trendPath(trend, 100, 50)).toBe("M2.0 48.0 L50.0 48.0 L98.0 2.0");
    expect(netTrend([], "USD")).toMatchObject({ empty: true });
    expect(
      netTrend(
        [
          { date: "2026-11-01", netMinor: 0 },
          { date: "2026-11-02", netMinor: 0 },
        ],
        "USD",
      ).summary,
    ).toBe("No sales in this period yet.");
  });
});

describe("contrast (the owner couldn't read the old Money card)", () => {
  const { color, brand } = nativeTokens;
  it("every role on the Night Court summary passes 4.5:1", () => {
    // The summary is drawn in the dark theme on Night Court in both themes.
    for (const role of ["text", "text-2"] as const)
      expect(
        contrastRatio(color.dark[role], brand["night-court"]),
      ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(brand.dune, brand["night-court"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(color.dark["text-3"], brand["night-court"]),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("the reading roles below it pass on Salt (light) and Night Court (dark)", () => {
    for (const theme of ["light", "dark"] as const)
      for (const role of [
        "text",
        "text-2",
        "positive",
        "warning",
        "attention",
        "info",
      ] as const)
        expect(
          contrastRatio(color[theme][role], color[theme].ground),
          `${theme} ${role}`,
        ).toBeGreaterThanOrEqual(4.5);
  });

  it("the old pale text (#9fb0b8-on-Salt class of failure) would be caught", () => {
    expect(contrastRatio("#c9d3d8", color.light.ground)).toBeLessThan(4.5);
  });

  it("Money copy never names the payment processor", () => {
    for (const file of ["MoneyScreen.tsx", "money-model.ts"]) {
      const text = readFileSync(join(import.meta.dirname, file), "utf8")
        // Code identifiers from the API shape are not copy.
        .replace(/stripe[A-Z]\w*/g, "");
      expect(text, file).not.toMatch(/Stripe/);
    }
  });

  it("the preview data has a payout bank and sales to show", () => {
    const preview = previewMoney();
    expect(preview.transactions.length).toBeGreaterThan(0);
    expect(moneySummary(preview).bank).toContain("1842");
  });
});
