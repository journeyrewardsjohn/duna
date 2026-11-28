import type { CSSProperties } from "react";
import { cx } from "../base/cx";

export type WindowAvatarGround = "night-court" | "salt" | "dune";

export interface WindowAvatarProps {
  /** The place's name: the accessible name. */
  name: string;
  /** A photograph of the place (club, venue, event). */
  src?: string;
  /** What it is, read after the name ("Venue", "Tournament"). */
  kind?: string;
  /** One more fact for the accessible name ("Santa Monica"). */
  meta?: string;
  /** Size in px. Default 48. */
  size?: number;
  /** `micro` (one solid crest) below 96 px by default; `full` the three crests. */
  variant?: "micro" | "full";
  /** The ground behind the window: Night Court, Salt or Dune only. */
  ground?: WindowAvatarGround;
  /** The photo drifts a few percent, once, over 13 s. Still under reduced motion. */
  drift?: boolean;
  /** Hidden from screen readers when the name is written beside it. */
  decorative?: boolean;
  className?: string;
}

/**
 * The Duna window (brand book section 7): a place's photograph seen through
 * the shape of the mark. For clubs, venues and events at small sizes; people
 * stay in circles (`Avatar`), so a place never looks like a person. Never
 * type or a second logo inside it.
 */
export function WindowAvatar({
  name,
  src,
  kind,
  meta,
  size = 48,
  variant,
  ground = "salt",
  drift = false,
  decorative = false,
  className,
}: WindowAvatarProps) {
  const shape = variant ?? (size < 96 ? "micro" : "full");
  const label = [name, kind, meta].filter(Boolean).join(", ");
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cx(
        "td-window",
        `td-window--${shape}`,
        `td-window--${ground}`,
        drift && "td-window--drift",
        className,
      )}
      role={decorative ? undefined : "img"}
      style={{ "--td-window-size": `${size}px` } as CSSProperties}
    >
      <span aria-hidden="true" className="td-window__shape">
        {src ? (
          <img alt="" className="td-window__photo" loading="lazy" src={src} />
        ) : null}
      </span>
    </span>
  );
}
