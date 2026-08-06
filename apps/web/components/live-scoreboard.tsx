"use client";

import type { MatchScoringState, ScoreEventEnvelope } from "@duna/api";
import type { PersonSummary, VenueSummary } from "@duna/core";
import {
  createUndoEvent,
  foldScore,
  standardBeachFormat,
  type ScoreEvent,
} from "@duna/league-engine";
import { Badge, Numeric } from "@duna/ui";
import {
  ChevronLeft,
  CloudOff,
  Radio,
  RotateCcw,
  SwitchCamera,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { appendMatchEventsAction } from "@/app/app/score/actions";
import { MatchRecorder } from "@/components/match-recorder";

const now = () => new Date().toISOString();

function initials(people: MatchScoringState["teamA"]["people"]): string[] {
  return people.map((person) => person.initials);
}

export function LiveScoreboard({
  currentPlayer,
  initialMatch,
  initialWatchScores = [],
  players,
  venues,
}: {
  readonly currentPlayer: PersonSummary;
  readonly initialMatch?: MatchScoringState;
  readonly initialWatchScores?: readonly {
    readonly a: number;
    readonly b: number;
  }[];
  readonly players: readonly PersonSummary[];
  readonly venues: readonly VenueSummary[];
}) {
  const [match, setMatch] = useState(initialMatch);
  const [events, setEvents] = useState<readonly ScoreEvent[]>(
    initialMatch?.events ?? [],
  );
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string>();
  const pendingRef = useRef<ScoreEventEnvelope[]>([]);
  const sequenceRef = useRef(initialMatch?.nextSequence ?? 2);
  const counterRef = useRef(initialMatch?.nextMonotonicCounter ?? 2);
  const syncingRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const score = useMemo(
    () => foldScore(events, match?.format ?? standardBeachFormat),
    [events, match?.format],
  );
  const current = score.sets[score.setIndex] ?? { a: 0, b: 0 };
  const storageKey = match ? `duna-score-pending:${match.matchId}` : undefined;

  const persistPending = () => {
    if (!storageKey) return;
    if (pendingRef.current.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(pendingRef.current),
      );
    }
    setPendingCount(pendingRef.current.length);
  };

  flushRef.current = async () => {
    if (
      syncingRef.current ||
      !match ||
      pendingRef.current.length === 0 ||
      !navigator.onLine
    ) {
      if (!navigator.onLine) setOffline(true);
      return;
    }
    syncingRef.current = true;
    const batch = [...pendingRef.current];
    const response = await appendMatchEventsAction({
      matchId: match.matchId,
      deviceId: match.deviceId,
      events: batch,
    });
    if (response.ok) {
      const sentIds = new Set(batch.map((envelope) => envelope.event.id));
      pendingRef.current = pendingRef.current.filter(
        (envelope) => !sentIds.has(envelope.event.id),
      );
      const remainingEvents = pendingRef.current.map(
        (envelope) => envelope.event,
      );
      setMatch(response.result.scoring);
      setEvents([
        ...response.result.scoring.events,
        ...remainingEvents.filter(
          (event) =>
            !response.result.scoring.events.some(
              (stored) => stored.id === event.id,
            ),
        ),
      ]);
      setError(undefined);
      setOffline(false);
      persistPending();
    } else {
      setError(response.error);
      setOffline(true);
    }
    syncingRef.current = false;
    if (pendingRef.current.length > 0 && navigator.onLine) {
      window.setTimeout(() => void flushRef.current(), 0);
    }
  };

  useEffect(() => {
    if (!match || !storageKey) return;
    sequenceRef.current = match.nextSequence;
    counterRef.current = match.nextMonotonicCounter;
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ScoreEventEnvelope[];
        const pending = parsed
          .filter(
            (envelope) =>
              envelope.sequence >= match.nextSequence &&
              typeof envelope.event?.id === "string",
          )
          .sort((a, b) => a.sequence - b.sequence);
        pendingRef.current = pending;
        if (pending.length > 0) {
          sequenceRef.current =
            Math.max(...pending.map((envelope) => envelope.sequence)) + 1;
          counterRef.current =
            Math.max(...pending.map((envelope) => envelope.monotonicCounter)) +
            1;
          setEvents([
            ...match.events,
            ...pending
              .map((envelope) => envelope.event)
              .filter(
                (event) =>
                  !match.events.some(
                    (storedEvent) => storedEvent.id === event.id,
                  ),
              ),
          ]);
          setPendingCount(pending.length);
          void flushRef.current();
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    const online = () => {
      setOffline(false);
      void flushRef.current();
    };
    const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [match?.matchId, storageKey]);

  const queueEvent = (event: ScoreEvent) => {
    if (!match || match.status !== "live") return;
    const envelope: ScoreEventEnvelope = {
      sequence: sequenceRef.current,
      monotonicCounter: counterRef.current,
      event,
    };
    sequenceRef.current += 1;
    counterRef.current += 1;
    pendingRef.current = [...pendingRef.current, envelope];
    setEvents((currentEvents) => [...currentEvents, event]);
    persistPending();
    void flushRef.current();
  };

  if (!match) {
    return (
      <MatchRecorder
        currentPlayer={currentPlayer}
        initialWatchScores={initialWatchScores}
        players={players}
        venues={venues}
      />
    );
  }

  const scoringOpen = match.status === "live" && score.status === "live";
  const teamAInitials = initials(match.teamA.people);
  const teamBInitials = initials(match.teamB.people);
  const activeServer = [...match.teamA.people, ...match.teamB.people].find(
    (person) => person.id === score.serverPersonId,
  );

  return (
    <div className="scoreboard">
      <header className="scoreboard__top">
        <Link href="/app/matches">
          <ChevronLeft aria-hidden size={22} /> Exit
        </Link>
        <div>
          <Badge tone={scoringOpen ? "live" : "warning"}>
            {match.status === "pending-verification"
              ? "Awaiting confirmation"
              : match.status === "verified"
                ? "Verified"
                : match.status === "disputed"
                  ? "Disputed"
                  : "Live scoring"}
          </Badge>
          <span>{match.venueName}</span>
        </div>
        <Link
          aria-label="Open public live view"
          href={`/live/${match.matchId}`}
        >
          <Radio aria-hidden size={21} />
        </Link>
      </header>

      <section className="scoreboard__format">
        <div className="segmented-control">
          <button className="active" disabled>
            {match.format.scoringSystem === "rally" ? "Rally" : "Sideout"}
          </button>
        </div>
        <span>
          Set <Numeric tier="chip">{score.setIndex + 1}</Numeric> · best of 3 ·
          to{" "}
          <Numeric tier="chip">
            {match.format.pointTargets[score.setIndex] ?? 21}
          </Numeric>
        </span>
      </section>

      {(score.sideSwitchDue || score.technicalTimeoutDue) && (
        <button
          className="scoreboard__notice"
          disabled={!scoringOpen}
          onClick={() => {
            if (score.technicalTimeoutDue) {
              queueEvent({
                id: crypto.randomUUID(),
                type: "technical-timeout-completed",
                setIndex: score.setIndex,
                occurredAt: now(),
              });
            }
          }}
          type="button"
        >
          <SwitchCamera aria-hidden size={20} />
          <strong>
            {score.technicalTimeoutDue ? "Technical timeout" : "Switch sides"}
          </strong>
          <span>
            {score.technicalTimeoutDue
              ? "Tap when both teams are ready."
              : "Side-switch checkpoint reached."}
          </span>
        </button>
      )}

      <section className="scoreboard__court">
        <button
          aria-label={`Point for ${match.teamA.name}`}
          className="score-team score-team--a"
          disabled={!scoringOpen}
          onClick={() =>
            queueEvent({
              id: crypto.randomUUID(),
              type: "rally-won",
              winner: "A",
              occurredAt: now(),
            })
          }
          type="button"
        >
          <div className="score-team__serve">
            {score.serving === "A" && <span />}
            <small>
              {score.serving === "A"
                ? `Serving${activeServer ? ` · ${activeServer.displayName.split(" ")[0]}` : ""}`
                : "Receiving"}
            </small>
          </div>
          <div className="score-team__people">
            {teamAInitials.map((value, index) => (
              <span className="avatar" key={`${value}-${index}`}>
                {value}
              </span>
            ))}
            <strong>{match.teamA.name}</strong>
          </div>
          <Numeric tier="score">{current.a}</Numeric>
          <span className="score-team__hint">
            {scoringOpen ? "Tap anywhere for point" : "Scoring closed"}
          </span>
        </button>
        <div className="scoreboard__divider">
          <span>VS</span>
        </div>
        <button
          aria-label={`Point for ${match.teamB.name}`}
          className="score-team score-team--b"
          disabled={!scoringOpen}
          onClick={() =>
            queueEvent({
              id: crypto.randomUUID(),
              type: "rally-won",
              winner: "B",
              occurredAt: now(),
            })
          }
          type="button"
        >
          <div className="score-team__serve">
            {score.serving === "B" && <span />}
            <small>
              {score.serving === "B"
                ? `Serving${activeServer ? ` · ${activeServer.displayName.split(" ")[0]}` : ""}`
                : "Receiving"}
            </small>
          </div>
          <div className="score-team__people">
            {teamBInitials.map((value, index) => (
              <span className="avatar" key={`${value}-${index}`}>
                {value}
              </span>
            ))}
            <strong>{match.teamB.name}</strong>
          </div>
          <Numeric tier="score">{current.b}</Numeric>
          <span className="score-team__hint">
            {scoringOpen ? "Tap anywhere for point" : "Scoring closed"}
          </span>
        </button>
      </section>

      <footer className="scoreboard__bottom">
        <button
          disabled={!scoringOpen || events.length <= 1}
          onClick={() => {
            const event = createUndoEvent(events, {
              id: crypto.randomUUID(),
              occurredAt: now(),
            });
            if (event) queueEvent(event);
          }}
          type="button"
        >
          <RotateCcw aria-hidden size={19} /> Undo
        </button>
        <div>
          <span aria-hidden>
            {offline ? (
              <CloudOff aria-hidden size={18} />
            ) : (
              <Wifi aria-hidden size={18} />
            )}
          </span>
          <span>
            <strong>{offline ? "Saved on this device" : "Synced"}</strong>
            <small>
              {pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? "event" : "events"} pending upload`
                : "Server and device agree"}
            </small>
          </span>
        </div>
        <div className="scoreboard__sets">
          {score.sets.map((set, index) => (
            <span
              className={index === score.setIndex ? "active" : undefined}
              key={index}
            >
              <small>S{index + 1}</small>
              <Numeric tier="table">
                {set.a}–{set.b}
              </Numeric>
            </span>
          ))}
        </div>
      </footer>
      {error && (
        <div className="scoreboard__sync-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
