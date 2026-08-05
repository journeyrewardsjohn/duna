import type { PredictionMarketView } from "@duna/api";
import { CircleCheckBig } from "lucide-react";
import {
  buildViewerPredictionSummary,
  formatPredictionAmount,
  viewerPredictionStateLabel,
} from "@/lib/prediction-position";

export function ViewerPredictionPosition({
  market,
  variant = "panel",
}: {
  readonly market: PredictionMarketView;
  readonly variant?: "panel" | "compact";
}) {
  const summary = buildViewerPredictionSummary(market);
  if (!summary) return null;
  const headline = `${formatPredictionAmount(summary.totalCommittedCredits)} credits committed`;
  return (
    <div
      aria-label="Your prediction position"
      className={`viewer-prediction-position viewer-prediction-position--${variant}`}
    >
      <header>
        <CircleCheckBig aria-hidden size={variant === "compact" ? 17 : 20} />
        <span>
          <small>Your position</small>
          <strong>{headline}</strong>
        </span>
      </header>
      <div>
        {summary.sides.map((side) => {
          const details = [
            side.matchedShares > 0
              ? `${formatPredictionAmount(side.matchedShares)} shares matched`
              : undefined,
            side.openCredits > 0
              ? `${formatPredictionAmount(side.openCredits)} credits open`
              : undefined,
            side.payoutCredits > 0
              ? `${formatPredictionAmount(side.payoutCredits)} credits settled`
              : undefined,
            side.listedShares > 0
              ? `${formatPredictionAmount(side.listedShares)} shares listed`
              : undefined,
          ].filter(Boolean);
          return (
            <p key={side.side}>
              <span>{side.label}</span>
              <strong>{viewerPredictionStateLabel(side.state)}</strong>
              <small>{details.join(" · ")}</small>
            </p>
          );
        })}
      </div>
    </div>
  );
}
