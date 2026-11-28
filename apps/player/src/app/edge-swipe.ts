/** The edge swipe's rules (pure, so they are unit-tested without React Native). */

/** Points from the left edge where a back swipe may start (UIKit uses ~20). */
export const EDGE_WIDTH = 22;

/** Whether a released drag goes back: past a third of the width, or a flick. */
export function swipeCompletes(dx: number, vx: number, width: number): boolean {
  if (width <= 0) return false;
  if (vx > 0.5 && dx > 24) return true;
  return dx > width / 3;
}
