"use client";

import {
  createUndoEvent,
  foldScore,
  standardBeachFormat,
  type ScoreEvent,
  type ScoringSystem,
} from "@duna/league-engine";
import { Badge, Numeric } from "@duna/ui";
import {
  ChevronLeft,
  CloudOff,
  RotateCcw,
  Settings2,
  SwitchCamera,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const now = () => new Date().toISOString();

export function LiveScoreboard() {
  const [scoringSystem, setScoringSystem] = useState<ScoringSystem>("rally");
  const [offline, setOffline] = useState(false);
  const [events, setEvents] = useState<readonly ScoreEvent[]>([
    {
      id: "start",
      type: "match-started",
      initialServer: "A",
      occurredAt: now(),
    },
  ]);
  const state = useMemo(
    () =>
      foldScore(events, {
        ...standardBeachFormat,
        scoringSystem,
      }),
    [events, scoringSystem],
  );
  const current = state.sets[state.setIndex] ?? { a: 0, b: 0 };

  function addRally(winner: "A" | "B") {
    if (state.status === "complete") return;
    setEvents((currentEvents) => [
      ...currentEvents,
      {
        id: crypto.randomUUID(),
        type: "rally-won",
        winner,
        occurredAt: now(),
      },
    ]);
  }

  function undo() {
    const event = createUndoEvent(events, {
      id: crypto.randomUUID(),
      occurredAt: now(),
    });
    if (event) setEvents((currentEvents) => [...currentEvents, event]);
  }

  return (
    <div className="scoreboard">
      <header className="scoreboard__top">
        <Link href="/app/matches">
          <ChevronLeft aria-hidden size={22} /> Exit
        </Link>
        <div>
          <Badge tone="live">
            {state.status === "complete" ? "Complete" : "Live scoring"}
          </Badge>
          <span>Manhattan Beach · Court 4</span>
        </div>
        <button aria-label="Scoring settings">
          <Settings2 aria-hidden size={21} />
        </button>
      </header>

      <section className="scoreboard__format">
        <div className="segmented-control">
          <button
            className={scoringSystem === "rally" ? "active" : undefined}
            onClick={() => setScoringSystem("rally")}
          >
            Rally
          </button>
          <button
            className={scoringSystem === "sideout" ? "active" : undefined}
            onClick={() => setScoringSystem("sideout")}
          >
            Sideout
          </button>
        </div>
        <span>
          Set <Numeric>{state.setIndex + 1}</Numeric> · best of 3 · to{" "}
          <Numeric>
            {standardBeachFormat.pointTargets[state.setIndex] ?? 21}
          </Numeric>
        </span>
      </section>

      {(state.sideSwitchDue || state.technicalTimeoutDue) && (
        <div className="scoreboard__notice">
          <SwitchCamera aria-hidden size={20} />
          <strong>
            {state.technicalTimeoutDue ? "Technical timeout" : "Switch sides"}
          </strong>
          <span>Confirm when both teams are ready.</span>
        </div>
      )}

      <section className="scoreboard__court">
        <button
          aria-label="Point for Mara and Theo"
          className="score-team score-team--a"
          disabled={state.status === "complete"}
          onClick={() => addRally("A")}
        >
          <div className="score-team__serve">
            {state.serving === "A" && <span />}
            <small>{state.serving === "A" ? "Serving" : "Receiving"}</small>
          </div>
          <div className="score-team__people">
            <span className="avatar">ML</span>
            <span className="avatar">TP</span>
            <strong>Mara / Theo</strong>
          </div>
          <Numeric>{current.a}</Numeric>
          <span className="score-team__hint">Tap anywhere for point</span>
        </button>
        <div className="scoreboard__divider">
          <span>VS</span>
        </div>
        <button
          aria-label="Point for Noa and Elena"
          className="score-team score-team--b"
          disabled={state.status === "complete"}
          onClick={() => addRally("B")}
        >
          <div className="score-team__serve">
            {state.serving === "B" && <span />}
            <small>{state.serving === "B" ? "Serving" : "Receiving"}</small>
          </div>
          <div className="score-team__people">
            <span className="avatar">NW</span>
            <span className="avatar">ET</span>
            <strong>Noa / Elena</strong>
          </div>
          <Numeric>{current.b}</Numeric>
          <span className="score-team__hint">Tap anywhere for point</span>
        </button>
      </section>

      <footer className="scoreboard__bottom">
        <button disabled={events.length <= 1} onClick={undo}>
          <RotateCcw aria-hidden size={19} /> Undo
        </button>
        <div>
          <button
            aria-label={offline ? "Go online" : "Simulate offline"}
            onClick={() => setOffline((value) => !value)}
          >
            {offline ? (
              <CloudOff aria-hidden size={18} />
            ) : (
              <Wifi aria-hidden size={18} />
            )}
          </button>
          <span>
            <strong>{offline ? "Saved on this device" : "Synced"}</strong>
            <small>
              {offline
                ? `${Math.max(0, events.length - 1)} events pending upload`
                : "Server and device agree"}
            </small>
          </span>
        </div>
        <div className="scoreboard__sets">
          {state.sets.map((set, index) => (
            <span
              className={index === state.setIndex ? "active" : undefined}
              key={index}
            >
              <small>S{index + 1}</small>
              <Numeric>
                {set.a}–{set.b}
              </Numeric>
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
