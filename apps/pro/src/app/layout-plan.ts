/**
 * How the Pro shell arranges itself for a resolved layout (M-R0). Pure: it
 * reads only the resolver's width class, mode and pane count
 * (`@duna/ui/native/layout`), never a device name, idiom or orientation.
 * Tested per size class and posture in `shell.test.ts`.
 */
import type { ResolvedLayout } from "@duna/ui/native/layout";

export type LayoutFacts = Pick<
  ResolvedLayout,
  "widthClass" | "mode" | "paneCount"
>;

/**
 * Today's and Schedule's arrangement:
 * - `stack`: one column (iPhone, the closed Duo, narrow iPad windows);
 * - `split`: the day on the left, what is later and on court on the right
 *   (the open Duo, iPad at half width);
 * - `dashboard`: the split plus a third column for the courts when the
 *   window is wide enough (iPad full screen);
 * - `tabletop`: the Duo propped half-open: what to watch (up next, the
 *   agenda) on the top pane, the controls (actions, the day strip) on the
 *   bottom pane, nothing scrolling across the fold.
 */
export type DayArrangement = "stack" | "split" | "dashboard" | "tabletop";

export function dayArrangement(layout: LayoutFacts): DayArrangement {
  if (layout.mode === "tabletop") return "tabletop";
  if (layout.paneCount >= 3) return "dashboard";
  if (layout.paneCount === 2) return "split";
  return "stack";
}

export interface ShellPlan {
  readonly day: DayArrangement;
  /** Tab roots show their hub and a detail side by side. */
  readonly sideBySide: boolean;
  /** With nothing chosen, a tab's default route fills the second pane. */
  readonly showDefaultDetail: boolean;
  /** Pushed details show a Back control (one pane at a time). */
  readonly showBack: boolean;
  /** The courts (matches, live first) move to the third column. */
  readonly courtsInInspector: boolean;
}

export function shellPlan(layout: LayoutFacts): ShellPlan {
  const day = dayArrangement(layout);
  const sideBySide = layout.mode === "split" && layout.paneCount >= 2;
  return {
    day,
    sideBySide,
    showDefaultDetail: sideBySide,
    showBack: !sideBySide,
    courtsInInspector: day === "dashboard",
  };
}

/**
 * Today's quick actions: four across on the half-open Duo's bottom pane and
 * in any pane at least 560 pt wide, else two across.
 */
export function actionColumnsFor(
  paneWidth: number,
  arrangement: DayArrangement,
): 2 | 4 {
  return arrangement === "tabletop" || paneWidth >= 560 ? 4 : 2;
}
