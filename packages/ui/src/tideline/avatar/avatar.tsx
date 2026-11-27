import { Button as UiButton } from "@ui-sdk/react/button";
import {
  Avatar as UiAvatar,
  AvatarFallback as UiAvatarFallback,
  AvatarImage as UiAvatarImage,
} from "@ui-sdk/react/avatar";
import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

/** Up to two initials from a name: "Sam Rivera" is "SR", "Noor" is "N". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}

export interface AvatarProps {
  /** The person or club. Read by screen readers unless `decorative`. */
  name: string;
  src?: string;
  size?: AvatarSize;
  /** A club uses a rounded square in its own colour slot. */
  kind?: "person" | "club";
  /** Hides it from screen readers when the name is written beside it. */
  decorative?: boolean;
  className?: string;
}

/**
 * A person or club, as a photo with initials as the fallback. UI SDK Avatar
 * keeps the fallback until the image has loaded and when it fails.
 */
export function Avatar({
  name,
  src,
  size = "md",
  kind = "person",
  decorative = false,
  className,
}: AvatarProps) {
  return (
    <UiAvatar
      aria-hidden={decorative || undefined}
      className={cx(
        "td-avatar",
        size !== "md" && `td-avatar--${size}`,
        kind === "club" && "td-avatar--club",
        className,
      )}
    >
      {src ? (
        <UiAvatarImage
          alt={decorative ? "" : name}
          className="td-avatar__image"
          src={src}
        />
      ) : null}
      <UiAvatarFallback className="td-avatar__fallback">
        <span aria-hidden="true">{initialsOf(name)}</span>
        {decorative ? null : <span className="td-sr">{name}</span>}
      </UiAvatarFallback>
    </UiAvatar>
  );
}

export interface AvatarPerson {
  name: string;
  src?: string;
}

export interface AvatarStackProps {
  people: ReadonlyArray<AvatarPerson>;
  /** How many faces show before the rest are counted. */
  max?: number;
  size?: AvatarSize;
  /** Names the group, like "4 players joined". Defaults to the names. */
  label?: string;
  className?: string;
}

/** Overlapping avatars with a count for the rest. Presentational. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  label,
  className,
}: AvatarStackProps) {
  const shown = people.slice(0, Math.max(1, max));
  const rest = people.length - shown.length;
  return (
    <div
      aria-label={label ?? people.map((person) => person.name).join(", ")}
      className={cx("td-avatarstack", className)}
      role="img"
    >
      {shown.map((person, index) => (
        <Avatar
          decorative
          key={`${person.name}-${index}`}
          name={person.name}
          size={size}
          src={person.src}
        />
      ))}
      {rest > 0 ? (
        <span
          aria-hidden="true"
          className={cx(
            "td-avatar td-avatar--more",
            size !== "md" && `td-avatar--${size}`,
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

export interface AvatarLevelProps extends Omit<AvatarProps, "size"> {
  /** The rating to show, already formatted. Leave out while it is pending. */
  level?: string | null;
  /** What the number is, for screen readers. */
  levelLabel?: string;
  size?: "sm" | "md" | "lg";
  /** Text under the avatar, usually the first name. */
  caption?: ReactNode;
}

/**
 * An avatar with the player's level on an energy chip. A missing level shows
 * no chip: Tideline never prints a zero for data it does not have.
 */
export function AvatarLevel({
  level,
  levelLabel = "Sand Rating",
  size = "md",
  caption,
  className,
  ...avatar
}: AvatarLevelProps) {
  return (
    <span
      className={cx(
        "td-avlevel",
        size !== "md" && `td-avlevel--${size}`,
        className,
      )}
    >
      <span className="td-avlevel__wrap">
        <Avatar {...avatar} />
        {level ? (
          <span className="td-level">
            <span className="td-sr">{levelLabel} </span>
            {level}
          </span>
        ) : null}
      </span>
      {caption ? <span className="td-avlevel__name">{caption}</span> : null}
    </span>
  );
}

export interface PlayerSummary {
  id: string;
  name: string;
  avatarUrl?: string;
  /** A formatted level, like "4.2". Leave out while pending. */
  level?: string;
  /** A short second line, like a club or "Played together 3 times". */
  detail?: string;
}

export interface PlayerSlotProps {
  /** The player in the slot. Without one the slot is open. */
  player?: PlayerSummary;
  /** Marks the slot as the person looking at it. */
  you?: boolean;
  /** Whether this player's share is settled. `unpaid` needs the person. */
  payment?: "paid" | "unpaid";
  /** The share, already formatted, shown with `payment="unpaid"`. */
  price?: string;
  /** Text under an open slot. */
  openLabel?: string;
  /** Makes an open slot a button. */
  onAdd?: () => void;
  labels?: { you: string; paid: string; unpaid: string };
  className?: string;
}

/**
 * One place in a match or booking: a player with their level, or an open
 * spot. An open slot with `onAdd` is a button (UI SDK Button); everything
 * else is presentational. `data-state` is filled, paid, unpaid or open.
 */
export function PlayerSlot({
  player,
  you = false,
  payment,
  price,
  openLabel = "Add player",
  onAdd,
  labels = { you: "You", paid: "Paid", unpaid: "Unpaid" },
  className,
}: PlayerSlotProps) {
  if (!player) {
    const open = (
      <>
        <span aria-hidden="true" className="td-pslot__open">
          <Icon name="plus" />
        </span>
        <span className="td-avlevel__name">{openLabel}</span>
      </>
    );
    return onAdd ? (
      <UiButton
        className={cx("td-pslot", className)}
        data-state="open"
        onClick={onAdd}
      >
        {open}
      </UiButton>
    ) : (
      <span className={cx("td-pslot", className)} data-state="open">
        {open}
      </span>
    );
  }
  return (
    <span
      className={cx("td-pslot", className)}
      data-state={payment ?? "filled"}
    >
      <AvatarLevel
        caption={you ? labels.you : player.name}
        decorative
        level={player.level}
        name={player.name}
        src={player.avatarUrl}
      />
      {payment === "paid" ? (
        <span className="td-pslot__paid">
          <Icon name="check" />
          {labels.paid}
        </span>
      ) : null}
      {payment === "unpaid" ? (
        <span className="td-pslot__unpaid">
          {price ? `${price} ` : ""}
          {labels.unpaid}
        </span>
      ) : null}
    </span>
  );
}
