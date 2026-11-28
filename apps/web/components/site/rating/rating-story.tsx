"use client";

import { NetScore, RatingRing } from "@duna/ui/tideline";
import { useEffect, useState } from "react";
import { usePlayOnce } from "../use-play-once";

const TEAMS = ["Kai / Rio", "Noa / Sam"] as const;
const FIRST_SET = [21, 17] as const;
/** The second set's last four rallies: Kai and Rio close it out, 21–19. */
const SECOND_SET_POINTS = [18, 19, 20, 21] as const;
const THEIRS = 19;
const BEFORE = 3.12;
const AFTER = 3.2;

type Stage = "play" | "recorded" | "confirmed" | "rated";

const STAGES: ReadonlyArray<{
  readonly stage: Stage;
  readonly title: string;
  readonly body: string;
}> = [
  {
    stage: "play",
    title: "You play and keep score.",
    body: "A competitive doubles match, scored rally by rally.",
  },
  {
    stage: "recorded",
    title: "You save the result.",
    body: "It waits for the other side. Nothing has moved yet.",
  },
  {
    stage: "confirmed",
    title: "The other side confirms.",
    body: "A player on each side has agreed and nobody disputes it.",
  },
  {
    stage: "rated",
    title: "Your Sand Rating moves.",
    body: "Up, because Kai and Rio won a match they were expected to find close.",
  },
];

/** When each step arrives after the story starts playing (ms). */
const AT = {
  points: [500, 1100, 1700, 2300],
  recorded: 3000,
  confirmed: 4300,
  rated: 5400,
} as const;

function useStory(phase: "rest" | "armed" | "play", replays: number) {
  const playing = phase === "play" || replays > 0;
  // The end of the story until it plays: the server HTML, reduced motion.
  const [stage, setStage] = useState<Stage>("rated");
  const [point, setPoint] = useState(SECOND_SET_POINTS.length - 1);
  useEffect(() => {
    // Below the fold after hydration: wait at the start, unseen.
    if (phase !== "armed") return;
    setStage("play");
    setPoint(0);
  }, [phase]);
  useEffect(() => {
    if (!playing) return;
    setStage("play");
    setPoint(0);
    const timers = [
      ...AT.points
        .slice(1)
        .map((delay, index) =>
          window.setTimeout(() => setPoint(index + 1), delay),
        ),
      window.setTimeout(() => setStage("recorded"), AT.recorded),
      window.setTimeout(() => setStage("confirmed"), AT.confirmed),
      window.setTimeout(() => setStage("rated"), AT.rated),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [playing, replays]);
  return { stage, point };
}

/**
 * One example match, told with the real `NetScore` and `RatingRing`: the
 * last rallies of the second set, the result saved and waiting, the other
 * side's confirmation, then the rating Rising from 3.12 to 3.20. It plays
 * once when it comes into view; "Play it again" replays it. The server
 * renders the end of the story, which is also what reduced motion shows.
 */
export function RatingStory() {
  const { ref, phase } = usePlayOnce<HTMLDivElement>(0.35);
  const [replays, setReplays] = useState(0);
  const { stage, point } = useStory(phase, replays);
  const index = STAGES.findIndex((item) => item.stage === stage);
  const status =
    stage === "play"
      ? "live"
      : stage === "recorded"
        ? "pending-verification"
        : "verified";
  const rated = stage === "rated";
  return (
    <div className="site-story-rating" data-stage={stage} ref={ref}>
      <ol className="site-story-rating__steps">
        {STAGES.map((item, position) => (
          <li
            aria-current={position === index ? "step" : undefined}
            data-done={position < index ? "" : undefined}
            key={item.stage}
          >
            <span className="td-num site-story-rating__n">{position + 1}</span>
            <span>
              <b>{item.title}</b>
              <span>{item.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="td site-story-rating__panel" data-theme="dark">
        <div className="site-story-rating__head">
          <span className="site-label">Example match</span>
          <span className="site-example">Example</span>
        </div>
        <NetScore
          announce={false}
          bestOf={3}
          className="site-story-rating__score"
          layout="net"
          liveZone={false}
          serving={stage === "play" ? "home" : null}
          sets={[FIRST_SET, [SECOND_SET_POINTS[point]!, THEIRS]]}
          size="md"
          status={status}
          teams={TEAMS}
        />
        <div className="site-story-rating__ring">
          <RatingRing
            animate={rated && (phase === "play" || replays > 0)}
            delta={rated ? Number((AFTER - BEFORE).toFixed(2)) : null}
            key={rated ? `rated-${replays}` : "before"}
            label="Kai’s Sand Rating"
            reliability={2}
            size={220}
            value={rated ? AFTER : BEFORE}
          />
          <p aria-live="polite" className="site-meta">
            {rated
              ? "Confirmed by both sides. Counted."
              : stage === "confirmed"
                ? "Confirmed. Updating the rating."
                : stage === "recorded"
                  ? "Saved. Waiting for the other side."
                  : "In play. Not counted yet."}
          </p>
        </div>
        <button
          className="site-textbutton site-story-rating__replay"
          onClick={() => setReplays((count) => count + 1)}
          type="button"
        >
          Play it again
        </button>
      </div>
    </div>
  );
}
