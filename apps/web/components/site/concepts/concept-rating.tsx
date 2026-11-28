"use client";

import { RatingRing } from "@duna/ui/tideline";
import { GlassCard } from "../glass-card";
import { type PlayPhase, usePlayOnce } from "../use-play-once";

export interface ConceptRatingProps {
  readonly label: string;
  readonly status: string;
  /** The rating before and after the match (an example when signed out). */
  readonly from: number;
  readonly to: number;
  /** Reliability band, 0 to 3. */
  readonly reliability: number;
  readonly stats?: ReadonlyArray<{ label: string; value: string }>;
  /** Ring diameter in px. */
  readonly size?: number;
  /**
   * `first-paint` Rises with CSS from the first frame (the hero: nothing on
   * the first screen waits for script). `in-view` plays once at 45% visible.
   * `driven` plays when `phase` says so (the story's sticky column).
   */
  readonly trigger?: "first-paint" | "in-view" | "driven";
  readonly phase?: PlayPhase;
  readonly className?: string;
}

function Card({
  label,
  status,
  from,
  to,
  reliability,
  stats,
  size = 200,
  animate,
  playKey,
  className,
}: ConceptRatingProps & { animate: boolean; playKey: string }) {
  return (
    <GlassCard
      className={
        className ? `site-concept-rating ${className}` : "site-concept-rating"
      }
      example
      label={label}
      status={status}
    >
      <div className="site-concept-rating__ring">
        <RatingRing
          animate={animate}
          delta={Number((to - from).toFixed(2))}
          key={playKey}
          reliability={reliability}
          size={size}
          value={to}
        />
      </div>
      {stats && stats.length > 0 ? (
        <dl className="site-stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd className="td-num">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </GlassCard>
  );
}

function InView(props: ConceptRatingProps) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Card {...props} animate={phase === "play"} playKey={phase} />
    </div>
  );
}

/**
 * The Sand Rating concept: the kit's two-ring RatingRing on glass. The arc
 * Rises from the previous value (900 ms on ease-rise) and the change chip
 * lands after it; under reduced motion it is the end state with a fade.
 */
export function ConceptRating(props: ConceptRatingProps) {
  const trigger = props.trigger ?? "in-view";
  if (trigger === "first-paint") {
    return <Card {...props} animate playKey="first" />;
  }
  if (trigger === "driven") {
    const playing = props.phase === "play";
    return (
      <Card {...props} animate={playing} playKey={playing ? "play" : "rest"} />
    );
  }
  return <InView {...props} />;
}
