import type { PredictionMarketView } from "@duna/api";

export type ViewerPredictionState =
  "open" | "listed" | "partially-matched" | "matched" | "won" | "lost" | "void";

export interface ViewerPredictionSideSummary {
  readonly side: "yes" | "no";
  readonly label: string;
  readonly matchedShares: number;
  readonly matchedCostCredits: number;
  readonly openCredits: number;
  readonly openShares: number;
  readonly payoutCredits: number;
  readonly listedShares: number;
  readonly state: ViewerPredictionState;
}

export interface ViewerPredictionSummary {
  readonly sides: readonly ViewerPredictionSideSummary[];
  readonly totalCommittedCredits: number;
  readonly totalMatchedShares: number;
  readonly totalOpenCredits: number;
}

const activeOrderStatuses = new Set(["open", "partially-filled"]);

function total(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function stateFor(input: {
  readonly statuses: readonly string[];
  readonly matchedShares: number;
  readonly openCredits: number;
  readonly listedShares: number;
}): ViewerPredictionState {
  if (input.statuses.includes("won")) return "won";
  if (input.statuses.includes("lost")) return "lost";
  if (input.statuses.includes("void")) return "void";
  if (input.listedShares > 0) return "listed";
  if (input.matchedShares > 0 && input.openCredits > 0) {
    return "partially-matched";
  }
  if (input.matchedShares > 0) return "matched";
  return "open";
}

export function buildViewerPredictionSummary(
  market: Pick<PredictionMarketView, "yesLabel" | "noLabel" | "viewer">,
): ViewerPredictionSummary | undefined {
  const sides = (["yes", "no"] as const).flatMap((side) => {
    const positions = market.viewer.positions.filter(
      (position) => position.side === side,
    );
    const orders = market.viewer.orders.filter(
      (order) =>
        order.intent === "buy" &&
        order.side === side &&
        activeOrderStatuses.has(order.status),
    );
    const matchedShares = total(positions.map((position) => position.shares));
    const matchedCostCredits = total(
      positions.map((position) => position.costCredits),
    );
    const payoutCredits = total(
      positions.map((position) => position.payoutCredits),
    );
    const listedShares = total(
      positions.map((position) => position.listedShares),
    );
    const openCredits = total(orders.map((order) => order.openCredits));
    const openShares = total(orders.map((order) => order.openShares));
    if (
      matchedShares <= 0 &&
      matchedCostCredits <= 0 &&
      payoutCredits <= 0 &&
      openCredits <= 0
    ) {
      return [];
    }
    return [
      {
        side,
        label: side === "yes" ? market.yesLabel : market.noLabel,
        matchedShares,
        matchedCostCredits,
        openCredits,
        openShares,
        payoutCredits,
        listedShares,
        state: stateFor({
          statuses: positions.map((position) => position.status),
          matchedShares,
          openCredits,
          listedShares,
        }),
      } satisfies ViewerPredictionSideSummary,
    ];
  });
  if (sides.length === 0) return undefined;
  return {
    sides,
    totalCommittedCredits: total(
      sides.map((side) => side.matchedCostCredits + side.openCredits),
    ),
    totalMatchedShares: total(sides.map((side) => side.matchedShares)),
    totalOpenCredits: total(sides.map((side) => side.openCredits)),
  };
}

export function viewerPredictionStateLabel(state: ViewerPredictionState) {
  return state === "partially-matched"
    ? "Partially matched"
    : state === "matched"
      ? "Matched"
      : state === "listed"
        ? "Listed for sale"
        : state === "won"
          ? "Won"
          : state === "lost"
            ? "Settled"
            : state === "void"
              ? "Voided"
              : "Open in order book";
}

export function formatPredictionAmount(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}
