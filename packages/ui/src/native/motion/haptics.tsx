import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Haptics, through the app's own `expo-haptics` calls (the package does not
 * depend on it). Paired with the confirmation tiers (docs/plan/
 * definition-of-done.md section 4) and with a point scored.
 */
export interface HapticsAdapter {
  readonly selection: () => void;
  readonly impact: (weight: "light" | "medium" | "heavy") => void;
  readonly notification: (kind: "success" | "warning" | "error") => void;
}

/**
 * 0: reversible, low stakes (acts at once, offers Undo).
 * 1: confirm (sends, publishes, invites, notifies people).
 * 2: strong confirm (money, deleting data, many people).
 */
export type ConfirmationTier = 0 | 1 | 2;

export interface Haptics {
  /** A choice changed (segmented control, toggle, picker step). */
  readonly selection: () => void;
  /** The confirmed action of a tier completed. */
  readonly confirmed: (tier: ConfirmationTier) => void;
  /** A tier-2 action was refused or failed. */
  readonly refused: () => void;
  /** A point was scored (one light tick per point, never for an undo). */
  readonly pointScored: () => void;
}

const silent: HapticsAdapter = {
  selection: () => undefined,
  impact: () => undefined,
  notification: () => undefined,
};

/** The pairing of events to feedback. Pure; unit-tested. */
export function hapticsFor(adapter: HapticsAdapter): Haptics {
  return {
    selection: () => adapter.selection(),
    confirmed: (tier) => {
      if (tier === 0) adapter.selection();
      else if (tier === 1) adapter.impact("medium");
      else adapter.notification("success");
    },
    refused: () => adapter.notification("error"),
    pointScored: () => adapter.impact("light"),
  };
}

const HapticsContext = createContext<Haptics>(hapticsFor(silent));

export function HapticsProvider({
  adapter,
  children,
}: {
  readonly adapter: HapticsAdapter;
  readonly children?: ReactNode;
}) {
  const value = useMemo(() => hapticsFor(adapter), [adapter]);
  return (
    <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>
  );
}

/** Silent outside a provider (tests, galleries without one). */
export function useHaptics(): Haptics {
  return useContext(HapticsContext);
}
