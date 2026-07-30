import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function DunaMark({
  compact = false,
  className,
}: {
  readonly compact?: boolean;
  readonly className?: string;
}) {
  return (
    <span className={["duna-mark", className].filter(Boolean).join(" ")}>
      <svg aria-hidden="true" className="duna-mark__symbol" viewBox="0 0 48 48">
        <path
          d="M5 31.5C12.8 18.2 22.4 12.1 34 13.1c3.4.3 6.4 1.2 9 2.7-8.3.2-15.4 3.1-21.2 8.7-3.1 3-5.8 6.7-8 11.1H5v-4.1Z"
          fill="currentColor"
        />
        <path
          d="M13.8 35.6c4.1-6.8 9.4-11.6 15.8-14.3 4.1-1.7 8.6-2.5 13.4-2.3-3.9 1.8-7.3 4.2-10.2 7.2-2.7 2.8-5 5.9-6.9 9.4H13.8Z"
          fill="var(--color-aqua)"
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
