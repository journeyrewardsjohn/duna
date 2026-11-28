"use client";

import type { ComponentProps, ElementType, ReactNode } from "react";
import { usePlayOnce } from "./use-play-once";

type RevealProps = Omit<ComponentProps<"div">, "ref"> & {
  readonly as?: ElementType;
  /**
   * `rally`: the direct children Rise one after another, 120 ms apart (at
   * most eight); otherwise the block Rises as one.
   */
  readonly rally?: boolean;
  readonly children: ReactNode;
};

/**
 * Content first, motion second (spec 2.10): the block is in the server HTML
 * at rest, readable with no script. Below the fold, after hydration, it is
 * set to its start (`armed`) and Rises once when it comes into view; under
 * reduced motion, or already on screen at load, it never moves.
 */
export function Reveal({
  as: Tag = "div",
  rally = false,
  className,
  children,
  ...props
}: RevealProps) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>(0.15);
  const classes = [
    "site-reveal",
    rally ? "site-reveal--rally" : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} data-phase={phase} ref={ref} {...props}>
      {children}
    </Tag>
  );
}
