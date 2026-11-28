"use client";

import { GlassCard } from "../glass-card";
import { usePlayOnce } from "../use-play-once";

const PLAN = [
  { at: "0:00", name: "Warm-up pepper", minutes: 15 },
  { at: "0:15", name: "Pass to target", minutes: 20 },
  { at: "0:35", name: "Side-out reps", minutes: 30 },
  { at: "1:05", name: "King of the court", minutes: 25 },
] as const;
const ACTIVE_BLOCK = 1;

/**
 * A practice plan and its drill on a court (marketing concept; the drill
 * scene model is design-only today). Players Cross to their positions
 * (320 ms, 120 ms apart), the ball paths draw (600 ms), block 2 is
 * highlighted. At rest everything is in place.
 */
export function ConceptDrill({ className }: { readonly className?: string }) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <GlassCard
        className={
          className ? `site-concept-drill ${className}` : "site-concept-drill"
        }
        data-phase={phase}
        example
        label="Thursday clinic · 90 min"
        status={`Block ${ACTIVE_BLOCK + 1} of ${PLAN.length}`}
      >
        <svg
          aria-label="Drill diagram: two players pass to a target, the coach tosses from the net."
          className="site-court"
          role="img"
          viewBox="0 0 320 170"
        >
          <rect
            className="site-court__sand"
            height="150"
            rx="4"
            width="300"
            x="10"
            y="10"
          />
          <line className="site-court__net" x1="160" x2="160" y1="4" y2="166" />
          <rect
            className="site-court__target"
            height="54"
            rx="3"
            width="44"
            x="214"
            y="58"
          />
          <text
            className="site-court__note"
            textAnchor="middle"
            x="236"
            y="128"
          >
            target
          </text>
          <path
            className="site-court__path"
            d="M150 84 C 120 40, 80 40, 66 64"
            pathLength={1}
          />
          <path
            className="site-court__path site-court__path--2"
            d="M66 64 C 120 20, 200 20, 236 84"
            pathLength={1}
          />
          <g className="site-court__player site-court__player--a">
            <circle cx="66" cy="64" r="9" />
            <text textAnchor="middle" x="66" y="68">
              A
            </text>
          </g>
          <g className="site-court__player site-court__player--b">
            <circle cx="88" cy="106" r="9" />
            <text textAnchor="middle" x="88" y="110">
              B
            </text>
          </g>
          <g className="site-court__coach">
            <circle cx="148" cy="84" r="9" />
            <text textAnchor="middle" x="148" y="88">
              C
            </text>
          </g>
        </svg>
        <ol className="site-plan">
          {PLAN.map((block, index) => (
            <li
              aria-current={index === ACTIVE_BLOCK ? "step" : undefined}
              key={block.name}
            >
              <span className="td-num">{block.at}</span>
              <span>{block.name}</span>
              <span className="td-num">{block.minutes} min</span>
            </li>
          ))}
        </ol>
      </GlassCard>
    </div>
  );
}
