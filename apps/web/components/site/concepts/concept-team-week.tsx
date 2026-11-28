"use client";

import { Avatar } from "@duna/ui/tideline";
import type { CSSProperties } from "react";
import { GlassCard } from "../glass-card";
import { usePlayOnce } from "../use-play-once";

/** The example week (demo staff and sessions, labelled on the card). */
const WEEK = [
  {
    day: "Mon",
    time: "5:30 PM",
    what: "Junior clinic · Court 2",
    coach: "Ana Ruiz",
    covered: true,
  },
  {
    day: "Tue",
    time: "7:00 AM",
    what: "Private lesson · Court 1",
    coach: "Theo Park",
    covered: true,
  },
  {
    day: "Wed",
    time: "6:00 PM",
    what: "Adult league night",
    coach: "Ana Ruiz",
    covered: true,
  },
  {
    day: "Thu",
    time: "5:30 PM",
    what: "Pairs clinic · Court 4",
    coach: null,
    covered: false,
  },
] as const;

/**
 * Team and schedule: the week's sessions with the coach on each, and the one
 * that still needs someone. The rows Rally in once when the card is seen.
 */
export function ConceptTeamWeek({
  className,
}: {
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <GlassCard
        className={
          className ? `site-concept-team ${className}` : "site-concept-team"
        }
        data-phase={phase}
        example
        label="This week · Staff"
        status="1 to cover"
      >
        <ol className="site-team">
          {WEEK.map((row, index) => (
            <li
              data-open={row.covered ? undefined : ""}
              data-secondary={index === 1 ? "" : undefined}
              key={`${row.day}-${row.what}`}
              style={{ "--i": index } as CSSProperties}
            >
              <span className="site-team__when">
                <b>{row.day}</b>
                <span className="td-num">{row.time}</span>
              </span>
              <span className="site-team__what">{row.what}</span>
              {row.coach ? (
                <span className="site-team__coach">
                  <Avatar name={row.coach} size="xs" />
                  <span>{row.coach}</span>
                </span>
              ) : (
                <span className="site-team__coach site-team__coach--open">
                  Needs a coach
                </span>
              )}
            </li>
          ))}
        </ol>
      </GlassCard>
    </div>
  );
}
