"use client";

import {
  createAnnouncementGate,
  scoreAnnouncement,
  scoreAnnouncementText,
  type NetScoreState,
} from "@duna/tideline-core";
import { useEffect, useRef, useState } from "react";

export interface NetScoreAnnouncerProps {
  state: NetScoreState;
  names: { home: string; away: string };
  /** Shortest gap between two announcements, in ms. */
  quietMs?: number;
}

/**
 * A polite live region for a score that changes while someone watches. It
 * says what changed (`scoreAnnouncement` → words), at most once per
 * `quietMs`; a burst of points is held and only the latest score is said.
 * The first render says nothing: the card's sentence already describes it.
 */
export function NetScoreAnnouncer({
  state,
  names,
  quietMs = 2000,
}: NetScoreAnnouncerProps) {
  const previous = useRef<NetScoreState>(state);
  const gate = useRef(createAnnouncementGate(quietMs));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [message, setMessage] = useState("");

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === state) return;
    const text = scoreAnnouncementText(
      scoreAnnouncement(before, state),
      state,
      names,
    );
    if (text === null) return;
    const now = performance.now();
    const said = gate.current.offer(text, now);
    if (said !== null) {
      setMessage(said);
      return;
    }
    const due = gate.current.dueAt();
    if (due === null || timer.current !== null) return;
    // One timer per quiet window; the gate keeps only the latest message.
    timer.current = setTimeout(
      () => {
        timer.current = null;
        // A timer can fire a hair early; the window has ended by now.
        const held = gate.current.flush(Math.max(performance.now(), due));
        if (held !== null) setMessage(held);
      },
      Math.max(0, due - now),
    );
  }, [state, names]);

  return (
    <span aria-atomic="true" aria-live="polite" className="td-sr" role="status">
      {message}
    </span>
  );
}
