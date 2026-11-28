"use client";

import { Avatar, ConditionsLine } from "@duna/ui/tideline";
import { GlassCard } from "../glass-card";

/**
 * The example morning: one weather hour, example data labelled as such on
 * the card. Fixed values, so the server and the browser draw the same line.
 * (No sun times: those come from the venue's place and date in the app.)
 */
const ZONE = "America/Los_Angeles";
/** 7:00 AM Pacific (UTC−8) on Thursday 3 December 2026. */
const SEVEN_AM = Date.UTC(2026, 11, 3, 15, 0);
const MORNING = {
  at: SEVEN_AM,
  temperatureC: 17,
  windSpeedKph: 14,
  windGustKph: 19,
  windFromDeg: 250,
  precipChancePct: 0,
  uvIndex: 1,
} as const;

const SESSIONS = [
  {
    at: "7:00",
    title: "Pairs clinic · Court 2",
    detail: "6 players · the sun is low behind the net",
    players: ["Kai Arden", "Noa Ortiz", "Rio Imani"],
  },
  {
    at: "9:30",
    title: "Private lesson · Court 1",
    detail: "Serve receive · wind building through the morning",
    players: ["Sam Ahn"],
  },
  {
    at: "3:30",
    title: "Adult league scrimmage",
    detail: "8 players · the last hour of light",
    players: ["Mara Lind", "Theo Park", "Ivy Moss"],
  },
] as const;

/**
 * A coach's day in Duna Pro (spec 2.4, coaches hero): the real one-line
 * `ConditionsLine` for the first session (temperature, wind with its
 * direction, and the play call when it matters) over today's sessions. Static by
 * design; the kit's line fits itself to the card's width.
 */
export function ConceptCoachDay({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <GlassCard
      className={
        className ? `site-concept-day ${className}` : "site-concept-day"
      }
      example
      label="Today · Thu"
      status={`${SESSIONS.length} sessions`}
    >
      <ConditionsLine
        conditions={MORNING}
        now={SEVEN_AM}
        readAt={SEVEN_AM}
        timeZone={ZONE}
      />
      <ol className="site-day">
        {SESSIONS.map((session, index) => (
          <li data-secondary={index > 1 ? "" : undefined} key={session.title}>
            <span className="td-num site-day__at">{session.at}</span>
            <span className="site-day__what">
              <b>{session.title}</b>
              <span>{session.detail}</span>
            </span>
            <span aria-hidden="true" className="site-day__faces">
              {session.players.slice(0, 3).map((name) => (
                <Avatar key={name} name={name} size="xs" />
              ))}
            </span>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}
