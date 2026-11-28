/**
 * The pure half of the object family (S3): which SubNav items fit before
 * "More", and what a SectionNav mark says. No DOM, so native can use it.
 */

/** One tab of an area or an open object. Tabs are routes (deep-linkable). */
export interface SubNavItem {
  /** Stable id, written to `data-nav-id`. */
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** A count beside the label, like open disputes. */
  readonly count?: number;
}

/** The IA's limit: past six tabs the rest go under "More". */
export const SUB_NAV_MAX_VISIBLE = 6;

/**
 * Splits the tabs into the visible row and the "More" list. The current tab
 * is always visible: if it would fall under "More" it takes the last visible
 * place and the tab it displaces moves to the top of "More".
 */
export function splitSubNav(
  items: readonly SubNavItem[],
  current: string | undefined,
  max: number = SUB_NAV_MAX_VISIBLE,
): { visible: SubNavItem[]; overflow: SubNavItem[] } {
  const limit = Math.max(1, Math.floor(max));
  if (items.length <= limit) return { visible: [...items], overflow: [] };
  // "More" takes one place itself.
  const room = limit - 1;
  const visible = items.slice(0, room);
  const overflow = items.slice(room);
  const index = overflow.findIndex((item) => item.id === current);
  if (index === -1) return { visible, overflow };
  const promoted = overflow[index]!;
  const displaced = visible.at(-1);
  const rest = overflow.filter((_, i) => i !== index);
  return {
    visible: displaced ? [...visible.slice(0, -1), promoted] : [promoted],
    overflow: displaced ? [displaced, ...rest] : rest,
  };
}

/** A SectionNav item's completion mark (ia-hq.md). */
export type SectionMark = "done" | "in-progress" | "not-started" | "attention";

const markLabels: Record<SectionMark, string> = {
  done: "Done",
  "in-progress": "In progress",
  "not-started": "Not started",
  attention: "Needs attention",
};

/** What a mark says to a screen reader and in a tooltip. */
export function sectionMarkLabel(mark: SectionMark): string {
  return markLabels[mark];
}

/** "2 of 4 done", counted from the marks; undefined with no marks. */
export function sectionProgress(
  marks: readonly (SectionMark | undefined)[],
): { done: number; total: number; label: string } | undefined {
  const marked = marks.filter((mark): mark is SectionMark => Boolean(mark));
  if (marked.length === 0) return undefined;
  const done = marked.filter((mark) => mark === "done").length;
  return {
    done,
    total: marked.length,
    label: `${done} of ${marked.length} done`,
  };
}
