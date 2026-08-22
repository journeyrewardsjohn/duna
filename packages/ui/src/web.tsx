import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { DunaZone } from "./tokens";

export function DunaMark({
  compact = false,
  className,
}: {
  readonly compact?: boolean;
  readonly className?: string;
}) {
  return (
    <span className={["duna-mark", className].filter(Boolean).join(" ")}>
      {compact ? (
        <img
          alt="Duna"
          className="duna-mark__icon"
          src="/brand/duna-icon.png"
        />
      ) : (
        <>
          <img
            alt=""
            aria-hidden
            className="duna-mark__icon duna-mark__icon--compact"
            src="/brand/duna-icon.png"
          />
          <img
            alt="Duna"
            className="duna-mark__logo duna-mark__logo--blue"
            src="/brand/duna-horizontal-blue.png"
          />
          <img
            alt="Duna"
            className="duna-mark__logo duna-mark__logo--white"
            src="/brand/duna-horizontal-white.png"
          />
        </>
      )}
    </span>
  );
}

export function DunaLoader({
  label = "Opening Duna",
  variant = "plain",
}: {
  readonly label?: string;
  readonly variant?: "plain" | "player" | "pro";
}) {
  const video =
    variant === "player"
      ? "/media/launch/duna-loading.mp4"
      : variant === "pro"
        ? "/media/launch/duna-pro-loading.mp4"
        : undefined;
  return (
    <div
      aria-live="polite"
      className={`duna-loader duna-loader--${variant}`}
      role="status"
    >
      {video && (
        <video
          aria-hidden="true"
          autoPlay
          className="duna-loader__video"
          loop
          muted
          playsInline
          preload="auto"
          src={video}
        />
      )}
      <div className="duna-loader__content">
        <span aria-hidden="true" className="duna-loader__mark">
          <DunaMark compact />
        </span>
        <span className="duna-loader__label">{label}</span>
      </div>
    </div>
  );
}

export function buttonClassName({
  className,
  size = "medium",
  tone = "primary",
}: {
  readonly className?: string;
  readonly size?: "small" | "medium" | "large";
  readonly tone?: "primary" | "secondary" | "ghost" | "danger";
} = {}): string {
  return [
    "duna-button",
    `duna-button--${tone}`,
    `duna-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  children,
  tone = "primary",
  size = "medium",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly children: ReactNode;
  readonly tone?: "primary" | "secondary" | "ghost" | "danger";
  readonly size?: "small" | "medium" | "large";
}) {
  return (
    <button className={buttonClassName({ className, size, tone })} {...props}>
      {children}
    </button>
  );
}

export function PageHeader({
  actions,
  children,
  className,
  description,
  eyebrow,
  title,
}: {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
}) {
  return (
    <header
      className={["duna-page-header", className].filter(Boolean).join(" ")}
    >
      <div className="duna-page-header__copy">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="duna-page-header__actions">{actions}</div>}
    </header>
  );
}

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Avatar({
  className,
  name,
  size = "medium",
  src,
}: {
  readonly className?: string;
  readonly name: string;
  readonly size?: "small" | "medium" | "large";
  readonly src?: string;
}) {
  return (
    <span
      aria-label={name}
      className={["duna-avatar", `duna-avatar--${size}`, className]
        .filter(Boolean)
        .join(" ")}
      role="img"
      title={name}
    >
      {src ? <img alt="" aria-hidden src={src} /> : initialsFor(name)}
    </span>
  );
}

export function AvatarStack({
  className,
  people,
  total = people.length,
}: {
  readonly className?: string;
  readonly people: readonly { name: string; src?: string }[];
  readonly total?: number;
}) {
  const visible = people.slice(0, 4);
  const remaining = Math.max(0, total - visible.length);
  return (
    <span
      aria-label={`${total} ${total === 1 ? "person" : "people"}`}
      className={["duna-avatar-stack", className].filter(Boolean).join(" ")}
    >
      {visible.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          size="small"
          src={person.src}
        />
      ))}
      {remaining > 0 && (
        <span className="duna-avatar-stack__more">+{remaining}</span>
      )}
    </span>
  );
}

export function StatCard({
  icon,
  label,
  value,
}: {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly value: ReactNode;
}) {
  return (
    <article className="duna-stat-card">
      {icon && <span className="duna-stat-card__icon">{icon}</span>}
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

export function EmptyState({
  action,
  description,
  icon,
  title,
}: {
  readonly action?: ReactNode;
  readonly description: ReactNode;
  readonly icon?: ReactNode;
  readonly title: ReactNode;
}) {
  return (
    <div className="duna-empty-state">
      {icon && <span className="duna-empty-state__icon">{icon}</span>}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ProgressBar({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <span
      aria-label={`${label}: ${bounded}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={bounded}
      className="duna-progress"
      role="progressbar"
    >
      <i style={{ width: `${bounded}%` }} />
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "live" | "positive" | "warning" | "danger";
  readonly className?: string;
}) {
  return (
    <span
      className={["duna-badge", `duna-badge--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function Surface({
  children,
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly interactive?: boolean;
}) {
  return (
    <div
      className={[
        "duna-surface",
        interactive && "duna-surface--interactive",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export type NumericTier =
  "score" | "monument" | "hero" | "block" | "table" | "chip";

export function Numeric({
  children,
  className,
  tier = "table",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  readonly tier?: NumericTier;
}) {
  return (
    <span
      className={["duna-numeric", `duna-numeric--${tier}`, className]
        .filter(Boolean)
        .join(" ")}
      data-numeric-tier={tier}
      {...props}
    >
      {children}
    </span>
  );
}

export function Zone({
  children,
  className,
  zone,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly zone: DunaZone;
}) {
  return (
    <div
      className={["duna-zone", className].filter(Boolean).join(" ")}
      data-zone={zone}
      {...props}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
  live = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly live?: boolean;
}) {
  return (
    <span
      className={["duna-eyebrow", live && "duna-eyebrow--live", className]
        .filter(Boolean)
        .join(" ")}
    >
      {live && <span aria-hidden className="duna-live-dot" />}
      {children}
    </span>
  );
}

export function StatusPill({
  children,
  className,
  state = "upcoming",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly state?: "live" | "upcoming" | "final" | "cancelled" | "pending";
}) {
  return (
    <span
      className={[
        "duna-chip",
        "duna-status",
        `duna-status--${state}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {state === "live" && <span aria-hidden className="duna-live-dot" />}
      {children}
    </span>
  );
}

export function TaxonomyChip({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={["duna-chip", "duna-taxonomy", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function MetricChip({
  children,
  className,
  urgent = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly urgent?: boolean;
}) {
  return (
    <span
      className={[
        "duna-chip",
        "duna-metric",
        urgent && "duna-metric--urgent",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function IdentityChip({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  readonly children: ReactNode;
}) {
  return (
    <span
      className={["duna-chip", "duna-identity", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
