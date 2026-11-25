import { Toggle as UiToggle } from "@ui-sdk/react/toggle";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

/** `attention` needs the person; `warning` is risk; `live` is play in progress. */
export type TidelineTone =
  "info" | "positive" | "warning" | "danger" | "live" | "attention";

export type MeshName =
  "first-light" | "golden-hour" | "tidewater" | "dune" | "night-court";

export interface SurfaceProps extends ComponentProps<"div"> {
  /** One mesh per viewport, the lightest that does the job. */
  mesh: MeshName;
  radius?: "lg" | "xl" | "2xl";
}

/**
 * A named mesh ground. Text placed straight on a dark mesh takes the mesh's
 * ink; a Card, Dialog or popup placed on it keeps its own text colours.
 */
export function Surface({ mesh, radius, className, ...props }: SurfaceProps) {
  return (
    <div
      className={cx(
        "td-surface",
        radius && `td-surface--r-${radius}`,
        className,
      )}
      data-surface={mesh}
      {...props}
    />
  );
}

type CardOwnProps = {
  /** `flat` is outlined, `sunken` sits below the ground. */
  variant?: "raised" | "flat" | "sunken";
  /** Tighter padding, for dense lists. */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

export type CardProps = CardOwnProps &
  (
    | ({ href: string } & Omit<ComponentProps<"a">, "className" | "children">)
    | ({ href?: undefined } & Omit<
        ComponentProps<"div">,
        "className" | "children"
      >)
  );

/** A surface that holds one thing. With `href` the whole card is a link. */
export function Card({
  variant = "raised",
  compact = false,
  className,
  ...props
}: CardProps) {
  const classes = cx(
    "td-card",
    variant !== "raised" && `td-card--${variant}`,
    compact && "td-card--compact",
    props.href !== undefined && "td-card--link",
    className,
  );
  if (props.href !== undefined) return <a className={classes} {...props} />;
  return <div className={classes} {...props} />;
}

export interface ChipProps {
  /**
   * `status` is a state word, `taxonomy` a filter class, `identity` a person
   * or club, `metric` a label with a number. Never one generic pill.
   */
  kind?: "status" | "taxonomy" | "identity" | "metric";
  /** The meaning of a status chip. */
  tone?: TidelineTone | "neutral";
  /** An avatar in front of an identity chip. */
  avatar?: ReactNode;
  /** The number of a metric chip. */
  value?: ReactNode;
  /** Sets a metric chip's number in the sun accent. */
  sun?: boolean;
  className?: string;
  children?: ReactNode;
}

/** A small label. Its `kind` says what sort of thing it labels. */
export function Chip({
  kind = "status",
  tone = "neutral",
  avatar,
  value,
  sun = false,
  className,
  children,
}: ChipProps) {
  return (
    <span
      className={cx(
        "td-chip",
        `td-chip--${kind}`,
        kind === "status" && tone !== "neutral" && `td-chip--${tone}`,
        kind === "metric" && sun && "td-chip--sun",
        className,
      )}
    >
      {kind === "identity" && avatar ? avatar : null}
      {kind === "metric" ? (
        <>
          <span className="td-chip__label">{children}</span>
          <b className="td-chip__value">{value}</b>
        </>
      ) : (
        children
      )}
    </span>
  );
}

export interface FilterChipProps extends Omit<
  ComponentProps<typeof UiToggle>,
  "className" | "render"
> {
  className?: string;
}

/**
 * A taxonomy chip that filters: it stays pressed. UI SDK Toggle supplies
 * `aria-pressed` and the pressed state.
 */
export function FilterChip({ className, ...props }: FilterChipProps) {
  return (
    <UiToggle
      className={cx("td-chip td-chip--taxonomy td-chip--filter", className)}
      {...props}
    />
  );
}

export interface BadgeProps {
  /** `live` is for play in progress only. */
  tone?: "action" | "live";
  /** A dot with no number. Give it a `label`. */
  dot?: boolean;
  /** What the count means, for screen readers, like "unread messages". */
  label?: string;
  className?: string;
  children?: ReactNode;
}

/** A count or a dot on something else. */
export function Badge({
  tone = "action",
  dot = false,
  label,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "td-badge",
        tone === "live" && "td-badge--live",
        dot && "td-badge--dot",
        className,
      )}
    >
      {dot ? null : children}
      {label ? <span className="td-sr"> {label}</span> : null}
    </span>
  );
}

const toneIcons: Record<TidelineTone, IconName> = {
  info: "info",
  positive: "success",
  warning: "alert",
  danger: "alert",
  live: "info",
  attention: "alert",
};

export interface NoticeProps extends Omit<ComponentProps<"div">, "title"> {
  tone?: TidelineTone;
  title?: ReactNode;
  /** A button or link at the end. */
  action?: ReactNode;
  /** Full-width, square corners, for the top of a page. */
  banner?: boolean;
}

/**
 * A message in the page. It always carries words and an icon; colour only
 * repeats them. Add `role="alert"` or `role="status"` when it appears in
 * response to something the person did.
 */
export function Notice({
  tone = "info",
  title,
  action,
  banner = false,
  className,
  children,
  ...props
}: NoticeProps) {
  return (
    <div
      className={cx(
        "td-notice",
        `td-notice--${tone}`,
        banner && "td-notice--banner",
        className,
      )}
      {...props}
    >
      <Icon className="td-notice__icon" name={toneIcons[tone]} />
      <div className="td-notice__body">
        {title ? <p className="td-notice__title">{title}</p> : null}
        {children ? <div className="td-notice__text">{children}</div> : null}
      </div>
      {action ? <div className="td-notice__action">{action}</div> : null}
    </div>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** The next action: empty states invite one. */
  actions?: ReactNode;
  icon?: IconName;
  /** Sits on the Dune mesh by default; `plain` uses the current surface. */
  plain?: boolean;
  className?: string;
}

/** What a list or page says before it has anything to show. */
export function EmptyState({
  title,
  description,
  actions,
  icon = "info",
  plain = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx("td-empty", className)}
      data-surface={plain ? undefined : "dune"}
    >
      <span aria-hidden="true" className="td-empty__glyph">
        <Icon name={icon} size="lg" />
      </span>
      <p className="td-empty__title">{title}</p>
      {description ? (
        <p className="td-empty__description">{description}</p>
      ) : null}
      {actions ? <div className="td-empty__actions">{actions}</div> : null}
    </div>
  );
}
