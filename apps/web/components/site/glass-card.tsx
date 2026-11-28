import type { ComponentProps, ReactNode } from "react";

interface GlassCardProps extends Omit<ComponentProps<"div">, "title"> {
  /** The small uppercase label at the top left. */
  readonly label?: ReactNode;
  /** A status chip at the top right. */
  readonly status?: ReactNode;
  /** Marks the numbers as an example (signed out, demo data). */
  readonly example?: boolean;
  readonly children: ReactNode;
}

/**
 * Glass over a photograph (spec 2.9): Night Court at 74%, an 18 px blur, a
 * 1 px Salt hairline at 16%, radius 18, in both themes. It is its own
 * design-system scope in the dark theme, because it always sits on a photo,
 * so every kit component inside it reads light-on-dark.
 */
export function GlassCard({
  label,
  status,
  example = false,
  children,
  className,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={className ? `td site-glass ${className}` : "td site-glass"}
      data-theme="dark"
      {...props}
    >
      {label || status || example ? (
        <div className="site-glass__head">
          {label ? <span className="site-label">{label}</span> : null}
          <span className="site-glass__chips">
            {example ? <span className="site-example">Example</span> : null}
            {status ? (
              <span className="site-glass__status">
                <i aria-hidden="true" />
                {status}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
