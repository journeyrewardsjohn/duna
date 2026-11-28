import { createContext, useContext } from "react";
import type { ProAudience, RouteKey, TabKey } from "./router";
import type { RouteEntry, RouteParams, ShellAction } from "./shell-state";

/**
 * What every screen inside the Pro shell can ask of it: navigate, open the
 * Create sheet and read who the tabs are labelled for. Screens never hold
 * their own copy of navigation state.
 */
export interface ShellNavigation {
  readonly dispatch: (action: ShellAction) => void;
  readonly open: (route: RouteKey, params?: RouteParams) => void;
  readonly back: (tab: TabKey) => void;
  readonly closeWindow: () => void;
  readonly openCreate: () => void;
  /** The full conditions sheet for a local day ("2026-11-25"; default today). */
  readonly openConditions: (dateKey?: string) => void;
  /** The day Schedule shows (shared so the Duo's two panes agree). */
  readonly scheduleDate: string | null;
  readonly setScheduleDate: (dateKey: string) => void;
  readonly audience: ProAudience;
  readonly unreadMessages: number;
  /** Long press on the preview notice (preview builds): the Layout lab. */
  readonly openLayoutLab: () => void;
}

export const ShellContext = createContext<ShellNavigation | null>(null);

export function useShell(): ShellNavigation {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside the Pro shell");
  return value;
}

/** The route a screen was opened with (its session, person or match). */
export const RouteEntryContext = createContext<RouteEntry | null>(null);
