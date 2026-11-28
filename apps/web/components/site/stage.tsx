import type { ReactNode } from "react";
import type { SitePhoto } from "./media";
import { PhotoStage } from "./photo-stage";

/** Where a concept sits on its photograph, chosen to keep faces clear. */
export type StagePlace = "end" | "start" | "center" | "top-end" | "top-start";

interface ConceptStageProps {
  readonly photo: SitePhoto;
  /** The `sizes` the layout gives this frame. */
  readonly sizes: string;
  readonly priority?: boolean;
  readonly credit?: string;
  readonly place?: StagePlace;
  /** `tall` (a page hero, 5:6 on phones), `wide` (16:11), `square`. */
  readonly shape?: "tall" | "wide" | "square";
  readonly video?: string;
  readonly className?: string;
  /** The concept card (a `GlassCard` or a kit component on glass). */
  readonly children: ReactNode;
}

/**
 * A photograph with one product concept over it (spec 2.4, "product as
 * concept, not screenshot"). The frame is a size container: below 620 px of
 * frame width (a tablet column, a phone) the concept switches to its compact
 * variant and anchors to the bottom edge, so it never covers a face; each
 * photo's focal point keeps faces in the upper part of the frame.
 */
export function ConceptStage({
  photo,
  sizes,
  priority,
  credit,
  place = "end",
  shape = "tall",
  video,
  className,
  children,
}: ConceptStageProps) {
  return (
    <PhotoStage
      className={[
        "site-stage",
        `site-stage--${shape}`,
        `site-stage--${place}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      credit={credit}
      photo={photo}
      priority={priority}
      sizes={sizes}
      video={video}
    >
      <div className="site-stage__concept">{children}</div>
    </PhotoStage>
  );
}
