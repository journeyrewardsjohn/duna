/**
 * One live match per phone (M-P4a): the controller lives at the shell, so
 * the scoreboard, the resume prompt and the Watch all see the same log.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useLiveMatch, type LiveMatchController } from "./use-live-match";

const LiveMatchContext = createContext<LiveMatchController | null>(null);

export function LiveMatchProvider({
  active,
  children,
}: {
  /** The scoreboard is on screen (keeps the screen awake, talks to the Watch). */
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  const controller = useLiveMatch({ active });
  return (
    <LiveMatchContext.Provider value={controller}>
      {children}
    </LiveMatchContext.Provider>
  );
}

export function useLiveMatchController(): LiveMatchController {
  const value = useContext(LiveMatchContext);
  if (!value) throw new Error("useLiveMatchController needs LiveMatchProvider");
  return value;
}
