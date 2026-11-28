import type { ComponentType, ReactNode } from "react";
import { InteractionsLab } from "./interactions";

/**
 * The gallery is assembled from `sections/<family>.tsx`: each file default
 * exports the examples for one component family, and `sections/index.ts`
 * lists the files. The page groups examples by `group` and sorts both groups
 * and examples by `order`, so adding a family never edits the page.
 */
export interface GalleryGroup {
  /** The section's DOM id; tests and deep links use it. */
  id: string;
  title: string;
  /** Position of the section in the page; lower comes first. */
  order: number;
  /** Optional client wrapper around the section's examples. */
  wrap?: ComponentType<{ children: ReactNode }>;
}

export interface GalleryExample {
  group: GalleryGroup;
  /** Position inside the group; lower comes first. */
  order: number;
  title: string;
  /** Spans the full row of the section grid. */
  wide?: boolean;
  content: ReactNode;
}

/**
 * The shared sections. A new family may reuse one of these or declare its own
 * group in its section file (pick an `order` that does not collide).
 */
export const galleryGroups = {
  interactions: {
    id: "interactions",
    title: "Interactions",
    order: 100,
    wrap: InteractionsLab,
  },
  controls: { id: "controls", title: "Core controls", order: 200 },
  overlays: { id: "overlays", title: "Overlays", order: 300 },
  dates: { id: "dates", title: "Dates", order: 400 },
  people: { id: "people", title: "People", order: 500 },
  loading: { id: "loading", title: "Loading", order: 600 },
  feedback: { id: "feedback", title: "Feedback and layout", order: 700 },
} satisfies Record<string, GalleryGroup>;
