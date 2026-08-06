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
      <svg aria-hidden="true" className="duna-mark__symbol" viewBox="0 0 64 48">
        <path
          className="duna-mark__horizon"
          d="M5 34H59"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <path
          className="duna-mark__ridge"
          d="M6 36.5C17.5 36.5 22.4 31.7 29.2 26.3C36.3 20.7 45 18.4 58 11.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
        />
      </svg>
      {!compact && <span className="duna-mark__word">DUNA</span>}
    </span>
  );
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
    <button
      className={[
        "duna-button",
        `duna-button--${tone}`,
        `duna-button--${size}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
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

export function Numeric({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span className={["duna-numeric", className].filter(Boolean).join(" ")}>
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
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={["duna-chip", "duna-identity", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
