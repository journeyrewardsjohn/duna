import { clubMarkModel, SALT, type ClubMarkSource } from "@duna/tideline-core";
import {
  Avatar as UiAvatar,
  AvatarFallback as UiAvatarFallback,
  AvatarImage as UiAvatarImage,
} from "@ui-sdk/react/avatar";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../base/cx";
import { CrestMark } from "../motion/crest";

/** Named sizes, 20 px inline to the 160 px hero. Or a number in px. */
export type ClubMarkSize =
  "inline" | "sm" | "md" | "lg" | "xl" | "2xl" | "hero" | number;

export const CLUB_MARK_SIZES = {
  inline: 20,
  sm: 28,
  md: 40,
  lg: 56,
  xl: 72,
  "2xl": 96,
  hero: 160,
} as const;

export type ClubState = "active" | "pending" | "archived";

export interface ClubMarkProps {
  /** The club's name: the accessible name and the monogram's source. */
  name: string;
  /** The colour the club chose for its mark's ground (`#rrggbb`). */
  color?: string | null;
  /** The club's logo mark (SVG or transparent PNG), drawn on its colour. */
  logo?: string | null;
  /** A light logo for dark grounds. */
  logoLight?: string | null;
  /** A dark logo for light grounds. */
  logoDark?: string | null;
  /** An uploaded square tile, edge to edge. */
  tile?: string | null;
  /** Force one form. Default: logo, then tile, then monogram. */
  source?: ClubMarkSource;
  size?: ClubMarkSize;
  /** The club marked its logo legible below 28 px. */
  worksSmall?: boolean;
  /**
   * Said in the accessible name, never drawn: pending and archived keep the
   * brand at full strength (contract R13). Show a chip beside it instead
   * (`ClubLockup` does).
   */
  state?: ClubState;
  /** Sitting on a photograph: a soft shadow and a faint inner hairline. */
  onPhoto?: boolean;
  /** Hidden from screen readers when the name is written beside it. */
  decorative?: boolean;
  locale?: string;
  className?: string;
}

function sizeOf(size: ClubMarkSize): number {
  return typeof size === "number" ? size : CLUB_MARK_SIZES[size];
}

/**
 * A club's identity (contract R13): its own logo on the colour it chose,
 * the full-bleed tile it uploaded, or a two-character monogram in Jost on its
 * colour. Brand owns the fill; Duna owns the frame: a square with the
 * system's proportional radius and no white border. The foreground is
 * contrast-checked in `@duna/tideline-core`. A broken or slow image shows
 * the monogram (UI SDK Avatar keeps the fallback until the image loads).
 */
export function ClubMark({
  name,
  color,
  logo,
  logoLight,
  logoDark,
  tile,
  source,
  size = "md",
  worksSmall,
  state = "active",
  onPhoto = false,
  decorative = false,
  locale,
  className,
}: ClubMarkProps) {
  const px = sizeOf(size);
  const model = clubMarkModel({
    name,
    color,
    logo,
    logoLight,
    logoDark,
    tile,
    source,
    size: px,
    worksSmall,
    locale,
  });
  const style = {
    "--td-clubmark-size": `${px}px`,
    "--td-clubmark-radius": `${model.radius}px`,
    "--td-clubmark-bg": model.background,
    "--td-clubmark-fg":
      model.foreground === SALT
        ? "var(--td-brand-salt)"
        : "var(--td-brand-night-court)",
  } as CSSProperties;
  const label = state === "active" ? name : `${name}, ${state}`;
  return (
    <UiAvatar
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cx("td-clubmark", onPhoto && "td-clubmark--photo", className)}
      data-contrast={model.contrast.passesText ? "text" : "graphics"}
      data-form={model.form}
      data-state={state}
      role={decorative ? undefined : "img"}
      style={style}
    >
      {model.src ? (
        <UiAvatarImage
          alt=""
          className={cx(
            "td-clubmark__image",
            model.form === "tile" && "td-clubmark__image--tile",
          )}
          src={model.src}
        />
      ) : null}
      <UiAvatarFallback aria-hidden="true" className="td-clubmark__monogram">
        {model.monogram ? (
          <span
            className={cx(
              "td-clubmark__letters",
              model.monogramHasNumeral && "td-clubmark__letters--numeral",
            )}
          >
            {model.monogram}
          </span>
        ) : (
          <CrestMark className="td-clubmark__crest" micro />
        )}
      </UiAvatarFallback>
    </UiAvatar>
  );
}

export interface ClubLockupProps extends Omit<ClubMarkProps, "decorative"> {
  /**
   * A facility inside a club with several: the facility leads, then the
   * club and the place ("North courts", "Sunset Beach Club · Santa Monica").
   */
  facility?: string;
  /** Where it is ("Santa Monica, CA"). */
  location?: string;
  /** Words for the state chip; defaults to "Pending" / "Archived". */
  stateText?: string;
  /** Extra content at the end (a distance, a member chip). */
  trailing?: ReactNode;
}

/**
 * The club mark with its name beside it, for headers, rows, switchers and
 * the multi-facility case. Pending and archived are said in a chip; the mark
 * itself never fades.
 */
export function ClubLockup({
  facility,
  location,
  stateText,
  trailing,
  className,
  ...mark
}: ClubLockupProps) {
  const state = mark.state ?? "active";
  const title = facility ?? mark.name;
  const detail = [facility ? mark.name : null, location]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className={cx("td-clublockup", className)}>
      <ClubMark {...mark} decorative />
      <span className="td-clublockup__text">
        <span className="td-clublockup__name" title={title}>
          {title}
        </span>
        {detail ? (
          <span className="td-clublockup__detail" title={detail}>
            {detail}
          </span>
        ) : null}
      </span>
      {state !== "active" ? (
        <span className="td-chip td-chip--status td-clublockup__state">
          {stateText ?? (state === "pending" ? "Pending" : "Archived")}
        </span>
      ) : null}
      {trailing}
    </span>
  );
}
