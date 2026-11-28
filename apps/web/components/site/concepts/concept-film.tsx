"use client";

import { GlassCard } from "../glass-card";
import { type PlayPhase, usePlayOnce } from "../use-play-once";

/** An example heart-rate trace across a set: 41 samples, 10 units apart. */
const TRACE = Array.from({ length: 41 }, (_, index) => {
  const y =
    44 -
    18 * Math.sin(index / 3) * Math.sin(index / 7) -
    (index > 22 && index < 30 ? 14 : 0);
  return `${index * 10},${y.toFixed(1)}`;
}).join(" ");

/** Rally markers along the film: x and width; the fourth is the one shown. */
const RALLIES = [
  [30, 22],
  [90, 22],
  [150, 22],
  [230, 40],
  [300, 22],
  [360, 22],
] as const;
const CURRENT_RALLY = 3;

function Card({
  phase,
  className,
}: {
  readonly phase: PlayPhase;
  readonly className?: string;
}) {
  return (
    <GlassCard
      className={
        className ? `site-concept-film ${className}` : "site-concept-film"
      }
      data-phase={phase}
      example
      label="Match film · Set 2"
      status="Rally 14"
    >
      <div className="site-film">
        <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 400 64">
          {RALLIES.map(([x, width], index) => (
            <rect
              className={
                index === CURRENT_RALLY
                  ? "site-film__rally site-film__rally--current"
                  : "site-film__rally"
              }
              height="6"
              key={x}
              rx="2"
              width={width}
              x={x}
              y="6"
            />
          ))}
          <polyline
            className="site-film__trace"
            pathLength={1}
            points={TRACE}
          />
          <line className="site-film__head" x1="245" x2="245" y1="0" y2="64" />
        </svg>
      </div>
      <dl className="site-film__legend">
        <div>
          <dt>Rally</dt>
          <dd className="td-num">38 s</dd>
        </div>
        <div>
          <dt>Heart rate</dt>
          <dd className="td-num">168</dd>
        </div>
        <div>
          <dt>Jumps</dt>
          <dd className="td-num">7</dd>
        </div>
      </dl>
      <p className="td-sr">
        Example: rally 14 of set 2 lasted 38 seconds, heart rate peaked at 168,
        with 7 jumps, laid over the match film.
      </p>
    </GlassCard>
  );
}

function InView({ className }: { readonly className?: string }) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Card className={className} phase={phase} />
    </div>
  );
}

/**
 * Film with heart rate (marketing concept): the heart-rate line draws over
 * the rally markers in 900 ms, once. At rest the line is drawn.
 */
export function ConceptFilm({
  trigger = "in-view",
  phase = "rest",
  className,
}: {
  readonly trigger?: "in-view" | "driven";
  readonly phase?: PlayPhase;
  readonly className?: string;
}) {
  if (trigger === "driven") return <Card className={className} phase={phase} />;
  return <InView className={className} />;
}
