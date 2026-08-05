import { describe, expect, it } from "vitest";
import type { PredictionMarketView } from "@duna/api";
import { buildViewerPredictionSummary } from "./prediction-position";

function market(
  viewer: PredictionMarketView["viewer"],
): Pick<PredictionMarketView, "yesLabel" | "noLabel" | "viewer"> {
  return {
    yesLabel: "Carol / Rebecca wins",
    noLabel: "Carol / Rebecca does not win",
    viewer,
  };
}

describe("viewer prediction position summaries", () => {
  it("shows an unfilled order as an open committed position", () => {
    const summary = buildViewerPredictionSummary(
      market({
        authenticated: true,
        positions: [],
        orders: [
          {
            id: "ee10c1a5-b879-4c7b-ae4a-8a299cd87531",
            intent: "buy",
            side: "yes",
            limitPriceBps: 830,
            allocatedCredits: 10,
            filledCredits: 0,
            openCredits: 10,
            openShares: 120.48,
            filledShares: 0,
            proceedsCredits: 0,
            status: "open",
            createdAt: "2026-08-05T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(summary?.totalCommittedCredits).toBe(10);
    expect(summary?.sides).toMatchObject([
      {
        side: "yes",
        label: "Carol / Rebecca wins",
        openCredits: 10,
        state: "open",
      },
    ]);
  });

  it("does not double count the filled portion of a partial order", () => {
    const summary = buildViewerPredictionSummary(
      market({
        authenticated: true,
        positions: [
          {
            id: "8c9073b9-38ce-481e-a2aa-a493117f5980",
            side: "yes",
            shares: 60,
            availableShares: 60,
            listedShares: 0,
            costCredits: 5,
            payoutCredits: 0,
            status: "open",
          },
        ],
        orders: [
          {
            id: "8800a291-037d-4549-9acc-60ef6a273c7d",
            intent: "buy",
            side: "yes",
            limitPriceBps: 830,
            allocatedCredits: 10,
            filledCredits: 5,
            openCredits: 5,
            openShares: 60.24,
            filledShares: 60,
            proceedsCredits: 0,
            status: "partially-filled",
            createdAt: "2026-08-05T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(summary?.totalCommittedCredits).toBe(10);
    expect(summary?.sides[0]?.state).toBe("partially-matched");
  });

  it("keeps a settled winning position visible", () => {
    const summary = buildViewerPredictionSummary(
      market({
        authenticated: true,
        positions: [
          {
            id: "8c9073b9-38ce-481e-a2aa-a493117f5980",
            side: "yes",
            shares: 120.48,
            availableShares: 120.48,
            listedShares: 0,
            costCredits: 10,
            payoutCredits: 120.48,
            status: "won",
          },
        ],
        orders: [],
      }),
    );

    expect(summary?.sides[0]).toMatchObject({
      state: "won",
      payoutCredits: 120.48,
    });
  });

  it("returns no summary when the viewer has no position", () => {
    expect(
      buildViewerPredictionSummary(
        market({ authenticated: true, positions: [], orders: [] }),
      ),
    ).toBeUndefined();
  });
});
