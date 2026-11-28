/**
 * How the Player shell arranges itself for a resolved layout (M-P0). Pure:
 * it reads only the resolver's width class, mode and pane count
 * (`@duna/ui/native/layout`), never a device name, idiom or orientation.
 * Tested per size class and posture in `layout-plan.test.ts`.
 */
import type { ResolvedLayout } from "@duna/ui/native/layout";

export type LayoutFacts = Pick<
  ResolvedLayout,
  "widthClass" | "mode" | "paneCount"
>;

/**
 * Home's arrangement:
 * - `stack`: one column (iPhone, the closed Duo, narrow iPad windows);
 * - `split`: "what now" on the left, "what's coming and how am I doing" on
 *   the right (the open Duo, iPad at half width; board DUO-Open-Home);
 * - `dashboard`: the split plus a third column for your game when the window
 *   is wide enough (iPad full screen; board IPAD-Home);
 * - `tabletop`: the Duo propped half-open: next up and its conditions on the
 *   top pane, the primary actions on the bottom pane, nothing scrolling
 *   across the fold.
 */
export type HomeArrangement = "stack" | "split" | "dashboard" | "tabletop";

export function homeArrangement(layout: LayoutFacts): HomeArrangement {
  if (layout.mode === "tabletop") return "tabletop";
  if (layout.paneCount >= 3) return "dashboard";
  if (layout.paneCount === 2) return "split";
  return "stack";
}

export interface ShellPlan {
  readonly home: HomeArrangement;
  /** Tab roots show their hub and a detail side by side. */
  readonly sideBySide: boolean;
  /** With nothing chosen, a tab's default route fills the second pane. */
  readonly showDefaultDetail: boolean;
  /** Pushed details show a Back control (one pane at a time). */
  readonly showBack: boolean;
  /** Your game moves to the third (inspector) column. */
  readonly gameInInspector: boolean;
}

export function shellPlan(layout: LayoutFacts): ShellPlan {
  const home = homeArrangement(layout);
  const sideBySide = layout.mode === "split" && layout.paneCount >= 2;
  return {
    home,
    sideBySide,
    showDefaultDetail: sideBySide,
    showBack: !sideBySide,
    gameInInspector: home === "dashboard",
  };
}
