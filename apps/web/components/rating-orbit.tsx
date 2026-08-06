import { Numeric } from "@duna/ui";

export function RatingOrbit({
  value,
  delta,
  confidence,
  compact = false,
}: {
  readonly value: number;
  readonly delta?: number;
  readonly confidence: string;
  readonly compact?: boolean;
}) {
  const progress = Math.max(0, Math.min(1, (value - 1) / 7));
  return (
    <div
      aria-label={`Sand Rating ${value.toFixed(2)}, ${confidence}`}
      className={
        compact ? "rating-orbit rating-orbit--compact" : "rating-orbit"
      }
      style={{ "--rating-progress": progress } as React.CSSProperties}
    >
      <svg aria-hidden viewBox="0 0 200 200">
        <circle className="rating-orbit__track" cx="100" cy="100" r="88" />
        <circle className="rating-orbit__value" cx="100" cy="100" r="88" />
      </svg>
      <div className="rating-orbit__content">
        <span>Sand Rating</span>
        <Numeric tier={compact ? "block" : "hero"}>{value.toFixed(2)}</Numeric>
        {!compact && (
          <small>
            {delta !== undefined && delta !== 0
              ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)} · `
              : ""}
            {confidence}
          </small>
        )}
      </div>
    </div>
  );
}
