import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * The small line set Tideline components draw themselves: 24 grid, square caps,
 * `currentColor`. Product screens keep using their own icon set for content.
 */
const paths = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  minus: "M6 12h12",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.8-3.8",
  calendar:
    "M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  alert: "M12 4l9 15.5H3L12 4zM12 10v4.5M12 17h.01",
  success: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.8 2.8L16 9.8",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  "user-plus":
    "M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 20a7 7 0 0 1 11.5-5.4M18 14v6M15 17h6",
  command:
    "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z",
  sort: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3",
  filter: "M4 6h16M7 12h10M10 18h4",
  users:
    "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 20a7 7 0 0 1 14 0M16 4.3a4 4 0 0 1 0 7.4M18.5 14.5A7 7 0 0 1 22 20",
} as const;

export type IconName = keyof typeof paths;

export interface IconProps extends Omit<ComponentProps<"svg">, "children"> {
  name: IconName;
  /** 20px (control) by default; `sm` is 16px (inline) and `lg` is 24px (navigation). */
  size?: "sm" | "md" | "lg";
}

/** A decorative line icon. Name the control it sits in, not the icon. */
export function Icon({ name, size = "md", className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={cx("td-icon", size !== "md" && `td-icon--${size}`, className)}
      focusable="false"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
